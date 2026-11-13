import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { AttendanceButtons } from "@/components/attendance-buttons";
import { NickManager } from "@/components/nick-manager";
import { LanIdForm } from "@/components/lan-id-form";
import { profileLink, profilePattern } from "@/lib/profile-link";
import { getLanAccounts } from "@/lib/lan-accounts";
import { SeatMap } from "@/components/seat-map";
import { Avatar } from "@/components/avatar";
import { getAvatars, type AvatarData } from "@/lib/avatars";
import { Card, Columns, Page, Pill, StatusBadge, Verified } from "@/components/ui";
import { fmtDate, fmtTime, lanRange, relative } from "@/lib/format";
import { attendanceLocked, getDisplayNames, getLan, getNames, pickNick, seatView, signupClosed, waitlistPositions } from "@/lib/lans";
import { canViewLan, getCurrentUser, isLanManager, isProfileComplete } from "@/lib/session";
import { clanRole, getClan } from "@/lib/clans";
import { EventInvite } from "@/components/event-invite";
import { rolesWith } from "@/lib/clan-roles";
import { EventHeader } from "@/components/event-header";
import { buildChecklist, onTheDay } from "@/lib/checklist";
import { LanChecklist } from "@/components/lan-checklist";
import { SeatWishes } from "@/components/seat-wishes";
import { Tabs } from "@/components/tabs";
import { TravelBoard, type TravelPostView } from "@/components/travel-board";
import { PackingList } from "@/components/gear-board";
import { PACKING_ITEMS } from "@/lib/gear";
import { GameList } from "@/components/game-list";
import { GAMES_REMINDER_DAYS, listGames } from "@/lib/games";
import { SeatSwapPanel, type SwapView } from "@/components/seat-swaps";
import { CheckInButton, DeleteNewsButton, InterestButtons } from "@/components/event-extras";
import { FoodOrders, type FoodOrderCardView } from "@/components/food-orders";
import { foodCurrency, isAcceptingItems, listFoodOrders, orderText } from "@/lib/food";
import { getT } from "@/i18n/server";
import type { T } from "@/i18n/translate";

const { attendance, seat, nickname } = schema;

