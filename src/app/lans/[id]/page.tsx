import type { Metadata } from "next";
import { MemberBadges, type Badges } from "@/components/member-badges";
import { memberBadges } from "@/lib/member-badges";
import { discordInfo } from "@/lib/discord-verify";
import { discordUserUrl } from "@/components/discord-badge";
import { ReportButton } from "@/components/report-button";
import { SuspendedClan } from "@/components/suspended-clan";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { StatusIcons, type StatusKind } from "@/components/status-icons";
import { formerMembersOf } from "@/lib/clan-leave";
import { AttendanceButtons } from "@/components/attendance-buttons";
import { NickManager } from "@/components/nick-manager";
import { LanIdForm } from "@/components/lan-id-form";
import { profileLink, profilePattern } from "@/lib/profile-link";
import { getLanAccounts } from "@/lib/lan-accounts";
import { SeatMap } from "@/components/seat-map";
import { Avatar } from "@/components/avatar";
import { getAvatars, type AvatarData } from "@/lib/avatars";
import { Card, Columns, LockedAnswerBadge, Notice, Page, Pill } from "@/components/ui";
import { fmtDate, fmtTime, fmtWeekday, lanRange, relative } from "@/lib/format";
import { attendanceLocked, capacityOf, getDisplayNames, getLan, getNames, pickNick, seatView, signupClosed, waitlistPositions } from "@/lib/lans";
import { canTakePart as mayTakePart, canViewLan, getCurrentUser, isLanManager, isProfileComplete } from "@/lib/session";
import { clanRole, getClan } from "@/lib/clans";
import { EventInvite } from "@/components/event-invite";
import { rolesWith } from "@/lib/clan-roles";
import { EventHeader } from "@/components/event-header";
import { buildChecklist, onTheDay, progress } from "@/lib/checklist";
import { LanChecklist } from "@/components/lan-checklist";
import { EventGuideButton, EventGuidePanel } from "@/components/event-guide";
import { SeatPhases } from "@/components/seat-phases";
import { eventGuide, wishesTowards } from "@/lib/event-guide";
import { SeatWishes } from "@/components/seat-wishes";
import { LiveRefresh } from "@/components/live-refresh";
import { seatRow } from "@/lib/seat-labels";
import { normalizeRules } from "@/lib/seat-rules";
import { ClientTabs, TabPanel, type ClientTab } from "@/components/client-tabs";
import { GlanceList, type GlanceRow } from "@/components/glance-list";
import { TravelBoard, type TravelPostView } from "@/components/travel-board";
import { PackingList } from "@/components/gear-board";
import { PACKING_ITEMS } from "@/lib/gear";
import { pastPackingItems } from "@/lib/packing-history";
import { GameList } from "@/components/game-list";
import { EventRecap } from "@/components/event-recap";
import { GAMES_REMINDER_DAYS, listGames, previousGames } from "@/lib/games";
import { platformCan } from "@/lib/platform-roles";
import { myGamesTodo } from "@/lib/games-todo";
import { SeatSwapPanel, type SwapView } from "@/components/seat-swaps";
import { CheckInButton, DeleteNewsButton } from "@/components/event-extras";
import { InterestList } from "@/components/interest-list";
import { FoodOrders, type FoodOrderCardView } from "@/components/food-orders";
import { SharedCosts, type CostPerson } from "@/components/shared-costs";
import { costPeople, eventCosts } from "@/lib/costs";
import { fmtAmount } from "@/lib/money";
import { EventPaymentsCard } from "@/components/clan-payments";
import { clanPaymentsOn, memberLines } from "@/lib/payments";
import { canSeeEmergency, dietCount } from "@/lib/emergency";
import { foodCurrency, isAcceptingItems, listFoodOrders, orderText } from "@/lib/food";
import { getT } from "@/i18n/server";
import type { T } from "@/i18n/translate";
import { httpHref } from "@/lib/safe-url";
import { getNumberSetting } from "@/lib/settings";

const { attendance, seat, nickname } = schema;

const TABS = ["overview", "seats", "attendees", "trip", "travel", "gear", "games", "food", "costs"] as const;
// "trip" holds travel and packing; old links to it open travel. Games and costs have their own tabs.

/** Link previews (WhatsApp, Discord, ...): name, date and place of published events; drafts stay generic. */
export async function generateMetadata({ params }: PageProps<"/lans/[id]">): Promise<Metadata> {
  const l = getLan((await params).id);
  if (!l?.publishedAt) return {};
  const clan = l.clanId ? getClan(l.clanId) : undefined;
  const t = await getT();
  const description = [
    l.cancelledAt ? t("share.cancelled") : null,
    lanRange(l, t.locale),
    l.location,
    clan && t("share.eventOf", { clan: clan.name }),
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    title: `${l.name} · Seatbit`,
    description,
    openGraph: { title: l.name, description, type: "website", siteName: "Seatbit", url: `/lans/${l.id}` },
    twitter: { card: "summary_large_image", title: l.name, description },
  };
}

