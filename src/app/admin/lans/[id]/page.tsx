import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { deleteLan } from "@/app/actions";
import { AttendanceTable } from "@/components/attendance-table";
import { LanForm } from "@/components/lan-form";
import { ReminderButtons } from "@/components/reminder-buttons";
import { SeatMap } from "@/components/seat-map";
import { Card, btnDanger, btnSecondary } from "@/components/ui";
import { fmtDate, toInputValue } from "@/lib/format";
import { getDisplayNames, getLan } from "@/lib/lans";
import { dueKinds } from "@/lib/reminders";
import { requireAdmin } from "@/lib/session";

const { attendance, seat, user, reminderLog } = schema;

export default async function AdminLanPage({ params }: PageProps<"/admin/lans/[id]">) {
  const { id } = await params;
  const me = await requireAdmin();
  const l = getLan(id);
  if (!l) notFound();

  const rows = db.select().from(attendance).where(eq(attendance.lanId, id)).all();
  const seats = db.select().from(seat).where(eq(seat.lanId, id)).all();
  const users = db.select().from(user).all();
  const names = await getDisplayNames(id, users.map((u) => u.id));
  const userById = new Map(users.map((u) => [u.id, u]));
  const seatOf = new Map(seats.filter((s) => s.userId).map((s) => [s.userId!, s.label]));
  const inLan = new Set(rows.map((r) => r.userId));
  const reminders = db
    .select()
    .from(reminderLog)
    .where(and(eq(reminderLog.lanId, id)))
    .all();

  const wantsMail = (uid: string) => userById.get(uid)?.emailReminders;
  const undecided = users.filter(
    (u) => u.emailReminders && (!inLan.has(u.id) || rows.find((r) => r.userId === u.id)?.status === "maybe"),
  ).length;
  const unpaid = rows.filter(
    (r) => (r.status === "going" || r.status === "waitlist") && !r.paid && wantsMail(r.userId),
  ).length;
  const going = rows.filter((r) => r.status === "going");

  const statusOrder = { going: 0, waitlist: 1, maybe: 2, declined: 3 };
  const tableRows = rows
    .map((r) => {
      const u = userById.get(r.userId)!;
      return {
        id: r.id,
        userId: r.userId,
        nick: names.get(r.userId) ?? u.name,
        name: u.name,
        email: u.email,
        status: r.status,
        paid: r.paid,
        note: r.note,
        seat: seatOf.get(r.userId) ?? null,
      };
    })
    .sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || a.nick.localeCompare(b.nick));

  const due = dueKinds(l);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-zinc-500">
            <Link href="/admin" className="hover:text-zinc-300">
              Admin
            </Link>{" "}
            / LAN
          </p>
          <h1 className="text-2xl font-bold">{l.name}</h1>
        </div>
        <Link href={`/lans/${l.id}`} className={btnSecondary}>
          View as member
        </Link>
      </div>

      <Card title={`Attendance (${going.length}${l.capacity ? ` / ${l.capacity}` : ""} going)`}>
        <AttendanceTable
          lanId={l.id}
          rows={tableRows}
          others={users.filter((u) => !inLan.has(u.id)).map((u) => ({ id: u.id, name: names.get(u.id) ?? u.name }))}
        />
      </Card>

      <Card title="Seating plan">
        <SeatMap
          lanId={l.id}
          rows={l.seatRows}
          cols={l.seatCols}
          meId={me.id}
          mode="admin"
          seats={seats.map((s) => ({ ...s, nick: s.userId ? (names.get(s.userId) ?? "?") : null }))}
          assignable={going
            .map((r) => ({ id: r.userId, nick: names.get(r.userId) ?? "?" }))
            .sort((a, b) => a.nick.localeCompare(b.nick))}
        />
      </Card>

      <Card title="Reminders">
        <div className="space-y-4 text-sm">
          <p className="text-zinc-400">
            Reminders go out automatically {l.reminderDays} day(s) before the answer deadline (to members who
            haven&apos;t answered or said maybe) and before the payment due date (to unpaid attendees), plus one day
            before the LAN starts (to everyone going). Each one is sent once per person. Members can opt out on
            their profile.
          </p>
          {due.length > 0 && (
            <p className="text-amber-300">Reminder window open: {due.join(", ")}. The scheduler sends these automatically, once per person.</p>
          )}
          <ReminderButtons
            lanId={l.id}
            counts={{
              signup: l.signupDeadline ? undecided : null,
              payment: l.paymentDueDate ? unpaid : null,
              event: going.filter((r) => wantsMail(r.userId)).length,
            }}
          />
          {reminders.length > 0 && (
            <details>
              <summary className="cursor-pointer text-zinc-400">Sent reminders ({reminders.length})</summary>
              <ul className="mt-2 space-y-1 text-xs text-zinc-400">
                {reminders
                  .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())
                  .map((r) => (
                    <li key={r.id}>
                      {fmtDate(r.sentAt)} · {r.kind} · {names.get(r.userId) ?? "?"}
                    </li>
                  ))}
              </ul>
            </details>
          )}
        </div>
      </Card>

      <Card title="Details">
        <LanForm
          values={{
            id: l.id,
            name: l.name,
            description: l.description,
            location: l.location,
            startsAt: toInputValue(l.startsAt),
            endsAt: toInputValue(l.endsAt),
            signupDeadline: toInputValue(l.signupDeadline),
            paymentDueDate: toInputValue(l.paymentDueDate),
            price: l.price,
            capacity: l.capacity?.toString() ?? "",
            reminderDays: l.reminderDays,
            seatRows: l.seatRows,
            seatCols: l.seatCols,
            seatingOpen: l.seatingOpen,
          }}
        />
      </Card>

      <Card title="Danger zone">
        <form action={deleteLan.bind(null, l.id)}>
          <button className={btnDanger}>Delete this LAN</button>
        </form>
      </Card>
    </div>
  );
}
