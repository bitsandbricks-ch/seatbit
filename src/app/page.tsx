import Link from "next/link";
import { asc, desc, eq, gt, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Lan } from "@/db/schema";
import { Card, Pill, StatusBadge, btnPrimary } from "@/components/ui";
import { fmtDate, fmtDay, relative } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { buildChecklist, progress } from "@/lib/checklist";

const { lan, attendance, seat, nickname } = schema;

export default async function Home() {
  const me = await requireUser();
  const now = new Date();
  const upcoming = db.select().from(lan).where(gt(lan.endsAt, now)).orderBy(asc(lan.startsAt)).all();
  const past = db.select().from(lan).where(lte(lan.endsAt, now)).orderBy(desc(lan.startsAt)).limit(10).all();
  const all = db.select().from(attendance).all();
  const mine = new Map(all.filter((a) => a.userId === me.id).map((a) => [a.lanId, a]));
  const going = (id: string) => all.filter((a) => a.lanId === id && a.status === "going").length;
  const seats = db.select().from(seat).all();
  const myNicks = db
    .select()
    .from(nickname)
    .where(eq(nickname.userId, me.id))
    .all();
  const info = (l: Lan) => {
    const ls = seats.filter((s) => s.lanId === l.id);
    const mySeat = ls.find((s) => s.userId === me.id)?.label ?? null;
    const freeSeats = ls.filter((s) => !s.userId && !s.locked).length;
    const steps = buildChecklist({
      lan: l,
      attendance: mine.get(l.id),
      hasNick: myNicks.some(
        (n) => (n.lanId === null && n.typeId === null) || n.lanId === l.id || (!!l.typeId && n.typeId === l.typeId),
      ),
      seatLabel: mySeat,
      hasSeatPlan: ls.length > 0,
      freeSeats,
    });
    return { mySeat, freeSeats, hasSeats: ls.length > 0, progress: progress(steps) };
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Upcoming LANs</h1>
        {me.role === "admin" && (
          <Link href="/admin/lans/new" className={btnPrimary}>
            Add LAN
          </Link>
        )}
      </div>

      {upcoming.length === 0 && (
        <Card>
          <p className="text-zinc-400">No LANs on the list yet.</p>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {upcoming.map((l) => (
          <LanCard key={l.id} l={l} my={mine.get(l.id)} going={going(l.id)} now={now} info={info(l)} />
        ))}
      </div>

      {past.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold text-zinc-400">Past LANs</h2>
          <ul className="divide-y divide-zinc-800 rounded-xl border border-line">
            {past.map((l) => (
              <li key={l.id}>
                <Link href={`/lans/${l.id}`} className="flex justify-between px-4 py-3 hover:bg-zinc-900">
                  <span>{l.name}</span>
                  <span className="text-sm text-zinc-500">{fmtDay(l.startsAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function LanCard({
  l,
  my,
  going,
  now,
  info,
}: {
  info: { mySeat: string | null; freeSeats: number; hasSeats: boolean; progress: { done: number; total: number } };
  l: Lan;
  my?: typeof attendance.$inferSelect;
  going: number;
  now: Date;
}) {
  const needsAnswer = !my || my.status === "maybe";
  const deadlineSoon = l.signupDeadline && l.signupDeadline > now;
  const unpaid = my && (my.status === "going" || my.status === "waitlist") && !my.paid && !my.ticketBought && l.paymentDueDate;
  return (
    <Link
      href={`/lans/${l.id}`}
      className="block rounded-xl border border-line bg-surface p-5 transition hover:border-bit/50"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">{l.name}</h3>
          <p className="text-sm text-zinc-400">
            {fmtDate(l.startsAt)} {l.location && <>· {l.location}</>}
          </p>
        </div>
        <StatusBadge status={my?.status} seat={info.mySeat} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <Pill>
          {going}
          {l.capacity ? ` / ${l.capacity}` : ""} going
        </Pill>
        {needsAnswer && deadlineSoon && (
          <Pill tone="amber">Answer by {fmtDay(l.signupDeadline!)} ({relative(l.signupDeadline!, now)})</Pill>
        )}
        {unpaid && <Pill tone="red">Ticket due {fmtDay(l.paymentDueDate!)}</Pill>}
        {info.hasSeats && (
          <Pill tone={info.freeSeats ? "zinc" : "red"}>{info.freeSeats ? `${info.freeSeats} seats free` : "No seats left"}</Pill>
        )}
        {my && my.status !== "declined" && (
          <Pill tone={info.progress.done === info.progress.total ? "emerald" : "amber"}>
            Checklist {info.progress.done}/{info.progress.total}
          </Pill>
        )}
      </div>
    </Link>
  );
}
