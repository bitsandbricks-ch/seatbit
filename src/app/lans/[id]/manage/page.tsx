import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { profileLink, profilePattern } from "@/lib/profile-link";
import type { Attendance } from "@/db/schema";
import { deleteLan } from "@/app/actions";
import { AttendanceTable } from "@/components/attendance-table";
import { LanForm } from "@/components/lan-form";
import { ReminderButtons } from "@/components/reminder-buttons";
import { SeatMap } from "@/components/seat-map";
import { avatarMap } from "@/lib/avatars";
import { EventHeader } from "@/components/event-header";
import { Card, Notice, Page, Pill, btnDanger, btnSecondary } from "@/components/ui";
import { fmtDate, relative, toInputValue } from "@/lib/format";
import { freeSpots, getLan, getNames, interestSwitch, seatView, waitlistOf } from "@/lib/lans";
import { WaitlistPanel } from "@/components/waitlist-panel";
import { dueKinds } from "@/lib/reminders";
import { isLanManager, requireUser } from "@/lib/session";
import { OrgaManager } from "@/components/orga-manager";
import { SeatSetup } from "@/components/seat-setup";
import { Tabs } from "@/components/tabs";
import { DiscordButtons, WhatsAppTexts } from "@/components/chat-panel";
import { whatsappTexts } from "@/lib/announce";
import { discordEnabled, inviteUrl } from "@/lib/discord-api";
import { clanCan, getClan } from "@/lib/clans";
import { SeatFlow } from "@/components/seat-flow";
import { checkWishes } from "@/lib/seating";
import { getLanAccounts } from "@/lib/lan-accounts";
import { LeadBookingList } from "@/components/seat-booking";
import { LeadChecklist } from "@/components/lead-checklist";
import { buildLeadChecklist } from "@/lib/lead-checklist";
import { SeatSwapApprovals, type SwapView } from "@/components/seat-swaps";
import { WhoIsMissing, type MissingGroupView } from "@/components/who-is-missing";
import { MISSING_STEPS, NUDGE_COOLDOWN_MS, whoIsMissing, type MissingStep } from "@/lib/missing";
import { CancelEvent, CopyNextYear, DeleteNewsButton, NewsComposer } from "@/components/event-extras";
import { getT } from "@/i18n/server";
import type { T } from "@/i18n/translate";

const { attendance, seat, user, reminderLog } = schema;

const hasWishes = (a: Attendance) =>
  (a.wishNear?.length ?? 0) > 0 || (a.wishAvoid?.length ?? 0) > 0 || a.wishPosition !== "any" || !!a.wishSeat || !!a.wishNote;

// Same order as the event page (Overview, Seats, Attendees), then the lead-only tabs.
const TABS = [
  ["overview", "event.tabs.overview"],
  ["seats", "event.tabs.seats"],
  ["attendees", "manage.tabs.attendees"],
  ["missing", "manage.tabs.missing"],
  ["chat", "manage.tabs.chat"],
  ["settings", "manage.tabs.settings"],
] as const;
type Tab = (typeof TABS)[number][0];

