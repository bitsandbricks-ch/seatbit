import { isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { Card, Page, PageHeader } from "@/components/ui";
import { getT } from "@/i18n/server";
import { avatarData } from "@/lib/avatars";
import { discordStates } from "@/lib/discord-verify";
import { fmtWeekday } from "@/lib/format";
import { getDefaultNames } from "@/lib/lans";
import { STAFF_ROLES, isStaff } from "@/lib/platform-roles";
import { requirePlatform } from "@/lib/session";
import { UserAdminActions } from "../user-admin-actions";
import { AdminUserList, type AdminUserRow } from "./user-list";

/** Admin → Users: every account on the instance, searchable, with role and suspension per row. */
export default async function AdminUsersPage() {
  const me = await requirePlatform("view");
  const t = await getT();
  // Deleted accounts only stay as empty rows for past events; they aren't users any more.
  const users = db.select().from(schema.user).where(isNull(schema.user.deletedAt)).all();
  const ids = users.map((u) => u.id);
  const names = getDefaultNames(ids);
  const discord = discordStates(ids);
  const clans = db.select({ id: schema.clan.id, name: schema.clan.name }).from(schema.clan).all();
  const memberCount = new Map(
    db
      .select({ userId: schema.clanMember.userId, n: sql<number>`count(*)` })
      .from(schema.clanMember)
      .where(sql`${schema.clanMember.role} <> 'pending'`)
      .groupBy(schema.clanMember.userId)
      .all()
      .map((r) => [r.userId, r.n]),
  );
  const lastDay = new Map(
    db
      .select({ userId: schema.userActivity.userId, day: sql<string>`max(${schema.userActivity.day})` })
      .from(schema.userActivity)
      .groupBy(schema.userActivity.userId)
      .all()
      .map((r) => [r.userId, r.day]),
  );
  const nicks = db.select({ userId: schema.nickname.userId, nick: schema.nickname.nick }).from(schema.nickname).all();

  const rows: AdminUserRow[] = users.map((u) => {
    const name = names.get(u.id)?.full ?? u.name;
    const day = lastDay.get(u.id) ?? "";
    const guestClan = clans.find((c) => c.id === u.guestClanId)?.name;
    return {
      id: u.id,
      name,
      search: [name, u.isGuest ? u.inviteEmail : u.email, u.discordUsername, ...nicks.filter((n) => n.userId === u.id).map((n) => n.nick)]
        .filter(Boolean)
        .join(" "),
      sub: u.isGuest ? t("adminUsers.guestOf", { clan: guestClan ?? "—" }) : u.email,
      avatar: avatarData(u),
      role: isStaff(u) ? t(`platformRoles.name.${u.role as (typeof STAFF_ROLES)[number]}`) : undefined,
      isStaff: isStaff(u),
      isGuest: u.isGuest,
      suspended: !!u.suspendedAt,
      discord: discord.get(u.id),
      clans: memberCount.get(u.id) ?? 0,
      lastActive: day ? fmtWeekday(new Date(`${day}T12:00:00`), t.locale) : null,
      lastDay: day,
      createdAt: u.createdAt.getTime(),
      actions: <UserAdminActions t={t} me={me} u={u} name={name} />,
    };
  });

  return (
    <Page>
      <PageHeader title={t("admin.users")} subtitle={t("adminUsers.subtitle")} />
      <Card>
        <AdminUserList users={rows} />
      </Card>
    </Page>
  );
}
