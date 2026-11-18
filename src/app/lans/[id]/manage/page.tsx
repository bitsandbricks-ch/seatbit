import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { profileLink, profilePattern } from "@/lib/profile-link";
import { deleteLan } from "@/app/actions";
import { AttendanceTable } from "@/components/attendance-table";
import { LanForm } from "@/components/lan-form";
import { ReminderButtons } from "@/components/reminder-buttons";
import { SeatMap } from "@/components/seat-map";
import { avatarMap } from "@/lib/avatars";
import { EventHeader } from "@/components/event-header";
import { Card, Notice, Page, Pill, btnDanger, headerAction, headerActionFrame, inlineLink } from "@/components/ui";
import { fmtDate, fmtTime, relative, toInputValue } from "@/lib/format";
import { runningSeatSearch, thoroughMinutes } from "@/lib/seat-search";
import { capacityOf, freeSpots, getLan, getNames, interestSwitch, seatView, waitlistOf } from "@/lib/lans";
import { WaitlistPanel } from "@/components/waitlist-panel";
import { dueKinds } from "@/lib/reminders";
import { isLanManager, requireUser } from "@/lib/session";
import { platformCan } from "@/lib/platform-roles";
import { OrgaManager } from "@/components/orga-manager";
import { SeatSetup } from "@/components/seat-setup";
import { ClientTabs, TabPanel, type ClientTab } from "@/components/client-tabs";
import { DiscordButtons, WhatsAppTexts } from "@/components/chat-panel";
import { whatsappTexts } from "@/lib/announce";
import { discordEnabled, inviteUrl } from "@/lib/discord-api";
import { memberBadges } from "@/lib/member-badges";
import { clanCan, getClan } from "@/lib/clans";
import { SeatFlow } from "@/components/seat-flow";
import { checkWishes, overallScore } from "@/lib/seating";
import { WishOverview, type WishRow } from "@/components/wish-overview";
import { WishLeadEditor } from "@/components/wish-lead-editor";
import { normalizeRules, rulePeople } from "@/lib/seat-rules";
import { seatRow } from "@/lib/seat-labels";
import { PlanHistory } from "@/components/plan-history";
import { auditEntries } from "@/lib/audit";
import { LiveRefresh } from "@/components/live-refresh";
import { getLanAccounts } from "@/lib/lan-accounts";
import { LeadBookingList } from "@/components/seat-booking";
import { LeadChecklist } from "@/components/lead-checklist";
import { buildLeadChecklist } from "@/lib/lead-checklist";
import { hasWishes } from "@/lib/checklist";
import { clanType, clanTypes, getType } from "@/lib/lan-types";
import { buildLeadTasks, contactsOf, lanTaskStates, tasksForLan } from "@/lib/lead-tasks";
import { LeadTasks } from "@/components/lead-tasks";
import { LeadTaskEditor } from "@/components/lead-task-editor";
import { ContactDetails } from "@/components/lead-contacts";
import { SeatSwapApprovals, type SwapView } from "@/components/seat-swaps";
import { WhoIsMissing, type MissingGroupView } from "@/components/who-is-missing";
import { MISSING_STEPS, NUDGE_COOLDOWN_MS, whoIsMissing, type MissingStep } from "@/lib/missing";
import { CancelEvent, CopyNextYear, DeleteNewsButton, NewsComposer } from "@/components/event-extras";
import { getT } from "@/i18n/server";
import type { T } from "@/i18n/translate";
import { httpHref } from "@/lib/safe-url";
import { ActionForm } from "@/components/action-form";
import { canSeeEmergency, emergencyForLan, logEmergencyView } from "@/lib/emergency";
import { EmergencyList } from "@/components/emergency-list";
import type { StatusKind } from "@/components/status-icons";
import { SeatVariants, VariantPreviewBar } from "@/components/seat-variants";
import { listVariants } from "@/lib/seat-variants";
import { movesBetween, seatChanges, seatsWithVariant } from "@/lib/seat-variant-math";

const { attendance, seat, user, reminderLog } = schema;

