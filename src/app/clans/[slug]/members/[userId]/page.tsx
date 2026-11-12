import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Attendance, Lan } from "@/db/schema";
import { CopyField } from "@/components/copy-field";
import { MemberAdminActions } from "@/components/member-admin-actions";
import { Card, Page, PageHeader, Pill, StatTile, StatusBadge, columns, stack } from "@/components/ui";
import { canManageClan, getClanBySlug, isClanMember } from "@/lib/clans";
import { fmtDate, fmtWeekday } from "@/lib/format";
import { pickNick } from "@/lib/lans";
import { personLabel } from "@/lib/names";
import { appUrl } from "@/lib/mail";
import { Avatar } from "@/components/avatar";
import { avatarData } from "@/lib/avatars";
import { pct } from "@/lib/clan-stats";
import { isLanManager, requireUser } from "@/lib/session";

export default async function MemberProfilePage({ params }: PageProps<"/clans/[slug]/members/[userId]">) {
  const { slug, userId } = await params;
  const me = await requireUser();
  const c = getClanBySlug(slug);
  if (!c) notFound();
  if (!isClanMember(me.id, c.id) && me.role !== "admin") notFound();
  const membership = db
    .select()
    .from(schema.clanMember)
    .where(and(eq(schema.clanMember.clanId, c.id), eq(schema.clanMember.userId, userId)))
    .get();
  if (!membership || membership.role === "pending") notFound();
  const u = db.select().from(schema.user).where(eq(schema.user.id, userId)).get();
  if (!u) notFound();

  const isSelf = me.id === u.id;
  const isManager = canManageClan(me, c.id);
  // Private bits (email, LAN IDs, tickets): clan admins and the person themselves.
  const seesPrivate = isManager || isSelf;
  const now = new Date();

  const nicks = db.select().from(schema.nickname).where(eq(schema.nickname.userId, u.id)).all();
  const defaultNick = pickNick(nicks, { lanId: null, typeId: null }, "");
  const types = db
    .select()
    .from(schema.lanType)
    .where(eq(schema.lanType.clanId, c.id))
    .orderBy(asc(schema.lanType.name))
    .all();
  const lanAccounts = seesPrivate
    ? db.select().from(schema.lanAccount).where(eq(schema.lanAccount.userId, u.id)).all()
    : [];
  const typeRows = types
    .map((t) => ({
      type: t,
      nick: nicks.find((n) => n.typeId === t.id && n.isPrimary)?.nick ?? nicks.find((n) => n.typeId === t.id)?.nick,
      lanId: lanAccounts.find((a) => a.typeId === t.id)?.value,
    }))
    .filter((r) => r.nick || r.lanId);

  const lans = db.select().from(schema.lan).where(eq(schema.lan.clanId, c.id)).orderBy(asc(schema.lan.startsAt)).all();
  const rows = db.select().from(schema.attendance).where(eq(schema.attendance.userId, u.id)).all();
  const seats = db.select().from(schema.seat).where(eq(schema.seat.userId, u.id)).all();
  // Events they were asked for: those after they joined, plus any they answered.
  const theirs = lans.filter((l) => l.startsAt >= membership.createdAt || rows.some((r) => r.lanId === l.id));
  const events = theirs.map((l) => {
    const a = rows.find((r) => r.lanId === l.id) ?? null;
    const s = seats.find((x) => x.lanId === l.id);
    const seatVisible = !!s && (!!l.seatsPublishedAt || isSelf || isManager || isLanManager(me, l.id));
    return {
      lan: l,
      a,
      seat: seatVisible ? s!.label : null,
      nick: pickNick(nicks, { lanId: l.id, typeId: l.typeId }, u.name),
      typeName: types.find((t) => t.id === l.typeId)?.name,
    };
  });
  const upcoming = events.filter((e) => e.lan.endsAt >= now);
  const past = events.filter((e) => e.lan.endsAt < now).reverse();
  const attended = past.filter((e) => e.a?.status === "going").length;
  const answeredPast = past.filter((e) => e.a).length;

  const admins = db
    .select()
    .from(schema.clanMember)
    .where(and(eq(schema.clanMember.clanId, c.id), eq(schema.clanMember.role, "admin")))
    .all().length;
  const discord = isManager
    ? db
        .select()
        .from(schema.account)
        .where(and(eq(schema.account.userId, u.id), eq(schema.account.providerId, "discord")))
        .get()
    : undefined;
  const role = membership.role === "admin" ? "admin" : "member";
  const avatar = avatarData(u);

  return (
    <Page>
      <PageHeader
        back={{ href: `/clans/${c.slug}`, label: c.name }}
        avatar={<Avatar data={avatar} size={56} />}
        title={personLabel(u, defaultNick)}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {role === "admin" && <Pill tone="emerald">admin</Pill>}
            {u.isGuest && <Pill>guest · no login yet</Pill>}
            <span>in the clan since {fmtWeekday(membership.createdAt)}</span>
          </span>
        }
      />

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <StatTile label="LANs attended" value={String(attended)} sub={past.length ? `of ${past.length} past` : "no past events"} />
        <StatTile label="Answered" value={pct(answeredPast, past.length)} sub="of past events" />
        <StatTile
          label="Coming next"
          value={String(upcoming.filter((e) => e.a?.status === "going").length)}
          sub={`of ${upcoming.length} upcoming`}
        />
      </div>

      <div className={columns}>
        <div className={`min-w-0 ${stack}`}>
          <Card title="Upcoming events">
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted">Nothing planned.</p>
            ) : (
              <EventList events={upcoming} showTicket={seesPrivate} />
            )}
          </Card>
          <Card title="Past events">
            {past.length === 0 ? (
              <p className="text-sm text-muted">No past events since joining.</p>
            ) : (
              <EventList events={past} showTicket={seesPrivate} past />
            )}
          </Card>
        </div>

        <div className={`min-w-0 ${stack}`}>
          <Card title="Nicks">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Default</dt>
                <dd className="truncate font-medium">{defaultNick || "—"}</dd>
              </div>
              {typeRows.map((r) => (
                <div key={r.type.id} className="flex justify-between gap-3">
                  <dt className="text-muted">{r.type.name}</dt>
                  <dd className="min-w-0 text-right">
                    <span className="block truncate font-medium">{r.nick ?? defaultNick ?? "—"}</span>
                    {r.lanId && <span className="block truncate text-xs text-faint">ID {r.lanId}</span>}
                  </dd>
                </div>
              ))}
            </dl>
            {seesPrivate && typeRows.some((r) => r.lanId) && (
              <p className="mt-3 text-xs text-faint">LAN IDs are only shown to clan admins and {isSelf ? "you" : "the member"}.</p>
            )}
          </Card>

          {seesPrivate && (
            <Card title="Contact">
              <dl className="space-y-2 text-sm">
                {u.isGuest ? (
                  <>
                    <Row label="Email">{u.inviteEmail ?? "not known"}</Row>
                    <Row label="Invite">
                      {u.invitedAt ? `mailed ${fmtDate(u.invitedAt)}` : u.inviteEmail ? "not sent yet" : "no email, send the link"}
                    </Row>
                  </>
                ) : (
                  <>
                    <Row label="Email">
                      <a href={`mailto:${u.email}`} className="text-bit hover:underline">
                        {u.email}
                      </a>
                    </Row>
                    {isManager && <Row label="Discord">{discord ? "linked" : "not linked"}</Row>}
                  </>
                )}
              </dl>
              {u.isGuest && isManager && u.claimCode && (
                <div className="mt-3 space-y-1">
                  <p className="text-xs text-muted">Claim link: whoever opens it takes over this guest.</p>
                  <CopyField value={`${appUrl}/claim/${u.claimCode}`} />
                </div>
              )}
              <p className="mt-3 text-xs text-faint">Only clan admins{isSelf && !isManager ? " and you" : ""} see this.</p>
            </Card>
          )}

          {isManager && (
            <Card title="Clan role">
              <MemberAdminActions
                clanId={c.id}
                slug={c.slug}
                userId={u.id}
                name={u.name}
                role={role}
                isGuest={u.isGuest}
                isSelf={isSelf}
                lastAdmin={role === "admin" && admins <= 1}
              />
            </Card>
          )}
        </div>
      </div>
    </Page>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right">{children}</dd>
    </div>
  );
}

