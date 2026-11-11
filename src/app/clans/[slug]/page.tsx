import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, gt } from "drizzle-orm";
import { db, schema } from "@/db";
import { joinClan, leaveClan } from "@/app/clan-actions";
import { ClanAvatar } from "@/components/clan-avatar";
import { Card, Pill, btnGhost, btnPrimary, btnSecondary } from "@/components/ui";
import { fmtDay } from "@/lib/format";
import { clanRole, getClanBySlug } from "@/lib/clans";
import { pickNick } from "@/lib/lans";
import { requireUser } from "@/lib/session";

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
    <div className="mx-auto max-w-3xl space-y-6">
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

      <Card title="Members">
        <ul className="grid gap-1 sm:grid-cols-2">
          {members
            .map((m) => ({ ...m, nick: pickNick(nicks.filter((n) => n.userId === m.u.id), { lanId: null, typeId: null }, m.u.name) }))
            .sort((a, b) => a.nick.localeCompare(b.nick))
            .map((m) => (
              <li key={m.u.id} className="flex min-h-10 items-center justify-between gap-2 rounded-bit bg-raised/60 px-3 py-1.5 text-sm">
                <span className="truncate">{m.nick}</span>
                {m.role === "admin" && <Pill tone="emerald">admin</Pill>}
              </li>
            ))}
        </ul>
      </Card>
    </div>
  );
}