// Same order as the event page (Overview, Seats, Attendees), then the lead-only tabs.
const TABS = [
  ["overview", "event.tabs.overview"],
  ["seats", "event.tabs.seats"],
  ["attendees", "manage.tabs.attendees"],
  ["missing", "manage.tabs.missing"],
  ["emergency", "emergency.manageTab"],
  ["chat", "manage.tabs.chat"],
  ["settings", "manage.tabs.settings"],
] as const;
type Tab = (typeof TABS)[number][0];

export default async function ManageLanPage({ params, searchParams }: PageProps<"/lans/[id]/manage">) {
  const { id } = await params;
  const sp = await searchParams;
  const me = await requireUser({ next: `/lans/${id}/manage` });
  const t = await getT();
  const l = getLan(id);
  if (!l) notFound();
  if (!isLanManager(me, id)) redirect(`/lans/${id}`);
  // Health data: only the event's own leads, not every manager (see canSeeEmergency).
  const showEmergency = canSeeEmergency(me, l);
  const tabs = TABS.filter(([x]) => x !== "emergency" || showEmergency);
  const asked = sp.tab === "people" ? "attendees" : sp.tab;
  const tab: Tab = tabs.some(([x]) => x === asked) ? (asked as Tab) : "overview";
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
    l.typeId ? getType(l.typeId) : null,
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
    (r) => r.status === "going" && !r.paid && !r.ticketBought && wantsMail(r.userId),
  ).length;
  const going = rows.filter((r) => r.status === "going");

  const statusOrder = { going: 0, waitlist: 1, maybe: 2, declined: 3 };
  // Everyone the People and Seats tabs can list: attendees and clan members.
  const badgesOf = memberBadges(users.map((u) => u.id));
  const badges = Object.fromEntries(badgesOf);
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
        badges: badgesOf.get(r.userId),
      };
    })
    .sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || a.name.localeCompare(b.name));

  // Read (and logged) only when the tab is open: it's a server-loaded part, never rendered hidden.
  const emergency = tab === "emergency" ? emergencyForLan(id) : null;
  if (emergency) logEmergencyView(l, me.id, emergency.size);
  const emergencyRows = emergency
    ? going
        .map((r) => {
          const e = emergency.get(r.userId);
          return {
            userId: r.userId,
            name: names.get(r.userId) ?? userById.get(r.userId)?.name ?? "?",
            full: people.get(r.userId)?.full ?? userById.get(r.userId)?.name ?? "?",
            avatar: avatars.get(r.userId),
            seat: seatOf.get(r.userId) ?? null,
            contactName: e?.contactName ?? "",
            contactPhone: e?.contactPhone ?? "",
            diet: e?.diet ?? "",
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];

  const free = freeSpots(l);
  const capacity = capacityOf(l);
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
    rules: normalizeRules(r.wishRules ?? [], r.userId),
    priority: 0,
    order: 0,
  }));
  const checkSeats = (list: typeof seats) => checkWishes(list, planPeople, (uid) => names.get(uid) ?? "?", t, { nearRange: l.seatNearRange });
  const liveChecks = checkSeats(seats);
  // Seat plan variants, each checked against today's wishes (not the ones from when it was saved).
  const coming = new Set(going.map((r) => r.userId));
  const variants = seats.length > 0 ? listVariants(id) : [];
  const seatSearch = runningSeatSearch(id);
  const variantViews = variants.map((v) => {
    const vSeats = seatsWithVariant(seats, v.seats, coming);
    const checks = checkSeats(vSeats);
    return { v, seats: vSeats, checks, differs: movesBetween(seats, vSeats).length };
  });
  const seatedIn = (list: typeof seats) => list.filter((s) => s.userId && coming.has(s.userId)).length;
  // ?variant=<id>: the map and the wish list show that variant instead of the live plan.
  const preview = typeof sp.variant === "string" ? variantViews.find((x) => x.v.id === sp.variant) : undefined;
  const wishChecks = preview?.checks ?? liveChecks;
  // ?vs=<id>: the plan everything is compared with, the live plan unless a variant is picked.
  const baseView = typeof sp.vs === "string" ? variantViews.find((x) => x.v.id === sp.vs) : undefined;
  const base = baseView
    ? { id: baseView.v.id, name: baseView.v.name, seats: baseView.seats, checks: baseView.checks }
    : { id: null, name: t("seatVariants.liveShort"), seats, checks: liveChecks };
  // Seats on the map that differ from the compared plan (none while the map shows that plan itself).
  const shownSeats = preview?.seats ?? seats;
  const changes = (preview?.v.id ?? null) === base.id ? new Map() : seatChanges(shownSeats, base.seats);
  // Preview: whose wishes the variant meets worse or better than the compared plan.
  const scoreOf = (list: typeof liveChecks) => new Map(list.map((c) => [c.userId, c.score ?? 1]));
  const previewDelta = (() => {
    if (!preview) return { worse: [] as string[], better: 0 };
    const was = scoreOf(base.checks);
    const now = scoreOf(preview.checks);
    const worse = [...now].filter(([u, x]) => x < (was.get(u) ?? 1) - 1e-9).map(([u]) => names.get(u) ?? "?").sort((a, b) => a.localeCompare(b));
    const better = [...now].filter(([u, x]) => x > (was.get(u) ?? 1) + 1e-9).length;
    return { worse, better };
  })();
  // Manage → Seats: a lead changing one member's wishes (?editWishes=userId).
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  const wishMembers = going.map((r) => ({ id: r.userId, name: names.get(r.userId) ?? "?" })).sort(byName);
  const wishPeople = rows
    .filter((r) => r.status === "going" || r.status === "maybe" || r.status === "waitlist")
    .map((r) => ({ id: r.userId, name: names.get(r.userId) ?? "?" }))
    .sort(byName);
  const editRow = typeof sp.editWishes === "string" && !l.seatsPublishedAt ? going.find((r) => r.userId === sp.editWishes) : undefined;
  const editRules = editRow ? normalizeRules(editRow.wishRules ?? [], editRow.userId) : [];
  // People the wishes name, plus who added them.
  const editIds = [...new Set([...rulePeople(editRules), ...editRules.flatMap((r) => (r.by ? [r.by] : []))])];
  const editMissing = editIds.filter((uid) => !names.has(uid));
  const editNames = editMissing.length ? await getNames(id, editMissing) : null;
  const wishEditing = editRow
    ? {
        id: editRow.userId,
        name: names.get(editRow.userId) ?? "?",
        rules: editRules,
        note: editRow.wishNote,
        names: Object.fromEntries(editIds.map((uid) => [uid, names.get(uid) ?? editNames?.get(uid)?.label ?? "?"])),
      }
    : null;
  // People list: a shortcut into the wish editor above for everyone who is coming (guests too).
  const wishCount = new Map(going.map((r) => [r.userId, (r.wishRules ?? []).length + (r.wishNote ? 1 : 0)]));
  const wishHrefOf = (uid: string) =>
    seats.length > 0 && !l.seatsPublishedAt && wishCount.has(uid)
      ? { count: wishCount.get(uid)!, href: `/lans/${l.id}/manage?tab=seats&editWishes=${encodeURIComponent(uid)}#edit-wishes` }
      : undefined;
  const orderedSeats = [...seats].sort((a, b) => a.row - b.row || a.col - b.col);
  const wishRows: WishRow[] = going
    .filter((r) => (r.wishRules ?? []).length > 0 || r.wishNote)
    .map((r) => {
      const c = wishChecks.find((w) => w.userId === r.userId);
      return {
        userId: r.userId,
        name: names.get(r.userId) ?? "?",
        full: people.get(r.userId)?.full,
        seat: (preview ? preview.seats.find((x) => x.userId === r.userId)?.label : seatOf.get(r.userId)) ?? null,
        items: c?.items ?? [],
        score: c?.score ?? null,
        note: r.wishNote,
      };
    });
  const now = new Date();
  // Trust based: the member's own "I have my ticket" counts.
  const withTicket = going.filter((r) => r.ticketBought || r.paid).length;
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
  // Status icons on seats and in the attendee list: no ticket, booked on the event site, guest, swap pending.
  const rowByUser = new Map(rows.map((r) => [r.userId, r]));
  const inSwap = new Set(swaps.flatMap((s) => [s.fromUserId, s.toUserId]));
  const tracksBooking = !!(l.externalPlanUrl && l.seatsPublishedAt);
  const marksOf = (uid: string): StatusKind[] => {
    const r = rowByUser.get(uid);
    const m: StatusKind[] = [];
    if (r && l.clanId && !memberIds.has(uid)) m.push("left");
    if (r && !r.paid && !r.ticketBought) m.push("noTicket");
    if (tracksBooking && r?.seatBooked) m.push("booked");
    if (userById.get(uid)?.isGuest) m.push("guest");
    if (inSwap.has(uid)) m.push("swap");
    return m;
  };
  const leadSteps = buildLeadChecklist({
    lan: l,
    going: going.length,
    withTicket,
    seats: seats.length,
    seated,
    booked: bookedCount,
    spotsToFill: spotToFill ? Math.min(free ?? 0, waitlist.length) : 0,
    swapsToApprove,
    t,
  });
  // The leads' own to-dos (clan, LAN type, this event) and the LAN organizers' contacts.
  const lanTypeRow = l.typeId ? getType(l.typeId) : undefined;
  const contacts = lanTypeRow && l.clanId ? contactsOf(l.clanId, lanTypeRow.id) : [];
  const taskDefs = tasksForLan(l);
  // The clan's types, plus this event's own when the clan has taken it off its list.
  const ownTypes = l.clanId ? clanTypes(l.clanId) : [];
  const currentType = l.typeId && !ownTypes.some((x) => x.id === l.typeId) ? clanType(l.clanId, l.typeId) : undefined;
  const typeOptions = currentType ? [...ownTypes, currentType] : ownTypes;
  const leadTasks = buildLeadTasks({
    lan: l,
    tasks: taskDefs,
    states: lanTaskStates(l.id, taskDefs.map((x) => x.id)),
    steps: leadSteps,
    contacts,
    now,
    t,
  });
  const eventTasks = taskDefs.filter((x) => x.lanId === l.id);
  const canEditTypes = !!lanClan && clanCan(me, lanClan.id, "events");
  const leadOptions = orgaIds
    .map((uid) => ({ id: uid, name: names.get(uid) ?? userById.get(uid)?.name ?? "?" }))
    .sort((a, b) => a.name.localeCompare(b.name));
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

  // Two balanced columns (CSS columns), so a short card doesn't leave a hole next to a long one; things to act on first.
  const seatCards = (
          <div className="space-y-5">
          <div className="gap-5 lg:columns-2 [&>*]:mb-5 [&>*]:break-inside-avoid">
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
                        <a href={httpHref(l.externalPlanUrl)} target="_blank" rel="noreferrer" className={inlineLink}>
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
          <Card id="our-seats" title={t("manage.ourSeats")}>
            <p className="mb-4 text-sm text-muted">{t("manage.ourSeatsHint")}</p>
            <SeatSetup
              lanId={l.id}
              current={seatSpec(seats)}
              unseated={going.length - seated}
              free={freeSeats}
              autoPlan={l.seatAutoPlan}
              nearRange={l.seatNearRange}
              searching={seatSearch ? fmtTime(new Date(seatSearch.until)) : null}
              thoroughMinutes={thoroughMinutes()}
              autoPlanBlocked={
                l.seatsPublishedAt ? t("seatSetup.autoPaused.final") : l.seatPicking ? t("seatSetup.autoPaused.picking") : null
              }
            />
          </Card>
          {seats.length > 0 && (
            <Card id="seat-variants" title={t("seatVariants.title")} actions={variants.length > 0 ? <Pill>{variants.length}</Pill> : undefined}>
              <SeatVariants
                lanId={l.id}
                going={going.length}
                live={{ seated: seatedIn(seats), score: overallScore(liveChecks), vsBase: base.id ? movesBetween(base.seats, seats).length : undefined }}
                baseId={base.id}
                rows={variantViews.map((x) => ({
                  id: x.v.id,
                  name: x.v.name,
                  seated: seatedIn(x.seats),
                  score: overallScore(x.checks),
                  differs: x.differs,
                  vsBase: x.v.id === base.id ? undefined : base.id ? movesBetween(base.seats, x.seats).length : x.differs,
                  updated: fmtDate(x.v.updatedAt, t.locale),
                }))}
                previewId={preview?.v.id ?? null}
                final={!!l.seatsPublishedAt}
                searching={seatSearch ? { name: seatSearch.name, until: fmtTime(new Date(seatSearch.until)) } : null}
              />
            </Card>
          )}
          {seats.length > 0 && <PlanHistory rows={auditEntries({ lanId: l.id, group: "seats" }).rows} names={names} t={t} />}
          </div>
          {seats.length > 0 && !l.seatsPublishedAt && (
            <WishLeadEditor
              lanId={l.id}
              members={wishMembers}
              people={wishPeople}
              editing={wishEditing}
              seatLabels={orderedSeats.map((s) => s.label)}
              rows={[...new Set(orderedSeats.map(seatRow))]}
              nearRange={l.seatNearRange}
              closeHref={`/lans/${l.id}/manage?tab=seats${sp.wishes === "all" ? "&wishes=all" : ""}#wishes`}
              t={t}
            />
          )}
          {seats.length > 0 && <WishOverview
              badges={badges}
              rows={wishRows}
              editBase={l.seatsPublishedAt ? undefined : `/lans/${l.id}/manage?tab=seats&editWishes=`}
              overall={overallScore(wishChecks)}
              filter={sp.wishes === "all" ? "all" : "look"}
            />}
          </div>
  );

  const seatsDot = !!swapsToApprove || (going.length - seated > 0 && seats.length > 0);
  const clientTabs: ClientTab[] = [
    { id: "overview", label: t("event.tabs.overview") },
    {
      id: "seats",
      label: t("event.tabs.seats"),
      badge: swapsToApprove
        ? t("manage.badge.swaps", { count: swapsToApprove })
        : seatsDot
          ? t("manage.badge.unseated", { count: going.length - seated })
          : undefined,
      dot: true,
    },
    {
      id: "people",
      label: t("manage.tabs.people"),
      badge: memberMissing ? t("manage.badge.missing", { count: memberMissing }) : undefined,
      dot: true,
      // Who's coming, who's missing and (own leads only) emergency info: one tab, a small switch inside.
      parts: [
        { id: "attendees", label: t("manage.parts.list") },
        { id: "missing", label: t("manage.tabs.missing"), dot: !!memberMissing },
        ...(showEmergency ? [{ id: "emergency", label: t("emergency.manageTab"), server: true }] : []),
      ],
    },
    { id: "chat", label: t("manage.tabs.messages") },
    { id: "settings", label: t("manage.tabs.settings") },
  ];

  return (
    <Page>
      <LiveRefresh lanId={l.id} />
      <EventHeader
        lan={l}
        clan={lanClan}
        mode="manage"
        canManage
        tab={tab}
        actions={
          <div className={`${headerActionFrame} max-sm:!hidden`}>
            <a href={`/lans/${l.id}/manage/export`} className={headerAction} aria-label={t("manage.exportCsv")} title={t("manage.exportCsv")}>
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
              </svg>
              <span className="hidden sm:inline">{t("manage.exportCsv")}</span>
            </a>
          </div>
        }
      />


      <ClientTabs tabs={clientTabs} initial={tab} base={`/lans/${l.id}/manage`} label={t("eventGuide.sectionsLabel")} partsLabel={t("manage.attendeeParts")}>
      <TabPanel id="overview">
      {/* Full width, so all steps fit in one row on desktop. */}
      <LeadChecklist steps={leadSteps} />
        {/* Same shape as the event page: the main things on the left, dates in a sidebar on the right. */}
        <div className="grid grid-cols-1 items-start gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] 2xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="order-last space-y-4 sm:space-y-6 lg:order-none lg:col-start-2 lg:row-start-1">
            <Card id="contacts" title={t("contacts.heading")}>
              {contacts.length ? (
                <ul className="space-y-3">
                  {contacts.map((c) => (
                    <li key={c.id}>
                      <ContactDetails c={c} t={t} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">{lanTypeRow ? t("contacts.none") : t("contacts.noType")}</p>
              )}
              {lanTypeRow && <p className="mt-3 text-xs text-faint">{t("contacts.fromType", { type: lanTypeRow.name })}</p>}
            </Card>
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
              value={`${going.length}${capacity ? ` / ${capacity}` : ""}`}
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
              value={`${withTicket} / ${going.length}`}
              sub={t("leadSteps.notBought", { count: going.length - withTicket })}
              href={`/lans/${l.id}/manage?tab=attendees`}
            />
            <Stat
              label={t("event.tabs.seats")}
              value={`${seated} / ${going.length}`}
              sub={seats.length ? t("manage.stat.freeOf", { free: freeSeats, count: seats.length }) : t("manage.stat.noSeats")}
              href={`/lans/${l.id}/manage?tab=seats`}
            />
          </div>

          <LeadTasks
            lanId={l.id}
            tasks={leadTasks}
            leads={leadOptions}
            names={new Map([...names, ...leadOptions.map((o) => [o.id, o.name] as [string, string])])}
            editLinks={
              canEditTypes && lanClan
                ? [
                    ...(lanTypeRow
                      ? [{ href: `/clans/${lanClan.slug}/types/${lanTypeRow.id}#lead-tasks`, label: t("leadTasks.editType", { type: lanTypeRow.name }) }]
                      : []),
                    { href: `/clans/${lanClan.slug}/settings?tab=types#lead-tasks`, label: t("leadTasks.editClan") },
                  ]
                : []
            }
          >
            {l.clanId && (
              <details className="mt-3 rounded-card border border-line p-3">
                <summary className="cursor-pointer text-sm font-medium text-bit">{t("leadTasks.addForEvent")}</summary>
                <div className="mt-3">
                  <LeadTaskEditor
                    scope={{ lanId: l.id }}
                    tasks={eventTasks.map(({ id, title, note, after, dueDays, contactId }) => ({ id, title, note, after, dueDays, contactId }))}
                    depTasks={taskDefs.map((x) => ({ id: x.id, title: x.title }))}
                    contacts={contacts.map((c) => ({ id: c.id, name: c.name }))}
                  />
                </div>
              </details>
            )}
          </LeadTasks>


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

          </div>
        </div>
      </TabPanel>

      <TabPanel id="attendees">
      {(capacity != null || waitlist.length > 0) && (
        <div id="waitlist" className="mb-4 scroll-mt-20 sm:mb-6">
          <Card
            title={`${t("event.waitlist")} (${waitlist.length})`}
            actions={
              capacity != null && (
                <Pill tone={free ? "emerald" : "amber"}>{t("manage.comingOf", { going: going.length, capacity })}</Pill>
              )
            }
          >
            <WaitlistPanel
              badges={badges}
              lanId={l.id}
              entries={waitlist}
              free={free}
              auto={l.waitlistAuto}
              profileBase={lanClan ? `/clans/${lanClan.slug}/members/` : null}
            />
          </Card>
        </div>
      )}
        {/* Phones: the header keeps only the title, so the export sits with the list it exports. */}
        <a href={`/lans/${l.id}/manage/export`} className="mb-3 inline-flex min-h-9 items-center gap-1.5 text-sm font-medium text-bit hover:underline sm:hidden">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
          </svg>
          {t("manage.exportCsv")}
        </a>
        <AttendanceTable
          lanId={l.id}
          profileBase={lanClan ? `/clans/${lanClan.slug}/members/` : null}
          rows={tableRows.map((r) => ({
            ...r,
            wishes: wishHrefOf(r.userId),
            // Ticket and booking have their own columns here; the icons add what the table doesn't show.
            marks: [
              ...(seats.some((x) => x.userId === r.userId && x.locked) ? (["held"] as const) : []),
              ...marksOf(r.userId).filter((k) => k === "left" || k === "guest" || k === "swap"),
            ],
          }))}
          seats={[...seats].sort((a, b) => a.row - b.row || a.col - b.col)}
          others={users
            .filter((u) => !inLan.has(u.id) && memberIds.has(u.id))
            .map((u) => ({ id: u.id, name: names.get(u.id) ?? u.name }))
            .sort((a, b) => a.name.localeCompare(b.name))}
        />

      </TabPanel>

      <TabPanel id="missing">
        <WhoIsMissing
          badges={badges}
          lanId={l.id}
          groups={missingGroups}
          profileBase={lanClan ? `/clans/${lanClan.slug}/members/` : null}
          blocked={
            l.cancelledAt ? t("manage.nudgeCancelled") : !l.publishedAt ? t("manage.nudgeDraft") : null
          }
          cooldownMs={NUDGE_COOLDOWN_MS}
        />

      </TabPanel>

      {emergency && (
      <TabPanel id="emergency">
        <EmergencyList badges={badges} rows={emergencyRows} t={t} profileBase={lanClan ? `/clans/${lanClan.slug}/members/` : null} />
      </TabPanel>
      )}

      <TabPanel id="seats">
        {/* The seat plan is the main tool: the tapped seat's details above the full-width map, setup and the seat flow below. */}
        <div className="space-y-5">
          {preview && (
            <VariantPreviewBar
              lanId={l.id}
              id={preview.v.id}
              name={preview.v.name}
              differs={preview.differs}
              final={!!l.seatsPublishedAt}
              score={overallScore(preview.checks)}
              liveScore={overallScore(liveChecks)}
              base={{ id: base.id, name: base.name, score: overallScore(base.checks), changed: preview.v.id === base.id ? null : movesBetween(base.seats, preview.seats).length }}
              worse={previewDelta.worse}
              better={previewDelta.better}
            />
          )}
          {seats.length > 0 ? (
              <SeatMap
                key={preview?.v.id ?? "live"}
                lanId={l.id}
                rows={l.seatRows}
                cols={l.seatCols}
                meId={me.id}
                mode={preview ? "view" : "admin"}
                leadView={!!preview}
                details="top"
                compare={changes.size > 0 ? { name: base.name } : undefined}
                seats={shownSeats.map((s) => ({ ...seatView(s, people, avatars), marks: s.userId ? marksOf(s.userId) : undefined, diff: changes.get(s.id) }))}
                assignable={going
                  .map((r) => {
                    const w = wishChecks.find((c) => c.userId === r.userId);
                    return {
                      id: r.userId,
                      name: names.get(r.userId) ?? "?",
                      lanAccount: lanIds.get(r.userId) || undefined,
                      profileUrl: profileLink(profilePat, lanIds.get(r.userId)) ?? undefined,
                      ticket: r.paid || r.ticketBought ? ("ok" as const) : ("open" as const),
                      wishes: w ? { items: w.items, score: w.score } : undefined,
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

      </TabPanel>

      <TabPanel id="chat">
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
        <Card title={t("manage.chatTitle")}>
          <div className="space-y-5 text-sm">
            <div className="space-y-2">
              <h3 className="font-semibold text-fg">Discord</h3>
              {!discordEnabled() ? (
                <p className="text-muted">
                  {t("manage.botNotSetUp")}{" "}
                  {platformCan(me, "settings") ? (
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

      </TabPanel>

      <TabPanel id="settings">
        <div className="space-y-5">
          <Card title={t("manage.details")}>
            <LanForm
              types={typeOptions}
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
                seatCount: seats.length,
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

          {platformCan(me, "clans") && (
            <Card title={t("manage.dangerZone")}>
              <ActionForm
                action={deleteLan.bind(null, l.id)}
                done="deleted"
                confirm={{ title: t("dialog.deleteLanQ", { name: l.name }), body: t("dialog.deleteLanBody"), confirm: t("dialog.delete"), danger: true }}
              >
                <button className={btnDanger}>{t("manage.deleteLan")}</button>
              </ActionForm>
            </Card>
          )}
        </div>
      </TabPanel>
      </ClientTabs>
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