function EventList({
  events,
  showTicket,
  past,
}: {
  events: { lan: Lan; a: Attendance | null; seat: string | null; nick: string; typeName?: string }[];
  showTicket: boolean;
  past?: boolean;
}) {
  return (
    <ul className="divide-y divide-line">
      {events.map(({ lan: l, a, seat, nick, typeName }) => (
        <li key={l.id}>
          <Link href={`/lans/${l.id}`} className="-mx-2 flex min-h-14 items-center justify-between gap-3 rounded-md p-2 transition hover:bg-raised">
            <span className="min-w-0">
              <span className="block truncate font-medium">{l.name}</span>
              <span className="block truncate text-xs text-muted">
                {fmtWeekday(l.startsAt)}
                {typeName && ` · ${typeName}`}
                {a?.status === "going" && ` · as ${nick}`}
              </span>
            </span>
            <span className="flex shrink-0 flex-wrap justify-end gap-1">
              {past && a?.status === "going" ? (
                <Pill tone="emerald">{seat ? `Attended · ${seat}` : "Attended"}</Pill>
              ) : past && !a ? (
                <Pill>No answer</Pill>
              ) : (
                <StatusBadge status={a?.status} seat={seat} />
              )}
              {showTicket &&
                !past &&
                a &&
                a.status !== "declined" &&
                (a.paid ? <Pill tone="emerald">ticket ok</Pill> : a.ticketBought ? <Pill tone="amber">reported</Pill> : <Pill tone="red">no ticket</Pill>)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
