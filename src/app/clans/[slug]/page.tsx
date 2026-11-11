import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, gt } from "drizzle-orm";
import { db, schema } from "@/db";
import { joinClan, leaveClan } from "@/app/clan-actions";
import { ClanAvatar } from "@/components/clan-avatar";
import { ClanMemberGrid } from "@/components/clan-member-list";
import { Card, Pill, btnGhost, btnPrimary, btnSecondary } from "@/components/ui";
import { fmtDay } from "@/lib/format";
import { clanRole, getClanBySlug } from "@/lib/clans";
import { pickNick } from "@/lib/lans";
import { avatarData } from "@/lib/avatars";
import { requireUser } from "@/lib/session";
import { missingServers } from "@/lib/discord-invite";

export default async function ClanPage({ params }: PageProps<"/clans/[slug]">) {
  const { slug } = await params;
  const me = await requireUser();
  const c = getClanBySlug(slug);
  if (!c) notFound();
  const role = clanRole(me.id, c.id);
  const isMember = role === "admin" || role === "member";
  const isAdmin = role === "admin" || me.role === "admin";

  const members = db
    .select({ u: schema.user, role: schema.clanMember.role })
    .from(schema.clanMember)
    .innerJoin(schema.user, eq(schema.user.id, schema.clanMember.userId))
    .where(eq(schema.clanMember.clanId, c.id))
    .all()
    .filter((m) => m.role !== "pending");
  const nicks = db.select().from(schema.nickname).all();
  // Members who aren't on the clan's Discord server(s) yet get an invite.
  const discordInvites = isMember ? await missingServers(me.id, c.id) : [];
  const lans =
    isMember || isAdmin
      ? db
          .select()
          .from(schema.lan)
          .where(and(eq(schema.lan.clanId, c.id), gt(schema.lan.endsAt, new Date())))
          .orderBy(asc(schema.lan.startsAt))
          .all()
      : [];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center gap-4">
        <ClanAvatar clan={c} size={72} />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">{c.name}</h1>
          <p className="text-sm text-muted">{members.length} members</p>
        </div>
      </div>
      {c.description && <p className="whitespace-pre-wrap text-fg/90">{c.description}</p>}

      <div className="flex flex-wrap gap-2">
        {isAdmin && (
          <>
            <Link href={`/clans/${c.slug}/lans/new`} className={btnPrimary}>
              New event
            </Link>
            <Link href={`/clans/${c.slug}/stats`} className={btnSecondary}>
              Stats
            </Link>
            <Link href={`/clans/${c.slug}/settings`} className={btnSecondary}>
              Clan settings
            </Link>
          </>
        )}
        {!role && c.joinPolicy !== "invite" && (
          <form action={joinClan.bind(null, c.id)}>
            <button className={btnPrimary}>{c.joinPolicy === "open" ? "Join" : "Ask to join"}</button>
          </form>
        )}
        {role === "pending" && <Pill tone="amber">Waiting for an admin to approve you</Pill>}
        {role && (
          <form action={leaveClan.bind(null, c.id)} className="sm:ml-auto">
            <button className={`${btnGhost} hover:!text-danger`}>{role === "pending" ? "Cancel request" : "Leave clan"}</button>
          </form>
        )}
      </div>

      {discordInvites.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#5865F2]/40 bg-[#5865F2]/10 p-4">
          <p className="min-w-0 flex-1 text-sm">
            <span className="font-semibold">{c.name} is on Discord.</span>{" "}
            <span className="text-muted">Join the server for LAN news, reminders and to answer right from Discord.</span>
          </p>
          {discordInvites.map((sv) => (
            <a
              key={sv.guildId}
              href={sv.inviteUrl!}
              target="_blank"
              rel="noreferrer"
              className={`${btnPrimary} !bg-[#5865F2] !text-white hover:!bg-[#4752c4]`}
            >
              Join {discordInvites.length > 1 && sv.guildName ? sv.guildName : "our Discord"}
            </a>
          ))}
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {(isMember || isAdmin) && (
        <Card title="Upcoming events">
          {lans.length === 0 ? (
            <p className="text-sm text-muted">Nothing planned yet. Admins add the next LAN with “New event”.</p>
          ) : (
            <ul className="space-y-1">
              {lans.map((l) => (
                <li key={l.id}>
                  <Link href={`/lans/${l.id}`} className="-mx-2 flex min-h-12 items-center justify-between gap-2 rounded-md p-2 transition hover:bg-raised">
                    <span className="truncate font-medium">{l.name}</span>
                    <span className="shrink-0 text-sm text-muted">{fmtDay(l.startsAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <Card title={`Members (${members.length})`}>
        <ClanMemberGrid
          slug={c.slug}
          members={members
            .map((m) => ({
              id: m.u.id,
              admin: m.role === "admin",
              nick: pickNick(nicks.filter((n) => n.userId === m.u.id), { lanId: null, typeId: null }, m.u.name),
              avatar: avatarData(m.u),
            }))
            .sort((a, b) => a.nick.localeCompare(b.nick))}
        />
      </Card>
      </div>
    </div>
  );
}
