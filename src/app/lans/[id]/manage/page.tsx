import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { deleteLan, setSeatPicking } from "@/app/actions";
import { AttendanceTable } from "@/components/attendance-table";
import { LanForm } from "@/components/lan-form";
import { ReminderButtons } from "@/components/reminder-buttons";
import { SeatMap } from "@/components/seat-map";
import { avatarMap } from "@/lib/avatars";
import { EventHeader } from "@/components/event-header";
import { Card, Page, Pill, btnDanger, btnPrimary, btnSecondary } from "@/components/ui";
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
import { canManageClan, getClan } from "@/lib/clans";
import { PublishSeats } from "@/components/publish-seats";
import { checkWishes } from "@/lib/seating";
import { getLanAccounts } from "@/lib/lan-accounts";
import { personLabel } from "@/lib/names";
import { RemindToBookButton } from "@/components/seat-booking";
import { SeatSwapApprovals, type SwapView } from "@/components/seat-swaps";

const { attendance, seat, user, reminderLog } = schema;

// Same order as the event page (Overview, Seats, Attendees), then the orga-only tabs.
const TABS = [
  ["overview", "Overview"],
  ["seats", "Seats"],
  ["attendees", "Attendees"],
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
  const avatars = avatarMap(users);
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
        avatar: avatars.get(r.userId),
        name: u.name,
        email: u.isGuest ? (u.inviteEmail ? `guest, invited at ${u.inviteEmail}` : "guest, no login yet") : u.email,
        status: r.status,
        paid: r.paid,
        ticketBought: r.ticketBought,
        note: r.note,
        lanAccount: lanIds.get(r.userId) ?? "",
        seat: seatOf.get(r.userId) ?? null,
        seatId: seats.find((s) => s.userId === r.userId)?.id ?? null,
        seatBooked: l.externalPlanUrl && l.seatsPublishedAt ? r.seatBooked : null,
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
  const seatedGoing = going.filter((r) => seatOf.has(r.userId));
  const bookedCount = seatedGoing.filter((r) => r.seatBooked).length;
  const swaps: SwapView[] = db
    .select()
    .from(schema.seatSwap)
    .where(and(eq(schema.seatSwap.lanId, id), inArray(schema.seatSwap.status, ["pending", "accepted"])))
    .all()
    .map((s) => ({
      id: s.id,
      fromUserId: s.fromUserId,
      toUserId: s.toUserId,
      fromNick: names.get(s.fromUserId) ?? "?",
      toNick: names.get(s.toUserId) ?? "?",
      fromSeat: seatOf.get(s.fromUserId) ?? null,
      toSeat: seatOf.get(s.toUserId) ?? null,
      status: s.status as SwapView["status"],
      note: s.note,
    }));
  const swapsToApprove = swaps.filter((s) => s.status === "accepted").length;

  const seatCards = (
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
          {swaps.length > 0 && (
            <Card title="Seat swaps" actions={swapsToApprove > 0 && <Pill tone="amber">{swapsToApprove} to approve</Pill>}>
              <p className="mb-3 text-sm text-muted">
                Members asked each other to swap. Approving swaps the two seats and tells both.
                {l.externalPlanUrl && " They then need to rebook on the event site."}
              </p>
              <SeatSwapApprovals swaps={swaps} />
            </Card>
          )}
          {seats.length > 0 && l.seatsPublishedAt && (
            <Card
              title="Booking on the event site"
              actions={l.externalPlanUrl ? <Pill tone={bookedCount === seatedGoing.length ? "emerald" : "amber"}>{bookedCount} / {seatedGoing.length} booked</Pill> : undefined}
            >
              {l.externalPlanUrl ? (
                <div className="space-y-3 text-sm">
                  <p className="text-muted">
                    Everyone books their seat on the{" "}
                    <a href={l.externalPlanUrl} target="_blank" rel="noreferrer" className="text-bit hover:underline">
                      event&apos;s seat plan
                    </a>{" "}
                    themselves and ticks &ldquo;I booked it&rdquo; (on the event page or in the Discord DM). A new seat
                    clears the tick.
                  </p>
                  {seatedGoing.length > bookedCount && (
                    <p>
                      <span className="text-faint">Not booked yet: </span>
                      {seatedGoing
                        .filter((r) => !r.seatBooked)
                        .map((r) => `${names.get(r.userId) ?? "?"} (${seatOf.get(r.userId)})`)
                        .join(", ")}
                    </p>
                  )}
                  <RemindToBookButton lanId={l.id} open={seatedGoing.length - bookedCount} />
                </div>
              ) : (
                <p className="text-sm text-muted">
                  Add the event&apos;s seat plan link in{" "}
                  <Link href={`/lans/${l.id}/manage?tab=settings`} className="text-bit hover:underline">
                    Settings
                  </Link>{" "}
                  to track who booked their seat there.
                </p>
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
  );

  return (
    <Page>
      <EventHeader
        lan={l}
        clan={lanClan}
        mode="manage"
        canManage
        tab={tab}
        actions={
          <a href={`/lans/${l.id}/manage/export`} className={btnSecondary}>
            Export CSV
          </a>
        }
      />

      <Tabs
        tabs={TABS.map(([t, label]) => ({
          id: t,
          label,
          badge:
            t === "attendees" && ticketsReported
              ? `${ticketsReported} to confirm`
              : t === "seats" && swapsToApprove
                ? `${swapsToApprove} swap${swapsToApprove > 1 ? "s" : ""} to approve`
                : t === "seats" && going.length - seated > 0 && seats.length
                  ? `${going.length - seated} unseated`
                  : undefined,
        }))}
        active={tab}
        hrefFor={(t) => `/lans/${l.id}/manage?tab=${t}`}
      />

      {tab === "overview" && (
        // Same shape as the event page: the main things on the left, dates in a sidebar on the right.
        <div className="grid grid-cols-1 items-start gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] 2xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="order-last space-y-4 sm:space-y-6 lg:order-none lg:col-start-2 lg:row-start-1">
            <Card title="Dates">
              <dl className="space-y-3 text-sm">
                <DateItem label="Answer by" d={l.signupDeadline} now={now} />
                <DateItem label="Buy ticket by" d={l.paymentDueDate} now={now} />
                <DateItem label="Starts" d={l.startsAt} now={now} />
              </dl>
              <Link href={`/lans/${l.id}/manage?tab=settings`} className="mt-4 inline-block text-sm text-bit hover:underline">
                Change dates
              </Link>
            </Card>
          </div>
          <div className="min-w-0 space-y-4 sm:space-y-6 lg:col-start-1 lg:row-start-1">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Stat label="Coming" value={`${going.length}${l.capacity ? ` / ${l.capacity}` : ""}`} sub={`${count("waitlist")} waitlist`} href={`/lans/${l.id}/manage?tab=attendees`} />
            <Stat label="Unsure / no answer" value={`${count("maybe")} / ${noAnswer}`} sub={`${count("declined")} not coming`} href={`/lans/${l.id}/manage?tab=attendees`} />
            <Stat label="Tickets" value={`${ticketsConfirmed} / ${going.length}`} sub={`${ticketsReported} to confirm`} href={`/lans/${l.id}/manage?tab=attendees`} />
            <Stat label="Seats" value={`${seated} / ${going.length}`} sub={seats.length ? `${freeSeats} free of ${seats.length}` : "no seats yet"} href={`/lans/${l.id}/manage?tab=seats`} />
          </div>

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
                draft={!l.publishedAt}
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
        </div>
      )}

      {tab === "attendees" && (
        <AttendanceTable
          lanId={l.id}
          profileBase={lanClan ? `/clans/${lanClan.slug}/members/` : null}
          rows={tableRows}
          seats={[...seats].sort((a, b) => a.row - b.row || a.col - b.col)}
          others={users
            .filter((u) => !inLan.has(u.id) && memberIds.has(u.id))
            .map((u) => ({ id: u.id, name: personLabel(u, names.get(u.id)) }))
            .sort((a, b) => a.name.localeCompare(b.name))}
        />
      )}

      {tab === "seats" && (
        // The seat plan is the main tool: map on the left with setup, publishing and wishes below it, and the seat
        // details panel in its own column on the right (desktop).
        <div className="space-y-5">
          {seats.length > 0 ? (
              <SeatMap
                lanId={l.id}
                rows={l.seatRows}
                cols={l.seatCols}
                meId={me.id}
                mode="admin"
                seats={seats.map((s) => ({ ...s, nick: s.userId ? (names.get(s.userId) ?? "?") : null, color: s.userId ? (avatars.get(s.userId)?.color ?? null) : null }))}
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
              >
                {seatCards}
              </SeatMap>
          ) : (
            seatCards
          )}
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
                  draft={!l.publishedAt}
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
                externalPlanUrl: l.externalPlanUrl,
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
    </Page>
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
    <div className="flex justify-between gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right">
        {d ? (
          <>
            {fmtDate(d)}
            <span className={`block text-xs ${d < now ? "text-faint" : "text-warn"}`}>{relative(d, now)}</span>
          </>
        ) : (
          <span className="text-faint">not set</span>
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