export default async function ManageLanPage({ params, searchParams }: PageProps<"/lans/[id]/manage">) {
  const { id } = await params;
  const sp = await searchParams;
  const tab: Tab = TABS.some(([x]) => x === sp.tab) ? (sp.tab as Tab) : "overview";
  const me = await requireUser({ next: `/lans/${id}/manage` });
  const t = await getT();
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
  const people = await getNames(id, users.map((u) => u.id));
  // Names as the clan shows them (the bare nick only inside small seat cells); the attendee list keeps the full name next to it for ticket checks.
  const names = new Map([...people].map(([uid, n]) => [uid, n.label]));
  const avatars = avatarMap(users);
  const lanIds = getLanAccounts(l, rows.map((r) => r.userId));
  const profilePat = profilePattern(
    l,
    l.typeId ? db.select().from(schema.lanType).where(eq(schema.lanType.id, l.typeId)).get() : null,
  );
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
  const invite = lanClan && clanCan(me, lanClan.id, "settings") ? inviteUrl() : null;

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
        nick: people.get(r.userId)?.nick ?? u.name,
        avatar: avatars.get(r.userId),
        name: names.get(r.userId) ?? u.name,
        full: people.get(r.userId)?.full ?? u.name,
        email: u.isGuest ? (u.inviteEmail ? t("manage.guestInvited", { email: u.inviteEmail }) : t("manage.guestNoLogin")) : u.email,
        status: r.status,
        paid: r.paid,
        ticketBought: r.ticketBought,
        note: r.note,
        lanAccount: lanIds.get(r.userId) ?? "",
        profileUrl: profileLink(profilePat, lanIds.get(r.userId)),
        seat: seatOf.get(r.userId) ?? null,
        seatId: seats.find((s) => s.userId === r.userId)?.id ?? null,
        seatBooked: l.externalPlanUrl && l.seatsPublishedAt ? r.seatBooked : null,
      };
    })
    .sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || a.name.localeCompare(b.name));

  const free = freeSpots(l);
  const waitlist = waitlistOf(id).map((r) => ({
    userId: r.userId,
    name: names.get(r.userId) ?? userById.get(r.userId)?.name ?? "?",
    full: people.get(r.userId)?.full ?? userById.get(r.userId)?.name ?? "?",
    avatar: avatars.get(r.userId),
    since: t("manage.since", { date: fmtDate(r.waitlistedAt ?? r.createdAt, t.locale) }),
    ticket: r.paid ? ("confirmed" as const) : r.ticketBought ? ("reported" as const) : null,
  }));
  // Leads pick by hand and a spot is free: say so on the overview.
  const spotToFill = !l.waitlistAuto && waitlist.length > 0 && !!free;

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
  const wishChecks = checkWishes(seats, planPeople, (uid) => names.get(uid) ?? "?", t);
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
      fromName: names.get(s.fromUserId) ?? "?",
      toName: names.get(s.toUserId) ?? "?",
      fromSeat: seatOf.get(s.fromUserId) ?? null,
      toSeat: seatOf.get(s.toUserId) ?? null,
      status: s.status as SwapView["status"],
      note: s.note,
    }));
  const swapsToApprove = swaps.filter((s) => s.status === "accepted").length;
  const leadSteps = buildLeadChecklist({
    lan: l,
    going: going.length,
    ticketsToConfirm: ticketsReported,
    ticketsConfirmed,
    seats: seats.length,
    seated,
    booked: bookedCount,
    spotsToFill: spotToFill ? Math.min(free ?? 0, waitlist.length) : 0,
    swapsToApprove,
    t,
  });
  const news = db
    .select()
    .from(schema.lanNews)
    .where(eq(schema.lanNews.lanId, id))
    .orderBy(desc(schema.lanNews.createdAt))
    .all();

  // Who's missing: per step, who still owes something. Names for people outside the clan list come from getNames too.
  const missing = whoIsMissing(l);
  const missingIds = [...new Set(missing.flatMap((g) => g.people.map((p) => p.userId)))];
  const missingNames = missingIds.some((uid) => !names.has(uid)) ? await getNames(id, missingIds) : null;
  const memberMissing = new Set(
    missing.filter((g) => MISSING_STEPS[g.step].who === "member").flatMap((g) => g.people.map((p) => p.userId)),
  ).size;
  const fixes: Partial<Record<MissingStep, MissingGroupView["fix"]>> = {
    confirm: { href: `/lans/${l.id}/manage?tab=attendees`, label: t("missingSteps.fix.confirm") },
    assign: { href: `/lans/${l.id}/manage?tab=seats`, label: t("missingSteps.fix.assign") },
    book: { href: `/lans/${l.id}/manage?tab=seats#booking`, label: t("missingSteps.fix.book") },
  };
  const missingGroups: MissingGroupView[] = missing.map((g) => ({
    step: g.step,
    title: t(`missingSteps.title.${g.step}`),
    hint: t(`missingSteps.hint.${g.step}`),
    who: MISSING_STEPS[g.step].who,
    fix: fixes[g.step],
    people: g.people
      .map((p) => ({
        userId: p.userId,
        name: names.get(p.userId) ?? missingNames?.get(p.userId)?.label ?? "?",
        avatar: avatars.get(p.userId),
        discord: p.reach.discord,
        email: p.reach.email,
        nudgedAt: p.nudgedAt,
        detail: p.detail,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }));

  const seatCards = (
          <div className="grid items-start gap-5 lg:grid-cols-2">
          <Card title={t("manage.ourSeats")}>
            <p className="mb-4 text-sm text-muted">{t("manage.ourSeatsHint")}</p>
            <SeatSetup
              lanId={l.id}
              current={seatSpec(seats)}
              unseated={going.length - seated}
              free={freeSeats}
            />
          </Card>
          {seats.length > 0 && (
            <Card
              title={t("manage.seatSteps")}
              actions={l.seatsPublishedAt ? <Pill tone="emerald">{t("manage.final")}</Pill> : <Pill tone="amber">{t("manage.notFinal")}</Pill>}
            >
              <SeatFlow
                lanId={l.id}
                finalizedAt={l.seatsPublishedAt ? fmtDate(l.seatsPublishedAt, t.locale) : null}
                picking={l.seatPicking && !l.seatsPublishedAt}
                going={going.length}
                unseated={going.length - seated}
                wishes={going.filter(hasWishes).length}
              />
            </Card>
          )}
          {swaps.length > 0 && (
            <Card
              title={t("manage.seatSwaps")}
              actions={swapsToApprove > 0 && <Pill tone="amber">{t("manage.toApprove", { count: swapsToApprove })}</Pill>}
            >
              <p className="mb-3 text-sm text-muted">
                {t("manage.swapsHint")}
                {l.externalPlanUrl && ` ${t("manage.swapsRebook")}`}
              </p>
              <SeatSwapApprovals swaps={swaps} />
            </Card>
          )}
          {seats.length > 0 && l.seatsPublishedAt && (
            <Card
              id="booking"
              title={t("manage.booking")}
              actions={
                l.externalPlanUrl ? (
                  <Pill tone={bookedCount === seatedGoing.length ? "emerald" : "amber"}>
                    {t("manage.bookedOf", { booked: bookedCount, count: seatedGoing.length })}
                  </Pill>
                ) : undefined
              }
            >
              {l.externalPlanUrl ? (
                <div className="space-y-3 text-sm">
                  <p className="text-muted">
                    {t.rich("manage.bookingHint", {
                      plan: (
                        <a href={l.externalPlanUrl} target="_blank" rel="noreferrer" className="text-bit hover:underline">
                          {t("manage.eventSeatPlan")}
                        </a>
                      ),
                    })}
                  </p>
                  <LeadBookingList
                    lanId={l.id}
                    rows={seatedGoing
                      .map((r) => ({
                        userId: r.userId,
                        name: names.get(r.userId) ?? "?",
                        seat: seatOf.get(r.userId) ?? "",
                        lanAccount: lanIds.get(r.userId) || undefined,
                        booked: r.seatBooked,
                      }))
                      .sort((x, y) => x.seat.localeCompare(y.seat, undefined, { numeric: true }))}
                  />
                </div>
              ) : (
                <p className="text-sm text-muted">
                  {t.rich("manage.bookingNoLink", {
                    settings: (
                      <Link href={`/lans/${l.id}/manage?tab=settings`} className="text-bit hover:underline">
                        {t("manage.tabs.settings")}
                      </Link>
                    ),
                  })}
                </p>
              )}
            </Card>
          )}
          {wishChecks.length > 0 && (
            <Card title={t("cmd.seatWishes")}>
              <ul className="space-y-2 text-sm">
                {wishChecks.map((w) => (
                  <li key={w.userId} className="flex flex-wrap gap-1.5">
                    <span className="mr-1 font-medium">{names.get(w.userId)}</span>
                    {w.ok.map((x) => (
                      <Pill key={x} tone="emerald">
                        ✓ {x}
                      </Pill>
                    ))}
                    {w.missed.map((x) => (
                      <Pill key={x} tone="red">
                        ✗ {x}
                      </Pill>
                    ))}
                  </li>
                ))}
              </ul>
              {wishNotes.length > 0 && (
                <div className="mt-4 border-t border-line pt-3">
                  <p className="mb-2 text-xs uppercase tracking-wide text-faint">{t("manage.notes")}</p>
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
            {t("manage.exportCsv")}
          </a>
        }
      />

      <Tabs
        tabs={TABS.map(([id, label]) => ({
          id,
          label: t(label),
          badge:
            id === "attendees" && ticketsReported
              ? t("manage.badge.toConfirm", { count: ticketsReported })
              : id === "missing" && memberMissing
                ? `${memberMissing}`
                : id === "seats" && swapsToApprove
                  ? t("manage.badge.swaps", { count: swapsToApprove })
                  : id === "seats" && going.length - seated > 0 && seats.length
                    ? t("manage.badge.unseated", { count: going.length - seated })
                    : undefined,
        }))}
        active={tab}
        hrefFor={(tb) => `/lans/${l.id}/manage?tab=${tb}`}
      />

      {/* Full width, so all steps fit in one row on desktop. */}
      {tab === "overview" && <LeadChecklist steps={leadSteps} />}
      {tab === "overview" && (
        // Same shape as the event page: the main things on the left, dates in a sidebar on the right.
        <div className="grid grid-cols-1 items-start gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] 2xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="order-last space-y-4 sm:space-y-6 lg:order-none lg:col-start-2 lg:row-start-1">
            <Card title={t("manage.dates")}>
              <dl className="space-y-3 text-sm">
                <DateItem t={t} label={t("notice.field.answerBy")} d={l.signupDeadline} now={now} />
                <DateItem t={t} label={t("manage.buyTicketBy")} d={l.paymentDueDate} now={now} />
                {l.dateTbd ? (
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted">{t("manage.starts")}</dt>
                    <dd className="text-right text-faint">{l.dateHint || t("manage.notSetYet")}</dd>
                  </div>
                ) : (
                  <DateItem t={t} label={t("manage.starts")} d={l.startsAt} now={now} />
                )}
              </dl>
              <Link href={`/lans/${l.id}/manage?tab=settings`} className="mt-4 inline-block text-sm text-bit hover:underline">
                {t("manage.changeDates")}
              </Link>
            </Card>
          </div>
          <div className="min-w-0 space-y-4 sm:space-y-6 lg:col-start-1 lg:row-start-1">
          {spotToFill && (
            <Notice tone="warn">
              {t("manage.spotsFree", { count: free ?? 0, waiting: waitlist.length })}{" "}
              <Link href={`/lans/${l.id}/manage?tab=attendees#waitlist`} className="font-medium underline">
                {t("manage.pickWhoMovesUp")}
              </Link>
            </Notice>
          )}
          {/* The numbers at a glance, one compact strip; each opens the tab with the details. */}
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-4">
            <Stat
              label={t("bot.coming")}
              value={`${going.length}${l.capacity ? ` / ${l.capacity}` : ""}`}
              sub={t("manage.stat.waitlist", { count: count("waitlist") })}
              href={`/lans/${l.id}/manage?tab=attendees`}
            />
            <Stat
              label={t("manage.stat.unsureNoAnswer")}
              value={`${count("maybe")} / ${noAnswer}`}
              sub={t("manage.stat.notComing", { count: count("declined") })}
              href={`/lans/${l.id}/manage?tab=missing`}
            />
            <Stat
              label={t("bot.tickets")}
              value={`${ticketsConfirmed} / ${going.length}`}
              sub={t("manage.badge.toConfirm", { count: ticketsReported })}
              href={`/lans/${l.id}/manage?tab=attendees`}
            />
            <Stat
              label={t("event.tabs.seats")}
              value={`${seated} / ${going.length}`}
              sub={seats.length ? t("manage.stat.freeOf", { free: freeSeats, count: seats.length }) : t("manage.stat.noSeats")}
              href={`/lans/${l.id}/manage?tab=seats`}
            />
          </div>

          <Card title={t("manage.news")}>
            <NewsComposer lanId={l.id} published={!!l.publishedAt} />
            {news.length > 0 && (
              <ul className="mt-4 space-y-3 border-t border-line pt-4">
                {news.slice(0, 5).map((n) => (
                  <li key={n.id} className="text-sm">
                    <p className="whitespace-pre-wrap text-fg/90">{n.text}</p>
                    <p className="mt-1 flex items-center gap-3 text-xs text-faint">
                      {n.authorId ? (names.get(n.authorId) ?? "Lead") : "Lead"} · {fmtDate(n.createdAt, t.locale)}
                      <DeleteNewsButton id={n.id} />
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {going.some((r) => r.arrivedAt) && (
            <Card title={t("manage.checkIn")}>
              <p className="text-sm">
                <span className="font-semibold text-fg">{going.filter((r) => r.arrivedAt).length}</span>
                <span className="text-muted"> {t("manage.ofHere", { count: going.length })}</span>{" "}
                <span className="text-muted">
                  {t("manage.onTheWay")}:{" "}
                  {going.filter((r) => !r.arrivedAt).map((r) => names.get(r.userId) ?? "?").join(", ") || t("manage.nobody")}
                </span>
              </p>
            </Card>
          )}

          <Card title={t("manage.reminders")}>
            <div className="space-y-4 text-sm">
              <p className="text-muted">{t("manage.remindersHint", { count: l.reminderDays })}</p>
              {due.length > 0 && (
                <p className="text-warn">{t("manage.windowOpen", { kinds: due.map((k) => t(`manage.reminderKind.${k as "signup" | "payment" | "event"}`)).join(", ") })}</p>
              )}
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
                  <summary className="cursor-pointer text-muted">{t("manage.sentReminders", { count: reminders.length })}</summary>
                  <ul className="mt-2 space-y-1 text-xs text-muted">
                    {reminders
                      .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())
                      .map((r) => (
                        <li key={r.id}>
                          {fmtDate(r.sentAt, t.locale)} · {r.kind} · {names.get(r.userId) ?? "?"}
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

      {tab === "attendees" && (l.capacity != null || waitlist.length > 0) && (
        <div id="waitlist" className="mb-4 scroll-mt-20 sm:mb-6">
          <Card
            title={`${t("event.waitlist")} (${waitlist.length})`}
            actions={
              l.capacity != null && (
                <Pill tone={free ? "emerald" : "amber"}>{t("manage.comingOf", { going: going.length, capacity: l.capacity })}</Pill>
              )
            }
          >
            <WaitlistPanel
              lanId={l.id}
              entries={waitlist}
              free={free}
              auto={l.waitlistAuto}
              profileBase={lanClan ? `/clans/${lanClan.slug}/members/` : null}
            />
          </Card>
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
            .map((u) => ({ id: u.id, name: names.get(u.id) ?? u.name }))
            .sort((a, b) => a.name.localeCompare(b.name))}
        />
      )}

      {tab === "missing" && (
        <WhoIsMissing
          lanId={l.id}
          groups={missingGroups}
          profileBase={lanClan ? `/clans/${lanClan.slug}/members/` : null}
          blocked={
            l.cancelledAt ? t("manage.nudgeCancelled") : !l.publishedAt ? t("manage.nudgeDraft") : null
          }
          cooldownMs={NUDGE_COOLDOWN_MS}
        />
      )}

      {tab === "seats" && (
        // The seat plan is the main tool: map on the left with setup, the seat flow (wishes, self pick, finalize) and wishes below it, and the seat
        // details panel in its own column on the right (desktop).
        <div className="space-y-5">
          {seats.length > 0 ? (
              <SeatMap
                lanId={l.id}
                rows={l.seatRows}
                cols={l.seatCols}
                meId={me.id}
                mode="admin"
                seats={seats.map((s) => seatView(s, people, avatars))}
                assignable={going
                  .map((r) => {
                    const w = wishChecks.find((c) => c.userId === r.userId);
                    return {
                      id: r.userId,
                      name: names.get(r.userId) ?? "?",
                      lanAccount: lanIds.get(r.userId) || undefined,
                      profileUrl: profileLink(profilePat, lanIds.get(r.userId)) ?? undefined,
                      ticket: r.paid ? ("ok" as const) : r.ticketBought ? ("reported" as const) : ("open" as const),
                      wishes: w ? { ok: w.ok, missed: w.missed } : undefined,
                    };
                  })
                  .sort((a, b) => a.name.localeCompare(b.name))}
              >
                {seatCards}
              </SeatMap>
          ) : (
            seatCards
          )}
        </div>
      )}

      {tab === "chat" && (
        <Card title={t("manage.tabs.chat")}>
          <div className="space-y-5 text-sm">
            <div className="space-y-2">
              <h3 className="font-semibold text-fg">Discord</h3>
              {!discordEnabled() ? (
                <p className="text-muted">
                  {t("manage.botNotSetUp")}{" "}
                  {me.role === "admin" ? (
                    <Link href="/admin/settings?tab=discord" className="text-bit hover:underline">
                      {t("manage.addBotToken")}
                    </Link>
                  ) : (
                    t("manage.askAdminBot")
                  )}
                </p>
              ) : discordChannels === 0 ? (
                <p className="text-muted">
                  {t("manage.noChannel", { clan: lanClan?.name ?? t("manage.thisClan") })}{" "}
                  {t.rich("manage.inviteBot", {
                    invite: invite ? (
                      <a href={invite} target="_blank" rel="noreferrer" className="text-bit hover:underline">
                        {t("manage.inviteTheBot")}
                      </a>
                    ) : (
                      t("manage.inviteTheBot")
                    ),
                    command: <code>/seatbit here</code>,
                  })}
                  {lanClan && invite && (
                    <>
                      {" "}
                      {t.rich("manage.manageChannels", {
                        link: (
                          <Link href={`/clans/${lanClan.slug}/settings?tab=chat`} className="text-bit hover:underline">
                            {t("manage.clanSettings")}
                          </Link>
                        ),
                      })}
                    </>
                  )}
                </p>
              ) : (
                <p className="text-muted">{t("manage.posting", { channels: discordChannels, posts: discordPosts })}</p>
              )}
              {discordEnabled() && discordChannels > 0 && (
                <DiscordButtons
                  lanId={l.id}
                  draft={!l.publishedAt}
                  posted={discordPosts}
                  channels={discordChannels}
                  kinds={[
                    ...(l.signupDeadline ? [{ kind: "signup" as const, label: t("whatsapp.answerReminder") }] : []),
                    ...(l.paymentDueDate ? [{ kind: "payment" as const, label: t("whatsapp.ticketReminder") }] : []),
                    { kind: "event" as const, label: t("whatsapp.startsSoon") },
                  ]}
                />
              )}
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-fg">WhatsApp</h3>
              <p className="text-muted">{t("manage.whatsappHint")}</p>
              <WhatsAppTexts texts={await whatsappTexts(l, t)} />
            </div>
          </div>
        </Card>
      )}

      {tab === "settings" && (
        <div className="space-y-5">
          <Card title={t("manage.details")}>
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
                profileUrl: l.profileUrl,
                startsAt: toInputValue(l.startsAt),
                endsAt: toInputValue(l.endsAt),
                signupDeadline: toInputValue(l.signupDeadline),
                paymentDueDate: toInputValue(l.paymentDueDate),
                price: l.price,
                capacity: l.capacity?.toString() ?? "",
                reminderDays: l.reminderDays,
                interestCheck: l.interestCheck,
                interestSwitch: interestSwitch(l),
                dateTbd: l.dateTbd,
                dateHint: l.dateHint,
              }}
            />
          </Card>

          <Card title={t("manage.leads")}>
            <p className="mb-3 text-sm text-muted">{t("manage.leadsHint")}</p>
            <OrgaManager
              lanId={l.id}
              orgas={orgaIds.map((uid) => ({ id: uid, name: names.get(uid) ?? userById.get(uid)?.name ?? "?" }))}
              candidates={users
                .filter((u) => !orgaIds.includes(u.id) && memberIds.has(u.id))
                .map((u) => ({ id: u.id, name: names.get(u.id) ?? u.name }))
                .sort((a, b) => a.name.localeCompare(b.name))}
            />
          </Card>

          <Card title={t("manage.nextYear")}>
            <p className="mb-3 text-sm text-muted">{t("manage.nextYearHint")}</p>
            <CopyNextYear lanId={l.id} />
          </Card>

          {!l.cancelledAt && (
            <Card title={t("manage.cancel")}>
              <CancelEvent lanId={l.id} published={!!l.publishedAt} />
            </Card>
          )}

          {me.role === "admin" && (
            <Card title={t("manage.dangerZone")}>
              <form action={deleteLan.bind(null, l.id)}>
                <button className={btnDanger}>{t("manage.deleteLan")}</button>
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
    <Link href={href} className="min-w-0 bg-surface px-3 py-2.5 transition hover:bg-raised sm:px-4 sm:py-3">
      <p className="truncate text-xs text-muted">{label}</p>
      <p className="text-xl font-bold tabular-nums">{value}</p>
      <p className="truncate text-xs text-faint">{sub}</p>
    </Link>
  );
}

function DateItem({ t, label, d, now }: { t: T; label: string; d: Date | null; now: Date }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right">
        {d ? (
          <>
            {fmtDate(d, t.locale)}
            <span className={`block text-xs ${d < now ? "text-faint" : "text-warn"}`}>{relative(d, now, t.locale)}</span>
          </>
        ) : (
          <span className="text-faint">{t("manage.notSet")}</span>
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
