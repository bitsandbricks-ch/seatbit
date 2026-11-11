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
import { fmtDate, relative, toInputValue } from "@/lib/format";
import { getDisplayNames, getLan } from "@/lib/lans";
import { dueKinds } from "@/lib/reminders";
import { isLanManager, requireUser } from "@/lib/session";
import { OrgaManager } from "@/components/orga-manager";
import { SeatSetup } from "@/components/seat-setup";
import { Tabs } from "@/components/tabs";
import { DiscordButtons, WhatsAppTexts } from "@/components/chat-panel";
import { whatsappTexts } from "@/lib/announce";
import { discordEnabled, inviteUrl } from "@/lib/discord-api";

const { attendance, seat, user, reminderLog } = schema;

const TABS = [
  ["overview", "Overview"],
  ["attendees", "Attendees"],
  ["seats", "Seats"],
  ["chat", "Discord & WhatsApp"],
  ["settings", "Settings"],
] as const;
type Tab = (typeof TABS)[number][0];

export default async function ManageLanPage({ params, searchParams }: PageProps<"/lans/[id]/manage">) {
  const { id } = await params;
  const sp = await searchParams;
  const tab: Tab = TABS.some(([t]) => t === sp.tab) ? (sp.tab as Tab) : "overview";
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
  const now = new Date();
  const ticketsConfirmed = going.filter((r) => r.paid).length;
  const ticketsReported = going.filter((r) => !r.paid && r.ticketBought).length;
  const seated = going.filter((r) => seatOf.has(r.userId)).length;
  const freeSeats = seats.filter((s) => !s.userId && !s.locked).length;
  const count = (st: string) => rows.filter((r) => r.status === st).length;
  const noAnswer = users.filter((u) => !inLan.has(u.id)).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/lans/${l.id}`} className="text-sm text-zinc-500 hover:text-zinc-300">
            ← Back to event
          </Link>
          <h1 className="truncate text-2xl font-bold">{l.name}</h1>
          <p className="text-sm text-zinc-400">{fmtDate(l.startsAt)}</p>
        </div>
        <a href={`/lans/${l.id}/manage/export`} className={btnSecondary}>
          Export CSV
        </a>
      </div>

      <div className="sticky top-0 z-10 bg-ink/95 backdrop-blur">
        <Tabs
          tabs={TABS.map(([t, label]) => ({
            id: t,
            label,
            badge:
              t === "attendees" && ticketsReported
                ? `${ticketsReported} to confirm`
                : t === "seats" && going.length - seated > 0 && seats.length
                  ? `${going.length - seated} unseated`
                  : undefined,
          }))}
          active={tab}
          hrefFor={(t) => `/lans/${l.id}/manage?tab=${t}`}
        />
      </div>

      {tab === "overview" && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Coming" value={`${going.length}${l.capacity ? ` / ${l.capacity}` : ""}`} sub={`${count("waitlist")} waitlist`} href={`/lans/${l.id}/manage?tab=attendees`} />
            <Stat label="Unsure / no answer" value={`${count("maybe")} / ${noAnswer}`} sub={`${count("declined")} not coming`} href={`/lans/${l.id}/manage?tab=attendees`} />
            <Stat label="Tickets" value={`${ticketsConfirmed} / ${going.length}`} sub={`${ticketsReported} to confirm`} href={`/lans/${l.id}/manage?tab=attendees`} />
            <Stat label="Seats" value={`${seated} / ${going.length}`} sub={seats.length ? `${freeSeats} free of ${seats.length}` : "no seats yet"} href={`/lans/${l.id}/manage?tab=seats`} />
          </div>

          <Card title="Dates">
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <DateItem label="Answer by" d={l.signupDeadline} now={now} />
              <DateItem label="Buy ticket by" d={l.paymentDueDate} now={now} />
              <DateItem label="Starts" d={l.startsAt} now={now} />
            </dl>
          </Card>

          <Card title="Reminders">
            <div className="space-y-4 text-sm">
              <p className="text-zinc-400">
                Sent automatically {l.reminderDays} day(s) before the answer deadline (to undecided members) and the
                ticket deadline (to attendees without a ticket), and the day before the LAN (to everyone coming). Each
                one goes out once per person.
              </p>
              {due.length > 0 && <p className="text-warn">Reminder window open: {due.join(", ")}.</p>}
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
        </div>
      )}

      {tab === "attendees" && (
        <AttendanceTable
          lanId={l.id}
          rows={tableRows}
          seats={[...seats].sort((a, b) => a.row - b.row || a.col - b.col)}
          others={users.filter((u) => !inLan.has(u.id)).map((u) => ({ id: u.id, name: names.get(u.id) ?? u.name }))}
        />
      )}

      {tab === "seats" && (
        <div className="space-y-5">
          <Card title="Our seats">
            <p className="mb-4 text-sm text-zinc-400">
              Enter the seats the event gave the group, then assign them here or on the Attendees tab. Hold keeps a seat
              out of auto-assign, e.g. for a guest.
            </p>
            <SeatSetup
              lanId={l.id}
              current={seatSpec(seats)}
              unseated={going.length - seated}
              free={freeSeats}
            />
          </Card>
          {seats.length > 0 && (
            <Card>
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
          )}
        </div>
      )}

      {tab === "chat" && (
        <Card title="Discord & WhatsApp">
          <div className="space-y-5 text-sm">
            <div className="space-y-2">
              <h3 className="font-semibold text-zinc-200">Discord</h3>
              {!discordEnabled ? (
                <p className="text-zinc-400">
                  The Discord bot isn&apos;t set up. Add <code>DISCORD_BOT_TOKEN</code> and <code>DISCORD_PUBLIC_KEY</code> (see
                  README).
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
              {discordEnabled && discordChannels > 0 && (
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
      )}

      {tab === "settings" && (
        <div className="space-y-5">
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
              Orgas manage this LAN and are shown to members as contacts. Global admins can always manage it too.
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
      )}
    </div>
  );
}

function Stat({ label, value, sub, href }: { label: string; value: string; sub: string; href: string }) {
  return (
    <Link href={href} className="rounded-card border border-line bg-surface p-4 hover:border-zinc-600">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-zinc-500">{sub}</p>
    </Link>
  );
}

function DateItem({ label, d, now }: { label: string; d: Date | null; now: Date }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd>
        {d ? (
          <>
            {fmtDate(d)} <span className={d < now ? "text-zinc-500" : "text-warn"}>({relative(d, now)})</span>
          </>
        ) : (
          <span className="text-zinc-500">—</span>
        )}
      </dd>
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
