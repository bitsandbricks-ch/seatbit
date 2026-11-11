import Link from "next/link";
import { notFound, redirect } from "next/navigation";
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
import { isLanManager, requireUser } from "@/lib/session";
import { OrgaManager } from "@/components/orga-manager";
import { DiscordButtons, WhatsAppTexts } from "@/components/chat-panel";
import { whatsappTexts } from "@/lib/announce";
import { discordEnabled, inviteUrl } from "@/lib/discord-api";
import { SeatSetup } from "@/components/seat-setup";

const { attendance, seat, user, reminderLog } = schema;

export default async function AdminLanPage({ params }: PageProps<"/lans/[id]/manage">) {
  const { id } = await params;
  const me = await requireUser();
  const l = getLan(id);
  if (!l) notFound();
  if (!isLanManager(me, id)) redirect(`/lans/${id}`);
  const orgaIds = db.select().from(schema.lanOrga).where(eq(schema.lanOrga.lanId, id)).all().map((o) => o.userId);

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

  const discordChannels = db.select().from(schema.discordChannel).all().length;
  const discordPosts = db.select().from(schema.discordMessage).where(eq(schema.discordMessage.lanId, id)).all().length;
  const invite = me.role === "admin" ? inviteUrl() : null;

  const wantsMail = (uid: string) => userById.get(uid)?.emailReminders;
  const undecided = users.filter(
    (u) => u.emailReminders && (!inLan.has(u.id) || rows.find((r) => r.userId === u.id)?.status === "maybe"),
  ).length;
  const unpaid = rows.filter(
    (r) => (r.status === "going" || r.status === "waitlist") && !r.paid && !r.ticketBought && wantsMail(r.userId),
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
        ticketBought: r.ticketBought,
        note: r.note,
        seat: seatOf.get(r.userId) ?? null,
        seatId: seats.find((s) => s.userId === r.userId)?.id ?? null,
      };
    })
    .sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || a.nick.localeCompare(b.nick));

  const due = dueKinds(l);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-zinc-500">
            <Link href={`/lans/${l.id}`} className="hover:text-zinc-300">
              {l.name}
            </Link>{" "}
            / Manage
          </p>
          <h1 className="text-2xl font-bold">{l.name}</h1>
        </div>
        <div className="flex gap-2">
          <a href={`/lans/${l.id}/manage/export`} className={btnSecondary}>
            Export CSV
          </a>
          <Link href={`/lans/${l.id}`} className={btnSecondary}>
            Back to LAN
          </Link>
        </div>
      </div>

      <Card title={`Attendance (${going.length}${l.capacity ? ` / ${l.capacity}` : ""} going)`}>
        <AttendanceTable
          lanId={l.id}
          rows={tableRows}
          seats={[...seats].sort((a, b) => a.row - b.row || a.col - b.col)}
          others={users.filter((u) => !inLan.has(u.id)).map((u) => ({ id: u.id, name: names.get(u.id) ?? u.name }))}
        />
      </Card>

      <Card title="Our seat block">
        <p className="mb-3 text-sm text-zinc-400">
          Enter the seats the event gave the group, then assign them here or in the attendee list above. Hold keeps a
          seat out of auto-assign, e.g. for a guest.
        </p>
        <div className="mb-6">
          <SeatSetup
            lanId={l.id}
            current={seatSpec(seats)}
            unseated={going.filter((r) => !seatOf.has(r.userId)).length}
            free={seats.filter((s) => !s.userId && !s.locked).length}
          />
        </div>
        {seats.length > 0 && (
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
        )}
      </Card>

      <Card title="Reminders">
        <div className="space-y-4 text-sm">
          <p className="text-zinc-400">
            Reminders go out automatically {l.reminderDays} day(s) before the answer deadline (to members who
            haven&apos;t answered or said maybe) and before the ticket deadline (to attendees without a ticket), plus one
            day before the LAN starts (to everyone going). Each one is sent once per person. Members can opt out on
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

      <Card title="Discord & WhatsApp">
        <div className="space-y-5 text-sm">
          <div className="space-y-2">
            <h3 className="font-semibold text-zinc-200">Discord</h3>
            {!discordEnabled() ? (
              <p className="text-zinc-400">
                The Discord bot isn&apos;t set up.{" "}
                {me.role === "admin" ? (
                  <Link href="/admin/settings?tab=discord" className="text-emerald-400 hover:underline">
                    Add the bot token in the platform settings.
                  </Link>
                ) : (
                  "Ask a Seatbit admin to add the bot token in the platform settings."
                )}
              </p>
            ) : discordChannels === 0 ? (
              <p className="text-zinc-400">
                No channel yet.{" "}
                {invite && (
                  <a href={invite} target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">
                    Invite the bot
                  </a>
                )}{" "}
                to your server, then run <code>/seatbit here</code> in the channel it should post in.
              </p>
            ) : (
              <p className="text-zinc-400">
                Posting to {discordChannels} channel(s); this LAN is posted in {discordPosts}. Members answer with the
                buttons under the post, the attendee list updates live, and deadline reminders are posted automatically
                (pinging members who linked Discord).
              </p>
            )}
            {discordEnabled() && discordChannels > 0 && (
              <DiscordButtons
                lanId={l.id}
                posted={discordPosts}
                channels={discordChannels}
                kinds={[
                  ...(l.signupDeadline ? [{ kind: "signup" as const, label: "Answer reminder" }] : []),
                  ...(l.paymentDueDate ? [{ kind: "payment" as const, label: "Ticket reminder" }] : []),
                  { kind: "event" as const, label: "Starts soon" },
                ]}
              />
            )}
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-zinc-200">WhatsApp</h3>
            <p className="text-zinc-400">Ready-made messages for the community. Copy one and paste it into the group.</p>
            <WhatsAppTexts texts={await whatsappTexts(l)} />
          </div>
        </div>
      </Card>

      <Card title="Details">
        <LanForm
          types={db.select().from(schema.lanType).all()}
          values={{
            id: l.id,
            typeId: l.typeId ?? "",
            name: l.name,
            description: l.description,
            location: l.location,
            websiteUrl: l.websiteUrl,
            ticketUrl: l.ticketUrl,
            startsAt: toInputValue(l.startsAt),
            endsAt: toInputValue(l.endsAt),
            signupDeadline: toInputValue(l.signupDeadline),
            paymentDueDate: toInputValue(l.paymentDueDate),
            price: l.price,
            capacity: l.capacity?.toString() ?? "",
            reminderDays: l.reminderDays,
          }}
        />
      </Card>

      <Card title="Orgas">
        <p className="mb-3 text-sm text-zinc-400">
          Orgas can edit this LAN&apos;s details, seating plan and attendance. Global admins can always do this.
        </p>
        <OrgaManager
          lanId={l.id}
          orgas={orgaIds.map((uid) => ({ id: uid, name: names.get(uid) ?? userById.get(uid)?.name ?? "?" }))}
          candidates={users
            .filter((u) => !orgaIds.includes(u.id))
            .map((u) => ({ id: u.id, name: names.get(u.id) ?? u.name }))
            .sort((a, b) => a.name.localeCompare(b.name))}
        />
      </Card>

      {me.role === "admin" && (
        <Card title="Danger zone">
          <form action={deleteLan.bind(null, l.id)}>
            <button className={btnDanger}>Delete this LAN</button>
          </form>
        </Card>
      )}
    </div>
  );
}

/** Compact text form of the seat block, e.g. "F1-F20, G1-G4". */
function seatSpec(seats: { label: string; row: number; col: number }[]) {
  const parts: string[] = [];
  const sorted = [...seats].sort((a, b) => a.row - b.row || a.col - b.col);
  let start: { p: string; n: number } | null = null;
  let prev: { p: string; n: number } | null = null;
  const flush = () => {
    if (start && prev) parts.push(start.n === prev.n ? `${start.p}${start.n}` : `${start.p}${start.n}-${prev.p}${prev.n}`);
  };
  for (const s of sorted) {
    const m = s.label.match(/^([A-Za-z]*)(\d+)$/);
    if (!m) {
      flush();
      start = prev = null;
      parts.push(s.label);
      continue;
    }
    const cur = { p: m[1], n: Number(m[2]) };
    if (prev && prev.p === cur.p && cur.n === prev.n + 1) prev = cur;
    else {
      flush();
      start = prev = cur;
    }
  }
  flush();
  return parts.join(", ");
}