const TABS = ["overview", "seats", "attendees", "travel", "gear", "games", "food"] as const;

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
  const tab = TABS.find((t) => t === sp.tab) ?? "overview";
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
  const lanClan = l.clanId ? getClan(l.clanId) : undefined;
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
    ]),
  ]);
  // The clan's name display (default Name "Nick" Surname); the bare nick only inside small seat cells.
  const names = new Map([...people].map(([uid, n]) => [uid, n.label]));
  const verified = new Set([...people].flatMap(([uid, n]) => (n.verified ? [uid] : [])));
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
  const published = !!l.seatsPublishedAt;
  // Optional self-pick step: members choose their own seat until the leads finalize the plan.
  const picking = l.seatPicking && !published;
  const mySeatLabel = published || picking ? (seats.find((s) => s.userId === me.id)?.label ?? null) : null;
  const games = listGames(id, me.id);
  const gamesToInstall = games.filter((g) => g.votes > 0 && !g.myInstalled).length;
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
    games: { voted: games.filter((g) => g.votes > 0).length, toInstall: gamesToInstall },
    now,
    t,
  });
  const full = l.capacity != null && going.length >= l.capacity;
  const myInterest =
    db
      .select()
      .from(schema.lanInterest)
      .where(and(eq(schema.lanInterest.lanId, id), eq(schema.lanInterest.userId, me.id)))
      .get()?.answer ?? null;
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
  const canTakePart = !!my && my.status !== "declined";
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
  const openRequests = posts.filter((p) => p.mode === "request" && isIn(p.userId)).length;
  const packed =
    tab === "gear"
      ? db
          .select()
          .from(schema.gearPacked)
          .where(and(eq(schema.gearPacked.lanId, id), eq(schema.gearPacked.userId, me.id)))
          .all()
          .map((p) => p.item)
      : [];
  const ownItems =
    tab === "gear"
      ? db
          .select()
          .from(schema.packingItem)
          .where(and(eq(schema.packingItem.lanId, id), eq(schema.packingItem.userId, me.id)))
          .all()
          .sort((a, b) => +a.createdAt - +b.createdAt)
          .map((it) => ({ id: it.id, label: it.label, packed: it.packed }))
      : [];

  const gameNames = tab === "games" ? Object.fromEntries(await getDisplayNames(id, [...new Set(games.flatMap((g) => g.voters))])) : {};

  // Food orders at the LAN: everyone coming can start one or add to one.
  const foodOrders = listFoodOrders(id);
  const openFood = foodOrders.filter((o) => isAcceptingItems(o, now)).length;
  const canOrderFood = isAdmin || canTakePart;
  const foodNames =
    tab === "food"
      ? Object.fromEntries(
          await getDisplayNames(id, [
            ...new Set(foodOrders.flatMap((o) => [...o.people.map((p) => p.userId), ...(o.createdBy ? [o.createdBy] : [])])),
          ]),
        )
      : {};
  const currency = foodCurrency();
  const foodViews: FoodOrderCardView[] =
    tab === "food"
      ? foodOrders.map((o) => ({
          ...o,
          text: orderText(o, foodNames, currency, t),
          canRun: o.createdBy === me.id || isAdmin,
          accepting: isAcceptingItems(o, now),
          closesTime: o.closesAt ? fmtTime(o.closesAt) : null,
          closesLabel: o.closesAt ? fmtDate(o.closesAt, t.locale) : null,
        }))
      : [];

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
        <a href={l.externalPlanUrl} target="_blank" rel="noreferrer" className="text-sm text-bit hover:underline">
          {t("event.eventSeatPlan")} <span aria-hidden>↗</span>
        </a>
      )}
      {picking && seats.length > 0 && <Pill tone="emerald">{t("event.pickYourSeat")}</Pill>}
      {published ? <Pill tone="emerald">{t("event.final")}</Pill> : seats.length > 0 && <Pill tone="amber">{t("event.notFinal")}</Pill>}
    </span>
  );
  const wishesCard = my?.status === "going" && !published && seats.length > 0 && (
    <Card title={t("event.seatWishes")}>
      <p className="mb-3 text-sm text-muted">{t("event.seatWishesIntro")}</p>
      <SeatWishes
        lanId={l.id}
        people={rows
          .filter((r) => r.userId !== me.id && (r.status === "going" || r.status === "maybe" || r.status === "waitlist"))
          .map((r) => ({ id: r.userId, name: names.get(r.userId) ?? "?" }))
          .sort((a, b) => a.name.localeCompare(b.name))}
        seatLabels={[...seats].sort((a, b) => a.row - b.row || a.col - b.col).map((s) => s.label)}
        initial={{
          near: my.wishNear ?? [],
          avoid: my.wishAvoid ?? [],
          position: my.wishPosition,
          seat: my.wishSeat,
          note: my.wishNote,
        }}
      />
    </Card>
  );

  return (
    <Page>
      <EventHeader lan={l} clan={lanClan} mode="view" canManage={isAdmin} tab={tab} />

      {/* Your answer and your checklist sit above the tabs, so they show on every tab. */}
      <div className={`grid items-stretch gap-4 ${my && my.status !== "declined" && !l.cancelledAt && !l.interestCheck ? "lg:grid-cols-[20rem_minmax(0,1fr)] 2xl:grid-cols-[22rem_minmax(0,1fr)]" : ""}`}>
        {l.interestCheck && !l.cancelledAt ? (
        <section aria-label={t("event.wouldYouCome")} className="rounded-card border border-line bg-surface p-3 sm:p-4">
          <h2 className="mb-1 text-sm font-semibold text-fg">{t("event.wouldYouCome")}</h2>
          <p className="mb-3 text-sm text-muted">{t("event.notBinding")}</p>
          <InterestButtons lanId={l.id} current={myInterest} />
        </section>
        ) : (
        <section aria-label={t("event.yourAttendance")} className="rounded-card border border-line bg-surface p-3 sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-fg">{t("event.yourAnswer")}</h2>
            <StatusBadge status={my?.status} seat={seatOf.get(me.id)} />
          </div>
          {locked || closed ? (
            // Locked (ticket bought) or sign-up closed: just show the answer, no buttons.
            <div>
              <p className="text-lg font-semibold text-fg">{t(`event.answer.${my?.status ?? "none"}`)}</p>
              <p className="mt-1 text-sm text-muted">
                {l.cancelledAt ? t("event.cancelled") : locked ? t("event.locked") : t("event.signupClosed")}
              </p>
            </div>
          ) : (
            <AttendanceButtons lanId={l.id} current={my?.status ?? null} disabled={false} />
          )}
          {my?.status === "waitlist" && (
            <p className="mt-3 text-sm text-seat-taken">
              {t.rich("event.waitlistPlace", { place: <strong>#{myPlace ?? "?"}</strong> })}{" "}
              {l.waitlistAuto ? t("event.waitlistAuto") : t("event.waitlistManual")} {t("event.waitlistLeave")}
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
        {my && my.status !== "declined" && !l.cancelledAt && !l.interestCheck && (
          <LanChecklist
            variant="strip"
            lanId={l.id}
            steps={steps}
            ticketBought={my.ticketBought}
            canReportTicket={my.status === "going" || my.status === "waitlist"}
          />
        )}
      </div>

      <Tabs
        tabs={[
          { id: "overview", label: t("event.tabs.overview") },
          { id: "seats", label: t("event.tabs.seats"), badge: picking && seats.length > 0 ? t("event.tabs.pickYours") : undefined },
          { id: "attendees", label: t("event.tabs.attendees"), count: going.length },
          { id: "travel", label: t("event.tabs.travel"), badge: openRequests ? t("event.tabs.looking", { count: openRequests }) : undefined },
          { id: "gear", label: t("event.tabs.gear") },
          { id: "games", label: t("event.tabs.games"), badge: my?.status === "going" && gamesToInstall ? t("event.tabs.toInstall", { count: gamesToInstall }) : undefined },
          { id: "food", label: t("event.tabs.food"), badge: openFood ? t("event.tabs.open", { count: openFood }) : undefined },
        ]}
        active={tab}
        hrefFor={(tb) => (tb === "overview" ? `/lans/${l.id}` : `/lans/${l.id}?tab=${tb}`)}
      />

      {tab === "travel" && (
        <div>
          <p className="mb-4 max-w-2xl text-sm text-muted">{t("event.travelIntro")}</p>
          <TravelBoard lanId={l.id} posts={travelViews} meId={me.id} canPost={canTakePart} isManager={isAdmin} />
        </div>
      )}

      {tab === "gear" && (
        <Columns>
          <PackingList lanId={l.id} items={PACKING_ITEMS} packed={packed} own={ownItems} />
        </Columns>
      )}

      {tab === "games" && (
        <div className="max-w-3xl">
          <GameList
            lanId={l.id}
            games={games}
            meId={me.id}
            canManage={isAdmin}
            canAdd={canTakePart || isAdmin}
            names={gameNames}
            reminderDays={GAMES_REMINDER_DAYS}
          />
        </div>
      )}

      {tab === "food" && (
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

      {tab === "seats" && (
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
              lanId={l.id}
              rows={l.seatRows}
              cols={l.seatCols}
              meId={me.id}
              mode={picking && my?.status === "going" && (my.ticketBought || my.paid) ? "pick" : "view"}
              seats={seats.map((s) => seatView(s, people, avatars))}
              title={t("event.ourSeats")}
              actions={seatPills}
            >
              {wishesCard}
              {swapCard}
            </SeatMap>
          ) : (
            <div className="grid items-start gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] 2xl:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="min-w-0 space-y-4 sm:space-y-6">
                <Card title={t("event.ourSeats")} actions={seatPills}>
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
            </div>
          )}
        </>
      )}

      {tab === "attendees" && (
        <Card
          title={l.capacity ? t("event.attendeesTitleOf", { count: going.length, capacity: l.capacity }) : t("event.attendeesTitle", { count: going.length })}
          actions={full && <Pill tone="red">{t("event.fullWaitlist")}</Pill>}
        >
          <AttendeeList t={t} title={t("event.coming")} list={going} profileBase={profileBase} names={names} verified={verified} avatars={avatars} profiles={profiles} seatOf={seatOf} showPaid={isAdmin} meId={me.id} />
          <AttendeeList t={t} title={t("event.waitlist")} positions={linePos} list={group("waitlist")} profileBase={profileBase} names={names} verified={verified} avatars={avatars} profiles={profiles} seatOf={seatOf} showPaid={isAdmin} meId={me.id} />
          <AttendeeList t={t} title={t("event.unsure")} list={group("maybe")} profileBase={profileBase} names={names} verified={verified} avatars={avatars} profiles={profiles} seatOf={seatOf} showPaid={false} meId={me.id} />
          {group("declined").length > 0 && <p className="mt-3 text-xs text-muted">{t("event.cantMakeIt", { count: group("declined").length })}</p>}
        </Card>
      )}

      {tab === "overview" && (
        // Your answer and checklist are above the tabs. Desktop: event on the left, dates in a sidebar on the right.
        // Phones: the event first, dates last.
        <div className="grid grid-cols-1 items-start gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] 2xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="order-last min-w-0 space-y-4 sm:space-y-6 lg:order-none lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <Card title={t("event.dates")}>
              <dl className="space-y-3 text-sm">
                <DateRow label={t("event.answerBy")} d={l.signupDeadline} now={now} t={t} />
                <DateRow label={t("event.buyTicketBy")} d={l.paymentDueDate} now={now} t={t} />
                {l.price && (
                  <div className="flex justify-between">
                    <dt className="text-muted">{t("event.ticketPrice")}</dt>
                    <dd>{l.price}</dd>
                  </div>
                )}
                {my && (my.status === "going" || my.status === "waitlist") && l.paymentDueDate && (
                  <div className="flex justify-between">
                    <dt className="text-muted">{t("event.yourTicket")}</dt>
                    <dd>
                      {my.paid ? (
                        <Pill tone="emerald">{t("event.ticketConfirmed")}</Pill>
                      ) : my.ticketBought ? (
                        <Pill tone="amber">{t("event.ticketReported")}</Pill>
                      ) : (
                        <Pill tone="red">{t("event.ticketOpen")}</Pill>
                      )}
                    </dd>
                  </div>
                )}
              </dl>
            </Card>
          </div>

          <div className="min-w-0 space-y-4 sm:space-y-6 lg:col-start-1 lg:row-start-1">
            {news.length > 0 && (
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
            )}
            {l.description && (
              <Card>
                <p className="whitespace-pre-wrap text-fg/90">{l.description}</p>
              </Card>
            )}

            {/* At a glance: links into the Seats and Attendees tabs. */}
            <div className="grid gap-4 sm:grid-cols-2 sm:gap-6">
              <Link href={`/lans/${l.id}?tab=seats`} scroll={false} className="group rounded-card border border-line bg-surface p-4 transition hover:border-bit/50 sm:p-5">
                <p className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-muted">
                  {t("event.yourSeat")} <span className="text-bit transition group-hover:translate-x-0.5" aria-hidden>→</span>
                </p>
                <p className="mt-1 font-mono text-2xl font-bold text-fg">{seatOf.get(me.id) ?? mySeatLabel ?? "–"}</p>
                <p className="mt-1 text-sm text-muted">
                  {seats.length === 0
                    ? t("event.seatsNotEntered")
                    : published
                      ? t("event.planFinalFree", { count: seats.filter((s) => !s.userId && !s.locked).length })
                      : picking
                        ? mySeatLabel
                          ? t("event.pickNotFinal")
                          : t("event.pickOn")
                        : t("event.finalizeSoon")}
                </p>
              </Link>
              <Link href={`/lans/${l.id}?tab=attendees`} scroll={false} className="group rounded-card border border-line bg-surface p-4 transition hover:border-bit/50 sm:p-5">
                <p className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-muted">
                  {t("event.whosComing")} <span className="text-bit transition group-hover:translate-x-0.5" aria-hidden>→</span>
                </p>
                <p className="mt-1 text-2xl font-bold text-fg">
                  {going.length}
                  {l.capacity ? <span className="text-base font-medium text-muted"> / {l.capacity}</span> : null}
                </p>
                <p className="mt-1 truncate text-sm text-muted">
                  {going.length
                    ? going.slice(0, 4).map((a) => names.get(a.userId)).join(", ") + (going.length > 4 ? ` +${going.length - 4}` : "")
                    : t("event.nobodyYet")}
                  {group("waitlist").length > 0 && ` · ${t("event.waiting", { count: group("waitlist").length })}`}
                </p>
              </Link>
            </div>

            <div className="grid items-start gap-4 sm:gap-6 md:grid-cols-2">
              <Card title={orgaIds.length ? t("event.leads") : t("event.contact")}>
                <p className="mb-3 text-sm text-muted">{t("event.askLeads")}</p>
                <ul className="space-y-2">
                  {orgas.map((o) => (
                    <li key={o.id} className="flex items-center justify-between gap-2 text-sm">
                      <span>
                        {lanClan ? (
                          <Link href={`/clans/${lanClan.slug}/members/${o.id}`} className="font-medium text-fg hover:text-bit hover:underline">
                            {orgaNames.get(o.id) ?? o.name}
                          </Link>
                        ) : (
                          <span className="font-medium text-fg">{orgaNames.get(o.id) ?? o.name}</span>
                        )}
                      </span>
                      <a href={`mailto:${o.email}?subject=${encodeURIComponent(l.name)}`} className="text-bit hover:underline">
                        {t("event.email")}
                      </a>
                    </li>
                  ))}
                </ul>
              </Card>

              <Card title={lanType ? t("event.nickAtType", { type: lanType.name }) : t("event.nickAtLan")}>
                <p className="mb-3 text-sm text-muted">
                  {t.rich("event.shownAs", { nick: <strong className="text-fg">{myNick}</strong> })}{" "}
                  {lanType ? t("event.nickForType", { type: lanType.name }) : t("event.nickForLan")}{" "}
                  {t.rich("event.defaultNick", {
                    profile: (
                      <Link href="/profile" className="text-bit hover:underline">
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
                <div className="mt-4 border-t border-line pt-4">
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
              </Card>
            </div>
          </div>
        </div>
      )}
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
  verified,
  seatOf,
  showPaid,
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
  verified: Set<string>;
  seatOf: Map<string, string>;
  showPaid: boolean;
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
      {verified.has(a.userId) && <Verified />}
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
        {seatOf.get(a.userId) && <Pill>{seatOf.get(a.userId)}</Pill>}
        {showPaid && (a.paid ? <Pill tone="emerald">{t("event.ticketOk")}</Pill> : a.ticketBought ? <Pill tone="amber">{t("event.reported")}</Pill> : <Pill tone="red">{t("event.noTicket")}</Pill>)}
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
