import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { deleteLan, setSeatPicking } from "@/app/actions";
import { AttendanceTable } from "@/components/attendance-table";
import { LanForm } from "@/components/lan-form";
import { ReminderButtons } from "@/components/reminder-buttons";
import { SeatMap } from "@/components/seat-map";
import { ClanAvatar } from "@/components/clan-avatar";
import { Card, Pill, btnDanger, btnPrimary, btnSecondary } from "@/components/ui";
import { fmtDate, fmtRange, relative, toInputValue } from "@/lib/format";
import { getDisplayNames, getLan } from "@/lib/lans";
import { dueKinds } from "@/lib/reminders";
import { isLanManager, requireUser } from "@/lib/session";
import { OrgaManager } from "@/components/orga-manager";
import { SeatSetup } from "@/components/seat-setup";
import { Tabs } from "@/components/tabs";
import { DiscordButtons, WhatsAppTexts } from "@/components/chat-panel";
import { whatsappTexts } from "@/lib/announce";
import { discordEnabled, inviteUrl } from "@/lib/discord-api";
import { canManageClan, getClan } from "@/lib/clans";
import { PublishSeats } from "@/components/publish-seats";
import { checkWishes } from "@/lib/seating";
import { getLanAccounts } from "@/lib/lan-accounts";
import { personLabel } from "@/lib/names";

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
  const memberIds = new Set(
    db
      .select({ userId: schema.clanMember.userId, role: schema.clanMember.role })
      .from(schema.clanMember)
      .where(eq(schema.clanMember.clanId, l.clanId ?? ""))
      .all()
      .filter((m) => m.role !== "pending")
      .map((m) => m.userId),
  );
  // Clan members, plus anyone who already has an attendance row (e.g. left the clan later).
  const users = db
    .select()
    .from(user)
    .all()
    .filter((u) => memberIds.has(u.id) || rows.some((r) => r.userId === u.id));
  const names = await getDisplayNames(id, users.map((u) => u.id));
  const lanIds = getLanAccounts(l, rows.map((r) => r.userId));
  const userById = new Map(users.map((u) => [u.id, u]));
  const seatOf = new Map(seats.filter((s) => s.userId).map((s) => [s.userId!, s.label]));
  const inLan = new Set(rows.map((r) => r.userId));
  const reminders = db
    .select()
    .from(reminderLog)
    .where(and(eq(reminderLog.lanId, id)))
    .all();

  const discordChannels = l.clanId
    ? db.select().from(schema.discordChannel).where(eq(schema.discordChannel.clanId, l.clanId)).all().length
    : 0;
  const lanClan = l.clanId ? getClan(l.clanId) : undefined;
  const discordPosts = db.select().from(schema.discordMessage).where(eq(schema.discordMessage.lanId, id)).all().length;
  const invite = lanClan && canManageClan(me, lanClan.id) ? inviteUrl() : null;

  const wantsMail = (uid: string) => userById.get(uid)?.emailReminders;
  const undecided = users.filter(
    (u) => u.emailReminders && memberIds.has(u.id) && (!inLan.has(u.id) || rows.find((r) => r.userId === u.id)?.status === "maybe"),
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
        email: u.isGuest ? (u.inviteEmail ? `guest, invited at ${u.inviteEmail}` : "guest, no login yet") : u.email,
        status: r.status,
        paid: r.paid,
        ticketBought: r.ticketBought,
        note: r.note,
        lanAccount: lanIds.get(r.userId) ?? "",
        seat: seatOf.get(r.userId) ?? null,
        seatId: seats.find((s) => s.userId === r.userId)?.id ?? null,
      };
    })
    .sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || a.nick.localeCompare(b.nick));

  const due = dueKinds(l);
  const planPeople = going.map((r) => ({
    userId: r.userId,
    near: r.wishNear ?? [],
    avoid: r.wishAvoid ?? [],
    position: r.wishPosition,
    seat: r.wishSeat,
    priority: 0,
    order: 0,
  }));
  const wishChecks = checkWishes(seats, planPeople, (uid) => names.get(uid) ?? "?");
  const wishNotes = going.filter((r) => r.wishNote);
  const now = new Date();
  const ticketsConfirmed = going.filter((r) => r.paid).length;
  const ticketsReported = going.filter((r) => !r.paid && r.ticketBought).length;
  const seated = going.filter((r) => seatOf.has(r.userId)).length;
  const freeSeats = seats.filter((s) => !s.userId && !s.locked).length;
  const count = (st: string) => rows.filter((r) => r.status === st).length;
  const noAnswer = users.filter((u) => memberIds.has(u.id) && !inLan.has(u.id)).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/lans/${l.id}`} className="-ml-1 inline-flex min-h-8 items-center gap-1 rounded-md px-1 text-sm text-muted hover:text-fg">
            <span aria-hidden>←</span> Back to event
          </Link>
          <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">{l.name}</h1>
          <p className="text-sm text-muted">{fmtRange(l.startsAt, l.endsAt)}</p>
          {lanClan && (
            <Link href={`/clans/${lanClan.slug}`} className="mt-1.5 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
              <ClanAvatar clan={lanClan} size={20} />
              <span className="truncate">
                Managed by <span className="text-fg">{lanClan.name}</span>
              </span>
            </Link>
          )}
        </div>
        <a href={`/lans/${l.id}/manage/export`} className={btnSecondary}>
          Export CSV
        </a>
      </div>

      <div className="sticky top-14 z-20 -mx-4 bg-ink/95 px-4 backdrop-blur sm:mx-0 sm:px-0">
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
              <p className="text-muted">
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
                  <summary className="cursor-pointer text-muted">Sent reminders ({reminders.length})</summary>
                  <ul className="mt-2 space-y-1 text-xs text-muted">
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
          others={users
            .filter((u) => !inLan.has(u.id) && memberIds.has(u.id))
            .map((u) => ({ id: u.id, name: personLabel(u, names.get(u.id)) }))
            .sort((a, b) => a.name.localeCompare(b.name))}
        />
      )}

      {tab === "seats" && (
        // The seat plan is the main tool, so it gets the full width on top; setup, publishing and wishes sit below,
        // side by side on wide screens.
        <div className="space-y-5">
          {seats.length > 0 && (
            <Card title="Seat plan">
              <SeatMap
                lanId={l.id}
                rows={l.seatRows}
                cols={l.seatCols}
                meId={me.id}
                mode="admin"
                seats={seats.map((s) => ({ ...s, nick: s.userId ? (names.get(s.userId) ?? "?") : null }))}
                assignable={going
                  .map((r) => {
                    const w = wishChecks.find((c) => c.userId === r.userId);
                    return {
                      id: r.userId,
                      nick: names.get(r.userId) ?? "?",
                      name: userById.get(r.userId)?.name,
                      lanAccount: lanIds.get(r.userId) || undefined,
                      ticket: r.paid ? ("ok" as const) : r.ticketBought ? ("reported" as const) : ("open" as const),
                      wishes: w ? { ok: w.ok, missed: w.missed } : undefined,
                    };
                  })
                  .sort((a, b) => a.nick.localeCompare(b.nick))}
              />
            </Card>
          )}
          <div className="grid items-start gap-5 lg:grid-cols-2">
          <Card title="Our seats">
            <p className="mb-4 text-sm text-muted">
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
            <Card title="Seat picking" actions={l.seatPicking && !l.seatsPublishedAt ? <Pill tone="emerald">open</Pill> : <Pill>closed</Pill>}>
              <p className="mb-3 text-sm text-muted">
                {l.seatPicking && !l.seatsPublishedAt
                  ? "Members who are coming and have ticked \"I have my ticket\" can take a free seat on the event page. Held seats stay out of reach. You can still move anyone here. Close picking, then publish the plan."
                  : l.seatsPublishedAt
                    ? "The plan is published, so members can't pick seats."
                    : "Optional first phase: let members choose their own free seat before you finish and publish the plan."}
              </p>
              {!l.seatsPublishedAt && (
                <form action={setSeatPicking.bind(null, l.id, !l.seatPicking)}>
                  <button className={l.seatPicking ? btnSecondary : btnPrimary}>
                    {l.seatPicking ? "Close seat picking" : "Let members pick their seats"}
                  </button>
                </form>
              )}
            </Card>
          )}
          {seats.length > 0 && (
            <Card title="Publish">
              <PublishSeats
                lanId={l.id}
                publishedAt={l.seatsPublishedAt ? fmtDate(l.seatsPublishedAt) : null}
                unseated={going.length - seated}
              />
            </Card>
          )}
          {wishChecks.length > 0 && (
            <Card title="Seat wishes">
              <ul className="space-y-2 text-sm">
                {wishChecks.map((w) => (
                  <li key={w.userId} className="flex flex-wrap gap-1.5">
                    <span className="mr-1 font-medium">{names.get(w.userId)}</span>
                    {w.ok.map((t) => (
                      <Pill key={t} tone="emerald">
                        ✓ {t}
                      </Pill>
                    ))}
                    {w.missed.map((t) => (
                      <Pill key={t} tone="red">
                        ✗ {t}
                      </Pill>
                    ))}
                  </li>
                ))}
              </ul>
              {wishNotes.length > 0 && (
                <div className="mt-4 border-t border-line pt-3">
                  <p className="mb-2 text-xs uppercase tracking-wide text-faint">Notes</p>
                  <ul className="space-y-1 text-sm">
                    {wishNotes.map((r) => (
                      <li key={r.id}>
                        <span className="font-medium">{names.get(r.userId)}:</span>{" "}
                        <span className="text-fg/90">{r.wishNote}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          )}
          </div>
        </div>
      )}

      {tab === "chat" && (
        <Card title="Discord & WhatsApp">
          <div className="space-y-5 text-sm">
            <div className="space-y-2">
              <h3 className="font-semibold text-fg">Discord</h3>
              {!discordEnabled() ? (
                <p className="text-muted">
                  The Discord bot isn&apos;t set up.{" "}
                  {me.role === "admin" ? (
                    <Link href="/admin/settings?tab=discord" className="text-bit hover:underline">
                      Add the bot token in the platform settings.
                    </Link>
                  ) : (
                    "Ask a Seatbit admin to add the bot token in the platform settings."
                  )}
                </p>
              ) : discordChannels === 0 ? (
                <p className="text-muted">
                  {lanClan?.name ?? "This clan"} has no Discord channel yet.{" "}
                  {invite && (
                    <a href={invite} target="_blank" rel="noreferrer" className="text-bit hover:underline">
                      Invite the bot
                    </a>
                  )}{" "}
                  to your server, then run <code>/seatbit here</code> in the channel it should post in.
                  {lanClan && invite && (
                    <>
                      {" "}
                      Manage linked channels in{" "}
                      <Link href={`/clans/${lanClan.slug}/settings?tab=chat`} className="text-bit hover:underline">
                        clan settings
                      </Link>
                      .
                    </>
                  )}
                </p>
              ) : (
                <p className="text-muted">
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
              <h3 className="font-semibold text-fg">WhatsApp</h3>
              <p className="text-muted">Ready-made messages for the community. Copy one and paste it into the group.</p>
              <WhatsAppTexts texts={await whatsappTexts(l)} />
            </div>
          </div>
        </Card>
      )}

      {tab === "settings" && (
        <div className="space-y-5">
          <Card title="Details">
            <LanForm
              types={db.select().from(schema.lanType).where(eq(schema.lanType.clanId, l.clanId ?? "")).all()}
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
            <p className="mb-3 text-sm text-muted">
              Orgas manage this LAN and are shown to members as contacts. Global admins can always manage it too.
            </p>
            <OrgaManager
              lanId={l.id}
              orgas={orgaIds.map((uid) => ({ id: uid, name: names.get(uid) ?? userById.get(uid)?.name ?? "?" }))}
              candidates={users
                .filter((u) => !orgaIds.includes(u.id) && memberIds.has(u.id))
                .map((u) => ({ id: u.id, name: personLabel(u, names.get(u.id)) }))
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
    <Link href={href} className="rounded-card border border-line bg-surface p-4 hover:border-muted/50">
      <p className="text-xs uppercase tracking-wide text-faint">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-muted">{sub}</p>
    </Link>
  );
}

function DateItem({ label, d, now }: { label: string; d: Date | null; now: Date }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-faint">{label}</dt>
      <dd>
        {d ? (
          <>
            {fmtDate(d)} <span className={d < now ? "text-faint" : "text-warn"}>({relative(d, now)})</span>
          </>
        ) : (
          <span className="text-faint">—</span>
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