export default async function LanPage({ params, searchParams }: PageProps<"/lans/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const asked = TABS.find((t) => t === sp.tab) ?? "overview";
  // "trip" is just the tab's own link; it opens the first section.
  const tab = asked === "trip" ? "travel" : asked;
  const here = `/lans/${id}${tab === "overview" ? "" : `?tab=${tab}`}`;
  const viewer = await getCurrentUser();
  if (viewer && !isProfileComplete(viewer)) redirect(`/welcome?next=${encodeURIComponent(here)}`);
  const t = await getT();
  const l = getLan(id);
  if (!l) notFound();
  if (!viewer || !canViewLan(viewer, id)) {
    // Shared links: people who can't open the event yet see what it is and how to get in, instead of a 404.
    // No redirect for signed-out visitors either, so link previews keep this page's metadata.
    const clan = l.publishedAt && l.clanId ? getClan(l.clanId) : undefined;
    if (viewer && clan?.suspendedAt) return <SuspendedClan name={clan.name} />;
    if (!clan) {
      if (!viewer) redirect(`/login?next=${encodeURIComponent(here)}`);
      notFound();
    }
    return (
      <EventInvite
        lan={l}
        clan={clan}
        signedIn={!!viewer}
        pending={!!viewer && clanRole(viewer.id, clan.id) === "pending"}
        here={here}
      />
    );
  }
  const me = viewer;
  // Platform staff outside the clan may look, but not answer or add anything.
  const watching = !mayTakePart(me, id);
  const lanClan = l.clanId ? getClan(l.clanId) : undefined;
  const myPayments = lanClan && clanPaymentsOn(lanClan) ? memberLines(me.id, { lanId: l.id }) : [];
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
        .where(and(eq(schema.clanMember.clanId, l.clanId ?? ""), inArray(schema.clanMember.role, rolesWith("events"))))
        .all()
        .map((r) => r.u);
  const orgaNames = await getDisplayNames(id, orgas.map((o) => o.id));
  const orgaDiscord = discordInfo(orgas.map((o) => o.id));
  const myNick = pickNick(myNicks, { lanId: id, typeId: l.typeId }, me.name);
  const myLanId = getLanAccounts(l, [me.id]).get(me.id) ?? null;
  // Each attendee's profile on the event's site, when the event or its type has a link pattern.
  const pattern = profilePattern(l, lanType);
  const profiles = new Map(
    pattern
      ? [...getLanAccounts(l, rows.map((r) => r.userId))].flatMap(([uid, v]) => {
          const href = profileLink(pattern, v);
          return href ? [[uid, href] as const] : [];
        })
      : [],
  );
  const myProfile = profiles.get(me.id) ?? null;
  const posts = db.select().from(schema.travelPost).where(eq(schema.travelPost.lanId, id)).all();
  const spots = posts.length
    ? db.select().from(schema.travelSpot).where(inArray(schema.travelSpot.postId, posts.map((p) => p.id))).all()
    : [];
  const avatars = getAvatars([...rows.map((r) => r.userId), ...seats.flatMap((s) => (s.userId ? [s.userId] : []))]);
  const people = await getNames(id, [
    ...new Set([
      ...rows.map((r) => r.userId),
      ...seats.flatMap((s) => (s.userId ? [s.userId] : [])),
      ...posts.map((p) => p.userId),
      ...spots.map((s) => s.userId),
      // Leads who added one of my seat wishes ("Added by …").
      ...(rows.find((r) => r.userId === me.id)?.wishRules ?? []).flatMap((r) => (r.by ? [r.by] : [])),
    ]),
  ]);
  // The clan's name display (default Name "Nick" Surname); the bare nick only inside small seat cells.
  const names = new Map([...people].map(([uid, n]) => [uid, n.label]));
  const badges = memberBadges([...people.keys()]);
  const my = rows.find((r) => r.userId === me.id);
  const seatOf = new Map(
    seats.filter((s) => s.userId && (l.seatsPublishedAt || isLanManager(me, id))).map((s) => [s.userId!, s.label]),
  );
  const closed = signupClosed(l, now);
  const locked = attendanceLocked(my);
  const group = (st: string) =>
    rows
      .filter((r) => r.status === st)
      .sort((a, b) => (names.get(a.userId) ?? "").localeCompare(names.get(b.userId) ?? ""));
  const going = group("going");
  const linePos = waitlistPositions(id);
  const myPlace = my?.status === "waitlist" ? linePos.get(me.id) : undefined;
  const isAdmin = isLanManager(me, id);
  // Leads see the status icons next to names on the Attendees tab (left the clan, no ticket, booked, guest, held seat, swap pending).
  const leadMarks = new Map<string, StatusKind[]>();
  if (isAdmin) {
    const ids = rows.map((r) => r.userId);
    const guests = new Set(
      ids.length ? db.select({ id: schema.user.id }).from(schema.user).where(and(inArray(schema.user.id, ids), eq(schema.user.isGuest, true))).all().map((u) => u.id) : [],
    );
    const inSwap = new Set(
      db
        .select()
        .from(schema.seatSwap)
        .where(and(eq(schema.seatSwap.lanId, id), inArray(schema.seatSwap.status, ["pending", "accepted"])))
        .all()
        .flatMap((x) => [x.fromUserId, x.toUserId]),
    );
    const held = new Set(seats.filter((x) => x.locked && x.userId).map((x) => x.userId!));
    const tracksBooking = !!(l.externalPlanUrl && l.seatsPublishedAt);
    const former = formerMembersOf(id);
    for (const r of rows) {
      const m: StatusKind[] = [];
      if (former.has(r.userId)) m.push("left");
      if ((r.status === "going" || r.status === "waitlist") && !r.paid && !r.ticketBought) m.push("noTicket");
      if (tracksBooking && r.seatBooked) m.push("booked");
      if (guests.has(r.userId)) m.push("guest");
      if (held.has(r.userId)) m.push("held");
      if (inSwap.has(r.userId)) m.push("swap");
      leadMarks.set(r.userId, m);
    }
  }
  const published = !!l.seatsPublishedAt;
  // Optional self-pick step: members choose their own seat until the leads finalize the plan.
  const picking = l.seatPicking && !published;
  const mySeatLabel = published || picking ? (seats.find((s) => s.userId === me.id)?.label ?? null) : null;
  const games = listGames(id, me.id);
  const gamesTodo = myGamesTodo(games);
  const gamesToInstall = gamesTodo.toInstall;
  const steps = buildChecklist({
    lan: l,
    attendance: my,
    hasNick: myNicks.some(
      (n) => (n.lanId === null && n.typeId === null) || n.lanId === id || (!!l.typeId && n.typeId === l.typeId),
    ),
    seatLabel: mySeatLabel,
    hasSeatPlan: seats.length > 0,
    freeSeats: seats.filter((s) => !s.userId && !s.locked).length,
    waitlistPlace: myPlace,
    games: gamesTodo,
    now,
    t,
  });
  const seatsSorted = [...seats].sort((a, b) => a.row - b.row || a.col - b.col);
  const guide = eventGuide({
    lan: l,
    attendance: my,
    seatLabel: mySeatLabel,
    seatCount: seats.length,
    seatRange: seatsSorted.length ? `${seatsSorted[0].label}${seatsSorted.length > 1 ? `–${seatsSorted[seatsSorted.length - 1].label}` : ""}` : null,
    now,
    t,
  });
  const capacity = capacityOf(l);
  const full = capacity != null && going.length >= capacity;
  // Interest check: the page is just the answer and who answered; the rest opens with sign-up.
  const interestPhase = l.interestCheck && !l.cancelledAt;
  const news = db
    .select()
    .from(schema.lanNews)
    .where(eq(schema.lanNews.lanId, id))
    .orderBy(desc(schema.lanNews.createdAt))
    .all();
  const newsNames = await getDisplayNames(id, [...new Set(news.flatMap((n) => (n.authorId ? [n.authorId] : [])))]);
  const atTheVenue = onTheDay(l, now);
  const arrived = going.filter((r) => r.arrivedAt);
  const onTheWay = going.filter((r) => !r.arrivedAt);

  // Travel: people who said they're not coming no longer count.
  const out = new Set(rows.filter((r) => r.status === "declined").map((r) => r.userId));
  const isIn = (uid: string) => rows.some((r) => r.userId === uid) && !out.has(uid);
  const canTakePart = !watching && !!my && my.status !== "declined";
  const travelViews: TravelPostView[] = posts
    .sort((a, b) => +a.createdAt - +b.createdAt)
    .map((p) => ({
      id: p.id,
      userId: p.userId,
      name: names.get(p.userId) ?? "?",
      kind: p.kind,
      mode: p.mode,
      town: p.town,
      places: p.places,
      whenText: p.whenText,
      note: p.note,
      notComing: !isIn(p.userId),
      spots: spots.filter((s) => s.postId === p.id).map((s) => ({ userId: s.userId, name: names.get(s.userId) ?? "?" })),
    }));
  const packed =
    db
          .select()
          .from(schema.gearPacked)
          .where(and(eq(schema.gearPacked.lanId, id), eq(schema.gearPacked.userId, me.id)))
          .all()
          .map((p) => p.item);
  const ownItems =
    db
          .select()
          .from(schema.packingItem)
          .where(and(eq(schema.packingItem.lanId, id), eq(schema.packingItem.userId, me.id)))
          .all()
          .sort((a, b) => +a.createdAt - +b.createdAt)
          .map((it) => ({ id: it.id, label: it.label, packed: it.packed }));

  const gamePeople = [...new Set(games.flatMap((g) => [...g.voters, ...g.installers, ...g.teams.flatMap((x) => x.members), ...(g.addedBy ? [g.addedBy] : [])]))];
  const gameNames = Object.fromEntries(await getDisplayNames(id, gamePeople));
  const gameAvatars = Object.fromEntries(getAvatars(gamePeople));

  // Food orders at the LAN: everyone coming can start one or add to one.
  const foodOrders = listFoodOrders(id);
  const openFood = foodOrders.filter((o) => isAcceptingItems(o, now)).length;
  const canOrderFood = isAdmin || canTakePart;
  const foodNames =
    Object.fromEntries(
          await getDisplayNames(id, [
            ...new Set(foodOrders.flatMap((o) => [...o.people.map((p) => p.userId), ...(o.createdBy ? [o.createdBy] : [])])),
          ]),
        );
  const currency = foodCurrency();
  // Leads only: how many coming noted dietary needs; the details stay on the lead page.
  const foodDiets = canSeeEmergency(me, l) ? dietCount(id) : 0;
  const foodViews: FoodOrderCardView[] =
    foodOrders.map((o) => ({
          ...o,
          text: orderText(o, foodNames, currency, t),
          canRun: o.createdBy === me.id || isAdmin,
          accepting: isAcceptingItems(o, now),
          closesTime: o.closesAt ? fmtTime(o.closesAt) : null,
          closesLabel: o.closesAt ? fmtDate(o.closesAt, t.locale) : null,
        }));

  // Shared costs: who paid what for the group and who owes whom. Same currency as food orders.
  const costs = eventCosts(id);
  const myCostBalance = costs.balances.get(me.id) ?? 0;
  const costIds = [...costPeople(id)];
  const costNames =
    Object.fromEntries(
          await getDisplayNames(id, [
            ...new Set([
              ...costIds,
              me.id,
              ...costs.expenses.flatMap((e) => [e.paidBy, ...(e.createdBy ? [e.createdBy] : []), ...e.shares.map((x) => x.userId)]),
              ...costs.settlements.flatMap((x) => [x.fromUserId, x.toUserId, ...(x.createdBy ? [x.createdBy] : [])]),
            ]),
          ]),
        );
  const goingIds = new Set(going.map((r) => r.userId));
  const costAvatars = getAvatars([...costIds, me.id]);
  const costPeopleList: CostPerson[] =
    [...new Set([...costIds, ...(isAdmin ? [me.id] : [])])]
          .map((uid) => ({ id: uid, name: costNames[uid] ?? "?", going: goingIds.has(uid), avatar: costAvatars.get(uid) }))
          .sort((a, b) => Number(b.id === me.id) - Number(a.id === me.id) || Number(b.going) - Number(a.going) || a.name.localeCompare(b.name));
  const costDates: Record<string, string> =
    Object.fromEntries([...costs.expenses, ...costs.settlements].map((x) => [x.id, fmtDate(new Date(x.createdAt), t.locale)]));

  // Seat swaps: open requests I'm part of, and who I could swap with.
  const swapRows =
    published && mySeatLabel
      ? db
          .select()
          .from(schema.seatSwap)
          .where(and(eq(schema.seatSwap.lanId, id), inArray(schema.seatSwap.status, ["pending", "accepted"])))
          .all()
          .filter((s) => s.fromUserId === me.id || s.toUserId === me.id)
      : [];
  const seatLabelOf = new Map(seats.filter((s) => s.userId).map((s) => [s.userId!, s.label]));
  const swaps: SwapView[] = swapRows.map((s) => ({
    id: s.id,
    fromUserId: s.fromUserId,
    toUserId: s.toUserId,
    fromName: names.get(s.fromUserId) ?? "?",
    toName: names.get(s.toUserId) ?? "?",
    fromSeat: seatLabelOf.get(s.fromUserId) ?? null,
    toSeat: seatLabelOf.get(s.toUserId) ?? null,
    status: s.status as SwapView["status"],
    note: s.note,
  }));
  const swapCard = published && mySeatLabel && my?.status === "going" && (
    <Card title={t("event.swapSeats")}>
      <SeatSwapPanel
        lanId={l.id}
        meId={me.id}
        mySeat={mySeatLabel}
        swaps={swaps}
        people={seats
          .filter((s) => s.userId && s.userId !== me.id)
          .map((s) => ({ id: s.userId!, name: names.get(s.userId!) ?? "?", seat: s.label }))
          .sort((a, b) => a.seat.localeCompare(b.seat, undefined, { numeric: true }))}
      />
    </Card>
  );

  const profileBase = lanClan ? `/clans/${lanClan.slug}/members/` : null;
  const seatPills = (
    <span className="flex flex-wrap items-center gap-2">
      {l.externalPlanUrl && (
        <a href={httpHref(l.externalPlanUrl)} target="_blank" rel="noreferrer" className="text-sm text-bit hover:underline">
          {t("event.eventSeatPlan")} <span aria-hidden>↗</span>
        </a>
      )}
      {/* Where the plan stands is the phase bar's job, and the checklist says what to do. */}
    </span>
  );
  const seatPhases = seats.length > 0 && (
    <SeatPhases t={t} picking={l.seatPicking} final={published} booking={!!l.externalPlanUrl} booked={!!my?.seatBooked} mySeat={mySeatLabel} />
  );
  // Others' friendly wishes about me ("right next to", "near"), shown as info with a quick "add".
  const fans = wishesTowards(me.id, rows).map((f) => ({ ...f, name: names.get(f.userId) ?? "?" }));
  const wishesForm = my?.status === "going" && !published && seats.length > 0 && (
      <SeatWishes
        fans={fans}
        lanId={l.id}
        people={rows
          .filter((r) => r.userId !== me.id && (r.status === "going" || r.status === "maybe" || r.status === "waitlist"))
          .map((r) => ({ id: r.userId, name: names.get(r.userId) ?? "?" }))
          .sort((a, b) => a.name.localeCompare(b.name))}
        names={Object.fromEntries(
          (my.wishRules ?? []).flatMap((r) => [...("userId" in r ? [r.userId] : []), ...(r.by ? [r.by] : [])]).map((uid) => [uid, names.get(uid) ?? "?"]),
        )}
        seatLabels={[...seats].sort((a, b) => a.row - b.row || a.col - b.col).map((s) => s.label)}
        rows={[...new Set([...seats].sort((a, b) => a.row - b.row || a.col - b.col).map(seatRow))]}
        initial={{ rules: normalizeRules(my.wishRules ?? [], me.id), note: my.wishNote }}
        nearRange={l.seatNearRange}
      />
  );
  // With self pick the wishes are a side road, so they fold into one row; otherwise they're the main thing.
  const myWishCount = (my?.wishRules ?? []).length;
  const wishesCard =
    wishesForm &&
    (l.seatPicking ? (
      <details className="group rounded-card border border-line bg-surface p-4 sm:p-5">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
          <span className="min-w-0">
            <span className="block font-semibold text-fg">{t("event.seatWishes")}</span>
            <span className="block text-sm text-muted">
              {myWishCount ? t("event.wishesCount", { count: myWishCount }) : t("event.wishesOptional")}
              {fans.length > 0 && <> · <span className="text-bit">{t("event.fansCount", { count: fans.length })}</span></>}
            </span>
          </span>
          <svg viewBox="0 0 16 16" width={14} height={14} aria-hidden className="shrink-0 text-muted transition group-open:rotate-180">
            <path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="M4 6l4 4 4-4" />
          </svg>
        </summary>
        <div className="mt-4">
          <p className="mb-3 text-sm text-muted">{t("event.seatWishesIntro")}</p>
          {wishesForm}
        </div>
      </details>
    ) : (
      <Card title={t("event.seatWishes")}>
        <p className="mb-3 text-sm text-muted">{t("event.seatWishesIntro")}</p>
        {wishesForm}
      </Card>
    ));

  // Guide: where each open step gets done. What else waits (rides, costs, games) shows on the section rows.
  const stepLinks = {
    nick: `/lans/${l.id}?edit=nick#nick`,
    wishes: `/lans/${l.id}?tab=seats`,
    pick: `/lans/${l.id}?tab=seats`,
    games: `/lans/${l.id}?tab=games`,
    ...(l.ticketUrl ? { ticket: httpHref(l.ticketUrl) } : {}),
  };
  // Food orders belong to the event itself: members get the On site tab only while it runs. Leads always,
  // so they can set an order up in advance.
  const foodLive = atTheVenue;
  const showFood = foodLive || isAdmin;
  const ridesWanted = posts.filter((p) => p.mode === "request" && p.userId !== me.id && isIn(p.userId)).length;
  const packSoon = my?.status === "going" && now < l.startsAt && !l.dateTbd && l.startsAt.getTime() - now.getTime() < 7 * 86400_000;

  // The hub's rows: each says in one line why you'd open it; a dot where something waits for you.
  // Counted like the travel board: free seats in cars and people looking for one.
  const rideOffers = posts.filter((p) => p.kind === "ride" && p.mode === "offer" && isIn(p.userId));
  const rideLooking = posts.filter((p) => p.kind === "ride" && p.mode === "request" && isIn(p.userId)).reduce((n, p) => n + p.places, 0);
  const freeRideSeats = rideOffers.reduce((n, p) => n + Math.max(0, p.places - spots.filter((x) => x.postId === p.id).length), 0);
  const packTotal = PACKING_ITEMS.length + db.select().from(schema.packingItem).where(and(eq(schema.packingItem.lanId, id), eq(schema.packingItem.userId, me.id))).all().length;
  const packDone =
    db.select().from(schema.gearPacked).where(and(eq(schema.gearPacked.lanId, id), eq(schema.gearPacked.userId, me.id))).all().length +
    db.select().from(schema.packingItem).where(and(eq(schema.packingItem.lanId, id), eq(schema.packingItem.userId, me.id), eq(schema.packingItem.packed, true))).all().length;
  const waiting = group("waitlist").length;
  const href = (tb: string) => (tb === "overview" ? `/lans/${l.id}` : `/lans/${l.id}?tab=${tb}`);
  const onSite: GlanceRow = {
    id: "food",
    label: t("eventGuide.onSite"),
    href: href("food"),
    status: openFood ? t("eventGuide.rows.foodOpen", { count: openFood }) : t("eventGuide.rows.foodNone"),
    dot: foodLive && openFood > 0,
  };
  // Trip (travel and packing) opens for members some days before the event, or as soon as
  // something is in it, so the page starts simple. Organizers always see it, marked as hidden.
  // Games and costs have their own tabs and show all the time.
  const tripDays = getNumberSetting("event.tripOpensDays") ?? 30;
  const tripOpensAt = l.dateTbd ? null : new Date(l.startsAt.getTime() - tripDays * 86400_000);
  const tripHasContent = posts.length > 0 || packed.length > 0 || ownItems.length > 0;
  const tripOpen = tripDays <= 0 || tripHasContent || (!!tripOpensAt && now >= tripOpensAt);
  const showTrip = tripOpen || isAdmin;
  const tripOpensText = tripOpensAt ? t("eventGuide.tripOpens", { date: fmtWeekday(tripOpensAt, t.locale) }) : t("eventGuide.tripLater");
  const tripHidden = tripOpen ? undefined : tripOpensText;
  const leadsOnlyFood = !foodLive ? t("eventGuide.onSiteHidden") : undefined;
  if (leadsOnlyFood) onSite.hidden = leadsOnlyFood;
  const sections: GlanceRow[] = [
    { id: "overview", label: t("event.tabs.overview"), href: href("overview"), status: t("eventGuide.rows.overview") },
    // During the event, On site comes first; leads see it at the end before that.
    ...(foodLive ? [onSite] : []),
    {
      id: "seats",
      label: t("event.tabs.seats"),
      href: href("seats"),
      dot: picking && seats.length > 0 && !mySeatLabel && my?.status === "going",
      status:
        seats.length === 0
          ? t("eventGuide.rows.seatsNone")
          : picking && !mySeatLabel && my?.status === "going"
            ? t("eventGuide.rows.seatsPick")
            : mySeatLabel
              ? t(published ? "eventGuide.rows.seatFinal" : "eventGuide.rows.seatPicked", { seat: mySeatLabel })
              : t(published ? "eventGuide.rows.planFinal" : "eventGuide.rows.planOpen"),
    },
    {
      id: "attendees",
      label: t("event.tabs.attendees"),
      href: href("attendees"),
      status: waiting
        ? t("eventGuide.rows.comingWaiting", { count: going.length, waiting })
        : t("eventGuide.rows.coming", { count: going.length }),
    },
    {
      id: "travel",
      label: t("event.tabs.travel"),
      href: href("travel"),
      dot: my?.status === "going" && ridesWanted > 0 && now < l.startsAt,
      status:
        rideOffers.length || rideLooking
          ? t("eventGuide.rows.travel", { free: freeRideSeats, looking: rideLooking })
          : t("eventGuide.rows.travelNone"),
    },
    {
      id: "gear",
      label: t("event.tabs.gear"),
      href: href("gear"),
      dot: !!packSoon && packDone < packTotal,
      status: t("eventGuide.rows.packed", { done: packDone, total: packTotal }),
    },
    {
      id: "games",
      label: t("event.tabs.games"),
      href: href("games"),
      dot: my?.status === "going" && gamesToInstall > 0,
      status:
        my?.status === "going" && gamesToInstall
          ? t("eventGuide.extras.games", { count: gamesToInstall })
          : games.length
            ? t("eventGuide.rows.games", { count: games.length })
            : t("eventGuide.rows.gamesNone"),
    },
    {
      id: "costs",
      label: t("event.tabs.costs"),
      href: href("costs"),
      dot: myCostBalance < 0,
      status:
        myCostBalance < 0
          ? t("eventGuide.extras.owe", { amount: fmtAmount(-myCostBalance, currency) })
          : myCostBalance > 0
            ? t("eventGuide.extras.back", { amount: fmtAmount(myCostBalance, currency) })
            : costs.totalCents > 0
              ? t("eventGuide.rows.costsEven")
              : t("eventGuide.rows.costsNone"),
    },
    ...(showFood && !foodLive ? [onSite] : []),
  ].flatMap((r) => (["travel", "gear"].includes(r.id) ? (showTrip ? [{ ...r, hidden: tripHidden }] : []) : [r]));
  if (!showTrip) sections.push({ id: "trip", label: t("eventGuide.trip"), status: tripOpensText });

  // The tab bar: short, so it fits a phone. Travel and packing share the Trip tab behind a switch.
  const row = (rid: string) => sections.find((x) => x.id === rid);
  const tripParts = ["travel", "gear"].map((pid) => ({
    id: pid,
    label: t(`eventGuide.sections.${pid as "travel"}`),
    dot: !!row(pid)?.dot,
  }));
  const onSiteTab: ClientTab = {
    id: "food",
    label: t("eventGuide.onSite"),
    badge: onSite.dot ? String(onSite.status) : undefined,
    dot: true,
    hidden: leadsOnlyFood,
  };
  const tabs: ClientTab[] = [
    { id: "overview", label: t("event.tabs.overview") },
    ...(foodLive ? [onSiteTab] : []),
    { id: "seats", label: t("event.tabs.seats"), badge: row("seats")?.dot ? String(row("seats")?.status) : undefined, dot: true },
    { id: "attendees", label: t("event.tabs.attendees"), count: going.length },
    { id: "games", label: t("event.tabs.games"), badge: row("games")?.dot ? String(row("games")?.status) : undefined, dot: true },
    { id: "costs", label: t("event.tabs.costs"), badge: row("costs")?.dot ? String(row("costs")?.status) : undefined, dot: true },
    ...(showTrip
      ? [
          {
            id: "trip",
            label: t("eventGuide.trip"),
            parts: tripParts,
            badge: tripParts.filter((x) => x.dot).map((x) => row(x.id)?.status).join(", ") || undefined,
            dot: true,
            hidden: tripHidden,
          },
        ]
      : []),
    ...(showFood && !foodLive ? [onSiteTab] : []),
  ];

  const showChecklist = !!my && my.status !== "declined" && !l.cancelledAt && !l.interestCheck;
  // A locked answer can't be changed here, so it shrinks to a badge in the checklist and frees the space.
  // The full card stays for the waitlist place and the check-in on the day.
  const compactAnswer = showChecklist && locked && (my.status === "going" || my.status === "maybe") && !atTheVenue;
  // A finished checklist folds to one line; the answer card next to it then keeps its own height.
  const checklistDone = (() => {
    const p = progress(steps);
    return p.done === p.total;
  })();

  // Your answer and your checklist sit above the tabs, so they show on every tab.
  const yours = (
      <div className={`grid gap-4 ${checklistDone ? "items-start" : "items-stretch"} ${showChecklist && !compactAnswer ? "lg:grid-cols-[20rem_minmax(0,1fr)] 2xl:grid-cols-[22rem_minmax(0,1fr)]" : ""}`}>
        {compactAnswer ? null : interestPhase ? (
        // Same three answers as sign-up later; they carry over when the Leads open it.
        <section aria-label={t("event.wouldYouCome")} className="rounded-card border border-line bg-surface p-3 sm:p-4">
          <h2 className="mb-1 text-sm font-semibold text-fg">{t("event.wouldYouCome")}</h2>
          <p className="mb-3 text-sm text-muted">{t("event.notBinding")}</p>
          {watching ? (
            <p className="text-sm text-muted">{t("event.staffView")}</p>
          ) : (
            <AttendanceButtons lanId={l.id} current={my?.status ?? null} disabled={false} />
          )}
        </section>
        ) : (
        <section aria-label={t("event.yourAttendance")} className="rounded-card border border-line bg-surface p-3 sm:p-4">
          {/* No status badge: the picked button (or the answer below) already says it. */}
          <h2 className="mb-3 text-sm font-semibold text-fg">{t("event.yourAnswer")}</h2>
          {locked || closed || watching ? (
            // Locked (ticket bought) or sign-up closed: just show the answer, no buttons.
            <div>
              <p className="text-lg font-semibold text-fg">{t(`event.answer.${my?.status ?? "none"}`)}</p>
              <p className="mt-1 text-sm text-muted">
                {l.cancelledAt ? t("event.cancelled") : watching ? t("event.staffView") : locked ? t("event.locked") : t("event.signupClosed")}
              </p>
            </div>
          ) : (
            <AttendanceButtons lanId={l.id} current={my?.status ?? null} disabled={false} />
          )}
          {my?.status === "waitlist" && (
            <p className="mt-3 text-sm text-seat-taken">
              {t.rich("event.waitlistPlace", { place: <strong>#{myPlace ?? "?"}</strong> })}{" "}
              <EventGuideButton>{t("event.waitlistHow")}</EventGuideButton>
            </p>
          )}
          {atTheVenue && my?.status === "going" && (
            <div className="mt-3 space-y-2 border-t border-line pt-3">
              <CheckInButton lanId={l.id} arrived={!!my.arrivedAt} />
              <p className="text-xs text-muted">
                {t("event.hereCount", { arrived: arrived.length, going: going.length })}
                {onTheWay.length > 0 && onTheWay.length <= 12 && (
                  <> · {t("event.onTheWay", { names: onTheWay.map((r) => names.get(r.userId) ?? "?").join(", ") })}</>
                )}
              </p>
            </div>
          )}
        </section>
        )}
        {showChecklist && (
          <LanChecklist
            variant="strip"
            answer={compactAnswer && <LockedAnswerBadge status={my.status} />}
            lanId={l.id}
            steps={steps}
            ticketBought={my.ticketBought}
            canReportTicket={my.status === "going" || my.status === "waitlist"}
            links={watching ? {} : stepLinks}
            footer={<EventGuideButton />}
          />
        )}
      </div>
  );

  const leadsBlock = (
    <>
<h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">{orgaIds.length ? t("event.leads") : t("event.contact")}</h3>
                  <ul className="space-y-2">
                    {orgas.map((o) => (
                      <li key={o.id} className="flex items-center justify-between gap-2 text-sm">
                        {lanClan ? (
                          <Link href={`/clans/${lanClan.slug}/members/${o.id}`} className="min-w-0 truncate font-medium text-fg hover:text-bit hover:underline">
                            {orgaNames.get(o.id) ?? o.name}
                          </Link>
                        ) : (
                          <span className="min-w-0 truncate font-medium text-fg">{orgaNames.get(o.id) ?? o.name}</span>
                        )}
                        <span className="flex shrink-0 gap-3">
                          {orgaDiscord.get(o.id) && (
                            <a href={discordUserUrl(orgaDiscord.get(o.id)!.id)} target="_blank" rel="noreferrer" className="text-bit hover:underline">
                              {t("discordVerify.discordLink")}
                            </a>
                          )}
                          <a href={`mailto:${o.email}?subject=${encodeURIComponent(l.name)}`} className="text-bit hover:underline">
                            {t("event.email")}
                          </a>
                        </span>
                      </li>
                    ))}
                  </ul>
                    </>
  );
  const guidePanel = (
    <EventGuidePanel steps={guide} leads={orgas.length > 0 && <div className="mt-3 border-t border-line pt-3">{leadsBlock}</div>} />
  );

  const detailsAside = (
            <>
            {lanClan && <EventPaymentsCard t={t} clan={lanClan} lines={myPayments} />}
            <Card title={t("event.details")}>
              <dl className="space-y-3 text-sm">
                <DateRow label={t("event.answerBy")} d={l.signupDeadline} now={now} t={t} />
                <DateRow label={t("event.buyTicketBy")} d={l.paymentDueDate} now={now} t={t} />
                {l.price && (
                  <div className="flex justify-between">
                    <dt className="text-muted">{t("event.ticketPrice")}</dt>
                    <dd>{l.price}</dd>
                  </div>
                )}
                {/* Your own ticket is in the checklist. */}
              </dl>
              {orgas.length > 0 && <div className="mt-4 border-t border-line pt-4">{leadsBlock}</div>}
            </Card>
            </>
  );
  const newsCard = news.length > 0 && (
            <Card title={t("event.news")}>
              <ul className="space-y-4">
                {news.slice(0, 5).map((n) => (
                  <li key={n.id} className="text-sm">
                    <p className="whitespace-pre-wrap text-fg/90">{n.text}</p>
                    <p className="mt-1 flex items-center gap-3 text-xs text-faint">
                      {(n.authorId && newsNames.get(n.authorId)) || t("event.lead")} · {fmtDate(n.createdAt, t.locale)}
                      {isAdmin && <DeleteNewsButton id={n.id} />}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          );

  if (interestPhase) {
    return (
      <Page>
        <LiveRefresh lanId={l.id} />
        <EventHeader lan={l} clan={lanClan} mode="view" canManage={isAdmin} tab="overview" />
        {guidePanel}
        {yours}
        <Columns aside={detailsAside}>
          <Notice>
            {l.signupOpensAt && !l.dateTbd
              ? t("interestList.laterOn", { date: fmtDate(l.signupOpensAt, t.locale) })
              : t("interestList.later")}
          </Notice>
          {l.description && (
            <Card>
              <p className="whitespace-pre-wrap text-fg/90">{l.description}</p>
            </Card>
          )}
          <InterestList
            lanId={l.id}
            clanId={l.clanId}
            clanSlug={lanClan?.slug ?? null}
            meId={me.id}
            canRemind={isAdmin && !!l.publishedAt}
            t={t}
          />
          {newsCard}
        </Columns>
        {!isAdmin && <ReportButton lanId={l.id} />}
      </Page>
    );
  }

  return (
    <Page>
      <LiveRefresh lanId={l.id} />
      <EventHeader lan={l} clan={lanClan} mode="view" canManage={isAdmin} tab={tab} help={<EventGuideButton variant="icon" />} />
      {guidePanel}

      {yours}

      <ClientTabs tabs={tabs} initial={!showTrip && ["travel", "gear"].includes(tab) ? "overview" : tab} base={`/lans/${l.id}`} label={t("eventGuide.sectionsLabel")} partsLabel={t("eventGuide.tripLabel")}>
      {showTrip && (
      <TabPanel id="travel">
        <div>
          <p className="mb-4 max-w-2xl text-sm text-muted">{t("event.travelIntro")}</p>
          {/* Rides and places to sleep side by side (stacked on phones) instead of a third level of switches. */}
          {!canTakePart && <p className="mb-4 rounded-md bg-raised/60 px-3 py-2 text-sm text-muted">{t("travel.sayComing")}</p>}
          <div className="grid items-start gap-5 lg:grid-cols-2">
            <Card title={t("travel.carpool")}>
              <TravelBoard kind="ride" lanId={l.id} posts={travelViews} meId={me.id} canPost={canTakePart} isManager={isAdmin} />
            </Card>
            <Card title={t("travel.sleeping")}>
              <TravelBoard kind="sleep" lanId={l.id} posts={travelViews} meId={me.id} canPost={canTakePart} isManager={isAdmin} />
            </Card>
          </div>
        </div>
      </TabPanel>
      )}

      {showTrip && (
      <TabPanel id="gear">
        <PackingList lanId={l.id} items={PACKING_ITEMS} packed={packed} own={ownItems} past={l.endsAt > now ? pastPackingItems(me.id, l.id) : []} />
      </TabPanel>
      )}

      {showTrip && (
      <TabPanel id="games">
        <GameList
          lanId={l.id}
          games={games}
          meId={me.id}
          canManage={isAdmin}
          canAdd={canTakePart || isAdmin}
          names={gameNames}
          avatars={gameAvatars}
          reminderDays={GAMES_REMINDER_DAYS}
          lastTime={l.endsAt > now ? previousGames(l) : null}
          catalogStaff={platformCan(me, "games")}
        />
      </TabPanel>
      )}

      <TabPanel id="food">
      {!showFood && <Notice>{t("eventGuide.onSiteLater")}</Notice>}
      {showFood && !foodLive && <Notice>{t("eventGuide.onSiteLeads")}</Notice>}
      {showFood && foodDiets > 0 && (
        <Notice>
          {t("emergency.foodHint", { count: foodDiets })}{" "}
          <Link href={`/lans/${l.id}/manage?tab=emergency`} className="font-medium underline">
            {t("emergency.foodHintLink")}
          </Link>
        </Notice>
      )}
      {showFood && (
        <FoodOrders
          lanId={l.id}
          orders={foodViews}
          names={foodNames}
          meId={me.id}
          canOrder={canOrderFood && !l.cancelledAt}
          currency={currency}
          announceHint={!l.publishedAt ? t("event.draftNoDm") : null}
        />
      )}
      </TabPanel>

      {showTrip && (
      <TabPanel id="costs">
        <SharedCosts
          lanId={l.id}
          meId={me.id}
          currency={currency}
          expenses={costs.expenses}
          settlements={costs.settlements}
          balances={Object.fromEntries(costs.balances)}
          transfers={costs.transfers}
          totalCents={costs.totalCents}
          people={costPeopleList}
          names={costNames}
          canAdd={isAdmin || canTakePart}
          isLead={isAdmin}
          dates={costDates}
        />
      </TabPanel>
      )}

      <TabPanel id="seats">
        <>
          {seats.length > 0 && my?.status === "going" && (picking || mySeatLabel) && !my.paid && !my.ticketBought && (
            <p className="rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">
              {mySeatLabel
                ? t("event.haveSeatTicket", { seat: mySeatLabel })
                : t("event.tickTicketThenPick")}
            </p>
          )}
          {seats.length > 0 && (published || isAdmin || picking) ? (
            <SeatMap
              intro={seatPhases}
              lanId={l.id}
              rows={l.seatRows}
              cols={l.seatCols}
              meId={me.id}
              mode={picking && my?.status === "going" && (my.ticketBought || my.paid) ? "pick" : "view"}
              seats={seats.map((s) => seatView(s, people, avatars))}
              title={t("event.ourSeats")}
              actions={seatPills}
              details="top"
            >
              {wishesCard}
              {swapCard}
            </SeatMap>
          ) : (
            <div className="min-w-0 space-y-4 sm:space-y-6">
              <Card title={t("event.ourSeats")} actions={seatPills}>
                {seatPhases}
                <p className="text-sm text-muted">
                  {seats.length === 0
                    ? t("event.noSeatsYet")
                    : t("event.groupSeats", {
                        count: seats.length,
                        range: `${seats[0]?.label}${seats.length > 1 ? `–${seats[seats.length - 1]?.label}` : ""}`,
                      })}
                </p>
              </Card>
              {wishesCard}
            </div>
          )}
        </>
      </TabPanel>

      <TabPanel id="attendees">
        <Card
          title={capacity ? t("event.attendeesTitleOf", { count: going.length, capacity }) : t("event.attendeesTitle", { count: going.length })}
          actions={full && <Pill tone="red">{t("event.fullWaitlist")}</Pill>}
        >
          <AttendeeList t={t} title={t("event.coming")} list={going} profileBase={profileBase} names={names} badges={badges} linkDiscord={isAdmin} avatars={avatars} profiles={profiles} seatOf={seatOf} marks={leadMarks} meId={me.id} />
          <AttendeeList t={t} title={t("event.waitlist")} positions={linePos} list={group("waitlist")} profileBase={profileBase} names={names} badges={badges} linkDiscord={isAdmin} avatars={avatars} profiles={profiles} seatOf={seatOf} marks={leadMarks} meId={me.id} />
          <AttendeeList t={t} title={t("event.unsure")} list={group("maybe")} profileBase={profileBase} names={names} badges={badges} linkDiscord={isAdmin} avatars={avatars} profiles={profiles} seatOf={seatOf} marks={leadMarks} meId={me.id} />
          {group("declined").length > 0 && <p className="mt-3 text-xs text-muted">{t("event.cantMakeIt", { count: group("declined").length })}</p>}
        </Card>
      </TabPanel>

      <TabPanel id="overview">
        {/* Your answer and checklist are above the tabs. Desktop: event on the left, details in a sidebar on the right.
            Phones: the event first, details last. */}
        <Columns
          aside={detailsAside}
        >
          {l.publishedAt && !l.cancelledAt && l.endsAt < now && <EventRecap lan={l} me={me} clanSlug={lanClan?.slug ?? null} t={t} />}
          <GlanceList
            title={t("eventGuide.glance")}
            rows={sections.filter((x) => x.id !== "overview")}
            // The event's own pages, out of the header so it stays short.
            actions={
              (l.websiteUrl || l.ticketUrl) && (
                <span className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-sm font-medium">
                  {l.websiteUrl && (
                    <a href={httpHref(l.websiteUrl)} target="_blank" rel="noreferrer" className="text-bit hover:underline">
                      {t("eventUi.websiteShort")} <span aria-hidden>↗</span>
                    </a>
                  )}
                  {l.ticketUrl && (
                    <a href={httpHref(l.ticketUrl)} target="_blank" rel="noreferrer" className="text-bit hover:underline">
                      {t("eventUi.ticketShopShort")} <span aria-hidden>↗</span>
                    </a>
                  )}
                </span>
              )
            }
          />
          {l.description && (
            <Card>
              <p className="whitespace-pre-wrap text-fg/90">{l.description}</p>
            </Card>
          )}
          {newsCard}

          {/* Nick and LAN ID: one line, the forms open on tap. */}
          <details id="nick" open={sp.edit === "nick"} className="group scroll-mt-32 rounded-card border border-line bg-surface">
            <summary className="flex cursor-pointer list-none items-center gap-3 p-4 sm:px-5 [&::-webkit-details-marker]:hidden">
              <span className="min-w-0 flex-1 text-sm">
                <span className="text-muted">{t("event.shownAsShort")} </span>
                <strong className="text-fg">{myNick}</strong>
                {myLanId && (
                  <span className="text-muted">
                    {" · "}
                    {lanType ? t("event.typeId", { type: lanType.name }) : t("event.lanIdTitle")} <span className="font-mono text-fg">{myLanId}</span>
                  </span>
                )}
              </span>
              <span className="shrink-0 text-sm text-bit group-open:hidden">{t("event.change")}</span>
              <svg viewBox="0 0 16 16" width={14} height={14} aria-hidden className="shrink-0 text-muted transition group-open:rotate-180">
                <path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="M4 6l4 4 4-4" />
              </svg>
            </summary>
            <div className="space-y-4 border-t border-line p-4 sm:p-5">
              <div>
                <h3 className="mb-1 text-sm font-medium text-fg">{lanType ? t("event.nickAtType", { type: lanType.name }) : t("event.nickAtLan")}</h3>
                <p className="mb-2 text-sm text-muted">
                  {lanType ? t("event.nickForType", { type: lanType.name }) : t("event.nickForLan")}{" "}
                  {t.rich("event.defaultNick", {
                    profile: (
                      <Link href="/profile?tab=lans" className="text-bit hover:underline">
                        {t("event.profileLink")}
                      </Link>
                    ),
                  })}
                </p>
                {lanType ? (
                  <NickManager nicks={myNicks} typeId={lanType.id} placeholder={t("event.typeNick", { type: lanType.name })} />
                ) : (
                  <NickManager nicks={myNicks} lanId={l.id} />
                )}
              </div>
              <div>
                <h3 className="mb-1 text-sm font-medium text-fg">{lanType ? t("event.typeId", { type: lanType.name }) : t("event.lanIdTitle")}</h3>
                <p className="mb-2 text-sm text-muted">
                  {t("event.lanIdIntro")} {pattern ? t("event.lanIdLinked") : t("event.lanIdLeads")}
                </p>
                <LanIdForm value={myLanId} lanId={l.id} label={lanType ? t("profile.typeId", { type: lanType.name }) : t("profile.lanId")} />
                {myProfile && (
                  <p className="mt-1.5 truncate text-xs text-muted">
                    {t.rich("profile.yourProfileLink", {
                      url: (
                        <a href={myProfile} target="_blank" rel="noreferrer" className="text-bit hover:underline">
                          {myProfile}
                        </a>
                      ),
                    })}
                  </p>
                )}
              </div>
            </div>
          </details>
        </Columns>
      </TabPanel>
      </ClientTabs>
      {!isAdmin && <ReportButton lanId={l.id} />}
    </Page>
  );
}


function DateRow({ label, d, now, t }: { label: string; d: Date | null; now: Date; t: T }) {
  if (!d) return null;
  const past = d < now;
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right">
        {fmtDate(d, t.locale)}
        <span className={`block text-xs ${past ? "text-faint" : "text-warn"}`}>{relative(d, now, t.locale)}</span>
      </dd>
    </div>
  );
}

function AttendeeList({
  t,
  title,
  list,
  names,
  badges,
  linkDiscord,
  seatOf,
  marks,
  meId,
  profileBase,
  avatars,
  profiles,
  positions,
}: {
  t: T;
  /** Waitlist: keep the line's order and show each person's place instead of sorting by name. */
  positions?: Map<string, number>;
  avatars: Map<string, AvatarData>;
  /** Links to each attendee's profile on the event's own site. */
  profiles: Map<string, string>;
  /** "/clans/<slug>/members/" to link each name to the member's profile. */
  profileBase: string | null;
  title: string;
  list: (typeof attendance.$inferSelect)[];
  names: Map<string, string>;
  badges: Map<string, Badges>;
  /** Leads: the Discord mark opens their Discord profile. */
  linkDiscord: boolean;
  seatOf: Map<string, string>;
  /** Leads' status icons per person; empty for members. */
  marks: Map<string, StatusKind[]>;
  meId: string;
}) {
  if (list.length === 0) return null;
  // Long lists show the first dozen; the rest folds out so the page stays short on phones.
  const FIRST = 12;
  const item = (a: (typeof list)[number]) => (
    <li key={a.id} className="flex min-h-10 items-center justify-between gap-2 rounded-bit bg-raised/60 px-3 py-1.5 text-sm">
      <span className="flex min-w-0 items-center gap-2">
      {positions && <span className="w-5 shrink-0 text-right font-mono text-xs text-muted">{positions.get(a.userId) ?? "?"}</span>}
      <Avatar data={avatars.get(a.userId)} size={22} />
      {profileBase ? (
        <Link
          href={`${profileBase}${a.userId}`}
          className={`truncate hover:text-bit hover:underline ${a.userId === meId ? "font-semibold text-bit" : ""}`}
        >
          {names.get(a.userId)}
        </Link>
      ) : (
        <span className={`truncate ${a.userId === meId ? "font-semibold text-bit" : ""}`}>{names.get(a.userId)}</span>
      )}
      <MemberBadges b={badges.get(a.userId)} t={t} linkDiscord={linkDiscord} />
      </span>
      <span className="flex shrink-0 gap-1">
        {profiles.get(a.userId) && (
          <a
            href={profiles.get(a.userId)}
            target="_blank"
            rel="noreferrer"
            title={t("event.profileOnSite")}
            className="rounded-full border border-line px-2 py-0.5 text-xs text-bit hover:border-bit/50 hover:underline"
          >
            {t("event.profileShort")}
          </a>
        )}
        {seatOf.get(a.userId) && (
          <span title={t("status.seat", { seat: seatOf.get(a.userId)! })} className="px-1 font-mono text-xs text-muted">
            {seatOf.get(a.userId)}
          </span>
        )}
        <StatusIcons kinds={marks.get(a.userId) ?? []} t={t} />
      </span>
    </li>
  );
  // Me first, then by name, so the folded part never hides your own row.
  const sorted = [...list].sort(
    (a, b) =>
      (positions ? (positions.get(a.userId) ?? 1e9) - (positions.get(b.userId) ?? 1e9) : 0) || Number(b.userId === meId) - Number(a.userId === meId) || (names.get(a.userId) ?? "").localeCompare(names.get(b.userId) ?? ""),
  );
  const fold = sorted.length > FIRST + 3;
  return (
    <div className="mb-4">
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">{title} <span className="text-faint">{list.length}</span></h3>
      <ul className="grid gap-1 sm:grid-cols-2 xl:grid-cols-3">{(fold ? sorted.slice(0, FIRST) : sorted).map(item)}</ul>
      {fold && (
        <details className="group mt-1">
          <summary className="cursor-pointer list-none py-2 text-sm text-bit hover:underline group-open:hidden">
            {t("event.showAll", { count: sorted.length })}
          </summary>
          <ul className="grid gap-1 sm:grid-cols-2 xl:grid-cols-3">{sorted.slice(FIRST).map(item)}</ul>
        </details>
      )}
    </div>
  );
}
