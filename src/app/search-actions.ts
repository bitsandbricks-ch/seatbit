"use server";
import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { getT } from "@/i18n/server";
import { avatarData, type AvatarData } from "@/lib/avatars";
import { myClans } from "@/lib/clans";
import { lanWeekday } from "@/lib/format";
import { getDefaultNames } from "@/lib/lans";
import { nameMatches } from "@/lib/names";
import { requireUser, visibleLans } from "@/lib/session";

const { lan, clanMember, user } = schema;

export type SearchHit = {
  kind: "event" | "clan" | "person";
  id: string;
  title: string;
  sub: string;
  href: string;
  avatar?: AvatarData;
};

const PER_KIND = 6;

/**
 * Quick search (Ctrl+K): events, clans and people the caller can already see, nothing more.
 * Everything comes from their own clans, so results never reveal other clans' data.
 */
export async function quickSearch(q: string): Promise<SearchHit[]> {
  const me = await requireUser();
  const query = String(q ?? "").trim().slice(0, 80);
  if (!query) return [];
  const t = await getT();
  const clans = myClans(me.id);
  if (!clans.length) return [];
  const clanIds = clans.map((c) => c.clan.id);
  const clanName = new Map(clans.map((c) => [c.clan.id, c.clan.name]));

  const clanHits: SearchHit[] = clans
    .filter((c) => nameMatches(c.clan.name, query))
    .slice(0, PER_KIND)
    .map((c) => ({ kind: "clan", id: c.clan.id, title: c.clan.name, sub: t("search.clan"), href: `/clans/${c.clan.slug}` }));

  const now = Date.now();
  const events: SearchHit[] = visibleLans(me, db.select().from(lan).where(inArray(lan.clanId, clanIds)).orderBy(desc(lan.startsAt)).all())
    .filter((l) => nameMatches(`${l.name} ${l.location}`, query))
    // Upcoming first (soonest on top), then past ones (latest on top).
    .sort((a, b) => {
      const ua = +a.endsAt >= now;
      const ub = +b.endsAt >= now;
      if (ua !== ub) return ua ? -1 : 1;
      return ua ? +a.startsAt - +b.startsAt : +b.startsAt - +a.startsAt;
    })
    .slice(0, PER_KIND)
    .map((l) => ({
      kind: "event",
      id: l.id,
      title: l.name,
      sub: [lanWeekday(l, t.locale), l.clanId && clans.length > 1 ? clanName.get(l.clanId) : l.location].filter(Boolean).join(" · "),
      href: `/lans/${l.id}`,
    }));

  // People: members of my clans, shown as each clan shows names; the first shared clan links the profile.
  const members = db
    .select({ userId: clanMember.userId, clanId: clanMember.clanId })
    .from(clanMember)
    .innerJoin(user, eq(user.id, clanMember.userId))
    .where(and(inArray(clanMember.clanId, clanIds), ne(clanMember.role, "pending"), isNull(user.deletedAt)))
    .all();
  const firstClan = new Map<string, string>();
  for (const m of members) if (!firstClan.has(m.userId)) firstClan.set(m.userId, m.clanId);
  const ids = [...firstClan.keys()];
  const full = getDefaultNames(ids, "full");
  const people: SearchHit[] = [];
  const users = new Map(ids.length ? db.select().from(user).where(inArray(user.id, ids)).all().map((u) => [u.id, u]) : []);
  for (const c of clans) {
    const mine = ids.filter((id) => firstClan.get(id) === c.clan.id);
    const shown = getDefaultNames(mine, c.clan.nameDisplay);
    for (const id of mine) {
      const f = full.get(id);
      if (!f || !nameMatches(`${f.full} ${f.nick}`, query)) continue;
      const u = users.get(id);
      people.push({
        kind: "person",
        id,
        title: shown.get(id)?.label ?? f.label,
        sub: c.clan.name,
        href: `/clans/${c.clan.slug}/members/${id}`,
        avatar: u ? avatarData(u) : undefined,
      });
    }
  }
  return [...events, ...people.slice(0, PER_KIND), ...clanHits];
}
