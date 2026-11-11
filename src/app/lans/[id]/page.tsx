import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { AttendanceButtons } from "@/components/attendance-buttons";
import { NickManager } from "@/components/nick-manager";
import { SeatMap } from "@/components/seat-map";
import { Card, Pill, StatusBadge, btnSecondary } from "@/components/ui";
import { fmtDate, relative } from "@/lib/format";
import { getDisplayNames, getLan, pickNick, signupClosed } from "@/lib/lans";
import { canViewLan, isLanManager, requireUser } from "@/lib/session";
import { getClan } from "@/lib/clans";
import { ClanAvatar } from "@/components/clan-avatar";
import { buildChecklist, progress } from "@/lib/checklist";
import { LanChecklist } from "@/components/lan-checklist";
import { SeatWishes } from "@/components/seat-wishes";

const { attendance, seat, nickname } = schema;

export default async function LanPage({ params }: PageProps<"/lans/[id]">) {
  const { id } = await params;
  const me = await requireUser();
  const l = getLan(id);
  if (!l || !canViewLan(me, id)) notFound();
  const lanClan = l.clanId ? getClan(l.clanId) : undefined;
  const now = new Date();

  const rows = db.select().from(attendance).where(eq(attendance.lanId, id)).all();
  const seats = db.select().from(seat).where(eq(seat.lanId, id)).all();
  const myNicks = db.select().from(nickname).where(eq(nickname.userId, me.id)).all();
  const lanType = l.typeId ? db.select().from(schema.lanType).where(eq(schema.lanType.id, l.typeId)).get() : undefined;
  const orgaIds = db.select().from(schema.lanOrga).where(eq(schema.lanOrga.lanId, id)).all().map((o) => o.userId);
  const orgas = orgaIds.length
    ? db.select().from(schema.user).where(inArray(schema.user.id, orgaIds)).all()
    : db
        .select({ u: schema.user })
        .from(schema.clanMember)
        .innerJoin(schema.user, eq(schema.user.id, schema.clanMember.userId))
        .where(and(eq(schema.clanMember.clanId, l.clanId ?? ""), eq(schema.clanMember.role, "admin")))
        .all()
        .map((r) => r.u);
  const orgaNames = await getDisplayNames(id, orgas.map((o) => o.id));
  const myNick = pickNick(myNicks, { lanId: id, typeId: l.typeId }, me.name);
  const names = await getDisplayNames(id, [
    ...new Set([...rows.map((r) => r.userId), ...seats.flatMap((s) => (s.userId ? [s.userId] : []))]),
  ]);
  const my = rows.find((r) => r.userId === me.id);
  const seatOf = new Map(
    seats.filter((s) => s.userId && (l.seatsPublishedAt || isLanManager(me, id))).map((s) => [s.userId!, s.label]),
  );
  const closed = signupClosed(l, now);
  const group = (st: string) =>
    rows
      .filter((r) => r.status === st)
      .sort((a, b) => (names.get(a.userId) ?? "").localeCompare(names.get(b.userId) ?? ""));
  const going = group("going");
  const isAdmin = isLanManager(me, id);
  const published = !!l.seatsPublishedAt;
  const steps = buildChecklist({
    lan: l,
    attendance: my,
    hasNick: myNicks.some(
      (n) => (n.lanId === null && n.typeId === null) || n.lanId === id || (!!l.typeId && n.typeId === l.typeId),
    ),
    seatLabel: published ? (seatOf.get(me.id) ?? null) : null,
    hasSeatPlan: seats.length > 0,
    freeSeats: seats.filter((s) => !s.userId && !s.locked).length,
  });
  const full = l.capacity != null && going.length >= l.capacity;
  const prog = progress(steps);


  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          {lanClan && (
            <Link href={`/clans/${lanClan.slug}`} className="mb-1 flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200">
              <ClanAvatar clan={lanClan} size={20} /> {lanClan.name}
            </Link>
          )}
          <h1 className="text-2xl font-bold sm:text-3xl">{l.name}</h1>
          <p className="mt-1 text-zinc-400">
            {fmtDate(l.startsAt)} – {fmtDate(l.endsAt)}
            {l.location && <> · {l.location}</>}
          </p>
          {(l.websiteUrl || l.ticketUrl) && (
            <p className="mt-2 flex gap-4 text-sm">
              {l.websiteUrl && (
                <a href={l.websiteUrl} target="_blank" rel="noreferrer" className="text-bit hover:underline">
                  Event website ↗
                </a>
              )}
              {l.ticketUrl && (
                <a href={l.ticketUrl} target="_blank" rel="noreferrer" className="text-bit hover:underline">
                  Ticket shop ↗
                </a>
              )}
            </p>
          )}
        </div>
        {isAdmin && (
          <Link href={`/lans/${l.id}/manage`} className={btnSecondary}>
            Manage
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="order-2 min-w-0 space-y-6 lg:order-1 lg:col-span-2">
          {l.description && (
            <Card>
              <p className="whitespace-pre-wrap text-zinc-300">{l.description}</p>
            </Card>
          )}

          <Card
            title="Our seats"
            actions={
              <span className="flex gap-2">
                {!published && seats.length > 0 && <Pill tone="amber">Not published yet</Pill>}
              </span>
            }
          >
            {seats.length === 0 ? (
              <p className="text-sm text-zinc-400">The orgas haven&apos;t entered the group&apos;s seats yet.</p>
            ) : published || isAdmin ? (
              <SeatMap
                lanId={l.id}
                rows={l.seatRows}
                cols={l.seatCols}
                meId={me.id}
                mode="view"
                seats={seats.map((s) => ({ ...s, nick: s.userId ? (names.get(s.userId) ?? "?") : null }))}
              />
            ) : (
              <p className="text-sm text-zinc-400">
                The group has {seats.length} seats ({seats[0]?.label}
                {seats.length > 1 ? `–${seats[seats.length - 1]?.label}` : ""}). The orgas assign them after the deadline
                and then publish the seat plan here.
              </p>
            )}
          </Card>

          <Card
            title={`Attendees (${going.length}${l.capacity ? ` / ${l.capacity}` : ""})`}
            actions={full && <Pill tone="red">Full · new sign-ups go on the waitlist</Pill>}
          >
            <AttendeeList title="Coming" list={going} names={names} seatOf={seatOf} showPaid={isAdmin} meId={me.id} />
            <AttendeeList title="Waitlist" list={group("waitlist")} names={names} seatOf={seatOf} showPaid={isAdmin} meId={me.id} />
            <AttendeeList title="Unsure" list={group("maybe")} names={names} seatOf={seatOf} showPaid={false} meId={me.id} />
            {group("declined").length > 0 && (
              <p className="mt-3 text-xs text-zinc-500">{group("declined").length} can&apos;t make it.</p>
            )}
          </Card>
        </div>

        <div className="order-1 min-w-0 space-y-6 lg:order-2">
          {my && my.status !== "declined" && (
            <Card title="Your checklist" actions={<span className="text-sm text-zinc-400">{prog.done} / {prog.total}</span>}>
              <LanChecklist
                lanId={l.id}
                steps={steps}
                ticketBought={my.ticketBought}
                canReportTicket={my.status === "going" || my.status === "waitlist"}
              />
            </Card>
          )}
          <Card title="Your attendance" actions={<StatusBadge status={my?.status} seat={seatOf.get(me.id)} />}>
            <AttendanceButtons lanId={l.id} current={my?.status ?? null} disabled={!!closed} />
            {my?.status === "waitlist" && (
              <p className="mt-3 text-sm text-seat-taken">
                The LAN is full. You&apos;re on the waitlist and will get an email if a spot opens up.
              </p>
            )}
            {closed && <p className="mt-3 text-sm text-zinc-400">Sign-up is closed.</p>}
          </Card>

          {my?.status === "going" && !published && seats.length > 0 && (
            <Card title="Seat wishes">
              <p className="mb-3 text-sm text-zinc-400">
                Tell the orgas where you&apos;d like to sit. They plan the seats after the deadline.
              </p>
              <SeatWishes
                lanId={l.id}
                people={rows
                  .filter((r) => r.userId !== me.id && (r.status === "going" || r.status === "maybe" || r.status === "waitlist"))
                  .map((r) => ({ id: r.userId, nick: names.get(r.userId) ?? "?" }))
                  .sort((a, b) => a.nick.localeCompare(b.nick))}
                seatLabels={[...seats].sort((a, b) => a.row - b.row || a.col - b.col).map((s) => s.label)}
                initial={{
                  near: my.wishNear ?? [],
                  avoid: my.wishAvoid ?? [],
                  position: my.wishPosition,
                  seat: my.wishSeat,
                  note: my.wishNote,
                }}
              />
            </Card>
          )}

          <Card title="Dates">
            <dl className="space-y-3 text-sm">
              <DateRow label="Answer by" d={l.signupDeadline} now={now} />
              <DateRow label="Buy ticket by" d={l.paymentDueDate} now={now} />
              {l.price && (
                <div className="flex justify-between">
                  <dt className="text-zinc-400">Ticket price</dt>
                  <dd>{l.price}</dd>
                </div>
              )}
              {my && (my.status === "going" || my.status === "waitlist") && l.paymentDueDate && (
                <div className="flex justify-between">
                  <dt className="text-zinc-400">Your ticket</dt>
                  <dd>
                    {my.paid ? (
                      <Pill tone="emerald">Confirmed</Pill>
                    ) : my.ticketBought ? (
                      <Pill tone="amber">Reported</Pill>
                    ) : (
                      <Pill tone="red">Open</Pill>
                    )}
                  </dd>
                </div>
              )}
            </dl>
          </Card>

          <Card title={orgaIds.length ? "Orgas" : "Contact"}>
            <p className="mb-3 text-sm text-zinc-400">Questions about this LAN? Ask the orgas.</p>
            <ul className="space-y-2">
              {orgas.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>
                    <span className="font-medium text-zinc-100">{orgaNames.get(o.id) ?? o.name}</span>
                    {orgaNames.get(o.id) !== o.name && <span className="text-zinc-500"> · {o.name}</span>}
                  </span>
                  <a
                    href={`mailto:${o.email}?subject=${encodeURIComponent(l.name)}`}
                    className="text-bit hover:underline"
                  >
                    Email
                  </a>
                </li>
              ))}
            </ul>
          </Card>

          <Card title={lanType ? `Your nick at ${lanType.name}` : "Your nick at this LAN"}>
            <p className="mb-3 text-sm text-zinc-400">
              Shown as <strong className="text-zinc-100">{myNick}</strong>.{" "}
              {lanType
                ? `The nick you set here is used for every ${lanType.name} event. `
                : "The nick you set here is used for this LAN only. "}
              Your default nick is on your{" "}
              <Link href="/profile" className="text-bit hover:underline">
                profile
              </Link>
              .
            </p>
            {lanType ? (
              <NickManager nicks={myNicks} typeId={lanType.id} placeholder={`Your ${lanType.name} nick`} />
            ) : (
              <NickManager nicks={myNicks} lanId={l.id} />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function DateRow({ label, d, now }: { label: string; d: Date | null; now: Date }) {
  if (!d) return null;
  const past = d < now;
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-zinc-400">{label}</dt>
      <dd className="text-right">
        {fmtDate(d)}
        <span className={`block text-xs ${past ? "text-zinc-500" : "text-amber-300"}`}>{relative(d, now)}</span>
      </dd>
    </div>
  );
}

function AttendeeList({
  title,
  list,
  names,
  seatOf,
  showPaid,
  meId,
}: {
  title: string;
  list: (typeof attendance.$inferSelect)[];
  names: Map<string, string>;
  seatOf: Map<string, string>;
  showPaid: boolean;
  meId: string;
}) {
  if (list.length === 0) return null;
  return (
    <div className="mb-4">
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">{title}</h3>
      <ul className="grid gap-1 sm:grid-cols-2">
        {list.map((a) => (
          <li key={a.id} className="flex items-center justify-between rounded bg-zinc-800/50 px-3 py-1.5 text-sm">
            <span className={a.userId === meId ? "font-semibold text-bit" : ""}>{names.get(a.userId)}</span>
            <span className="flex gap-1">
              {seatOf.get(a.userId) && <Pill>{seatOf.get(a.userId)}</Pill>}
              {showPaid && (a.paid ? <Pill tone="emerald">ticket ok</Pill> : a.ticketBought ? <Pill tone="amber">reported</Pill> : <Pill tone="red">no ticket</Pill>)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
