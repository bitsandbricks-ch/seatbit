import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { AttendanceButtons } from "@/components/attendance-buttons";
import { NickManager } from "@/components/nick-manager";
import { SeatMap } from "@/components/seat-map";
import { Card, Pill, StatusBadge, btnSecondary } from "@/components/ui";
import { fmtDate, relative } from "@/lib/format";
import { getDisplayNames, getLan, signupClosed } from "@/lib/lans";
import { isLanManager, requireUser } from "@/lib/session";
import { buildChecklist, progress } from "@/lib/checklist";
import { LanChecklist } from "@/components/lan-checklist";

const { attendance, seat, nickname } = schema;

export default async function LanPage({ params }: PageProps<"/lans/[id]">) {
  const { id } = await params;
  const me = await requireUser();
  const l = getLan(id);
  if (!l) notFound();
  const now = new Date();

  const rows = db.select().from(attendance).where(eq(attendance.lanId, id)).all();
  const seats = db.select().from(seat).where(eq(seat.lanId, id)).all();
  const myNicks = db.select().from(nickname).where(eq(nickname.userId, me.id)).all();
  const names = await getDisplayNames(id, [
    ...new Set([...rows.map((r) => r.userId), ...seats.flatMap((s) => (s.userId ? [s.userId] : []))]),
  ]);
  const my = rows.find((r) => r.userId === me.id);
  const seatOf = new Map(seats.filter((s) => s.userId).map((s) => [s.userId!, s.label]));
  const closed = signupClosed(l, now);
  const group = (st: string) =>
    rows
      .filter((r) => r.status === st)
      .sort((a, b) => (names.get(a.userId) ?? "").localeCompare(names.get(b.userId) ?? ""));
  const going = group("going");
  const isAdmin = isLanManager(me, id);
  const steps = buildChecklist({
    lan: l,
    attendance: my,
    hasNick: myNicks.some((n) => n.lanId === null || n.lanId === id),
    seatLabel: seatOf.get(me.id) ?? null,
    hasSeatPlan: seats.length > 0,
    freeSeats: seats.filter((s) => !s.userId && !s.locked).length,
  });
  const freeSeats = seats.filter((s) => !s.userId && !s.locked).length;
  const full = l.capacity != null && going.length >= l.capacity;
  const prog = progress(steps);


  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{l.name}</h1>
          <p className="mt-1 text-zinc-400">
            {fmtDate(l.startsAt)} – {fmtDate(l.endsAt)}
            {l.location && <> · {l.location}</>}
          </p>
          {(l.websiteUrl || l.ticketUrl) && (
            <p className="mt-2 flex gap-4 text-sm">
              {l.websiteUrl && (
                <a href={l.websiteUrl} target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">
                  Event website ↗
                </a>
              )}
              {l.ticketUrl && (
                <a href={l.ticketUrl} target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">
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

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {l.description && (
            <Card>
              <p className="whitespace-pre-wrap text-zinc-300">{l.description}</p>
            </Card>
          )}

          <Card
            title="Our seats"
            actions={
              <span className="flex gap-2">
                {!l.seatingOpen && <Pill tone="amber">Seating closed</Pill>}
                {seats.length > 0 && (
                  <Pill tone={freeSeats ? "zinc" : "red"}>{freeSeats ? `${freeSeats} seats free` : "No seats left"}</Pill>
                )}
              </span>
            }
          >
            {seats.length === 0 ? (
              <p className="text-sm text-zinc-400">No seating plan yet.</p>
            ) : (
              <SeatMap
                lanId={l.id}
                rows={l.seatRows}
                cols={l.seatCols}
                meId={me.id}
                mode="pick"
                canPick={my?.status === "going" && l.seatingOpen}
                seats={seats.map((s) => ({ ...s, nick: s.userId ? (names.get(s.userId) ?? "?") : null }))}
              />
            )}
          </Card>

          <Card
            title={`Attendees (${going.length}${l.capacity ? ` / ${l.capacity}` : ""})`}
            actions={full && <Pill tone="red">Full · new sign-ups go on the waitlist</Pill>}
          >
            <AttendeeList title="Going" list={going} names={names} seatOf={seatOf} showPaid={isAdmin} meId={me.id} />
            <AttendeeList title="Waitlist" list={group("waitlist")} names={names} seatOf={seatOf} showPaid={isAdmin} meId={me.id} />
            <AttendeeList title="Maybe" list={group("maybe")} names={names} seatOf={seatOf} showPaid={false} meId={me.id} />
            {group("declined").length > 0 && (
              <p className="mt-3 text-xs text-zinc-500">{group("declined").length} can&apos;t make it.</p>
            )}
          </Card>
        </div>

        <div className="space-y-6">
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
              <p className="mt-3 text-sm text-sky-300">
                The LAN is full. You&apos;re on the waitlist and will get an email if a spot opens up.
              </p>
            )}
            {closed && <p className="mt-3 text-sm text-zinc-400">Sign-up is closed.</p>}
          </Card>

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

          <Card title="Your nick at this LAN">
            <p className="mb-3 text-sm text-zinc-400">
              Shown as <strong className="text-zinc-100">{names.get(me.id) ?? myDisplay(myNicks, me.name)}</strong>.
              Add a nick just for this LAN, or manage your default nicks on your{" "}
              <Link href="/profile" className="text-emerald-400 hover:underline">
                profile
              </Link>
              .
            </p>
            <NickManager nicks={myNicks} lanId={l.id} />
          </Card>
        </div>
      </div>
    </div>
  );
}

function myDisplay(nicks: { nick: string; isPrimary: boolean; lanId: string | null }[], name: string) {
  const g = nicks.filter((n) => n.lanId === null);
  return g.find((n) => n.isPrimary)?.nick ?? g[0]?.nick ?? name;
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
            <span className={a.userId === meId ? "font-semibold text-emerald-300" : ""}>{names.get(a.userId)}</span>
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
