import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { AttendanceButtons } from "@/components/attendance-buttons";
import { NickManager } from "@/components/nick-manager";
import { LanIdForm } from "@/components/lan-id-form";
import { getLanAccounts } from "@/lib/lan-accounts";
import { SeatMap } from "@/components/seat-map";
import { Card, Pill, StatusBadge, btnGhost, btnSecondary } from "@/components/ui";
import { fmtDate, fmtRange, relative } from "@/lib/format";
import { ATTENDANCE_LOCKED_MSG, attendanceLocked, getDisplayNames, getLan, pickNick, signupClosed } from "@/lib/lans";
import { canViewLan, isLanManager, requireUser } from "@/lib/session";
import { getClan } from "@/lib/clans";
import { ClanAvatar } from "@/components/clan-avatar";
import { buildChecklist, progress } from "@/lib/checklist";
import { LanChecklist } from "@/components/lan-checklist";
import { SeatWishes } from "@/components/seat-wishes";
import { Tabs } from "@/components/tabs";
import { TravelBoard, type TravelPostView } from "@/components/travel-board";
import { PackingList, SharedGear } from "@/components/gear-board";
import { GEAR_SUGGESTIONS, PACKING_ITEMS, lastGearSource } from "@/lib/gear";

const { attendance, seat, nickname } = schema;

const TABS = ["overview", "travel", "gear"] as const;

export default async function LanPage({ params, searchParams }: PageProps<"/lans/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = TABS.find((t) => t === sp.tab) ?? "overview";
  const me = await requireUser();
  const l = getLan(id);
  if (!l || !canViewLan(me, id)) notFound();
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
        .where(and(eq(schema.clanMember.clanId, l.clanId ?? ""), eq(schema.clanMember.role, "admin")))
        .all()
        .map((r) => r.u);
  const orgaNames = await getDisplayNames(id, orgas.map((o) => o.id));
  const myNick = pickNick(myNicks, { lanId: id, typeId: l.typeId }, me.name);
  const myLanId = getLanAccounts(l, [me.id]).get(me.id) ?? null;
  const posts = db.select().from(schema.travelPost).where(eq(schema.travelPost.lanId, id)).all();
  const spots = posts.length
    ? db.select().from(schema.travelSpot).where(inArray(schema.travelSpot.postId, posts.map((p) => p.id))).all()
    : [];
  const needs = db.select().from(schema.gearNeed).where(eq(schema.gearNeed.lanId, id)).all();
  const pledges = db.select().from(schema.gearPledge).where(eq(schema.gearPledge.lanId, id)).all();
  const names = await getDisplayNames(id, [
    ...new Set([
      ...rows.map((r) => r.userId),
      ...seats.flatMap((s) => (s.userId ? [s.userId] : [])),
      ...posts.map((p) => p.userId),
      ...spots.map((s) => s.userId),
      ...pledges.map((p) => p.userId),
    ]),
  ]);
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
  const isAdmin = isLanManager(me, id);
  const published = !!l.seatsPublishedAt;
  const steps = buildChecklist({
    lan: l,
    attendance: my,
    hasNick: myNicks.some(
      (n) => (n.lanId === null && n.typeId === null) || n.lanId === id || (!!l.typeId && n.typeId === l.typeId),
    ),
    seatLabel: published ? (seatOf.get(me.id) ?? null) : null,
    hasSeatPlan: seats.length > 0,
    freeSeats: seats.filter((s) => !s.userId && !s.locked).length,
  });
  const full = l.capacity != null && going.length >= l.capacity;
  const prog = progress(steps);

  // Travel and gear: people who said they're not coming no longer count.
  const out = new Set(rows.filter((r) => r.status === "declined").map((r) => r.userId));
  const isIn = (uid: string) => rows.some((r) => r.userId === uid) && !out.has(uid);
  const canTakePart = !!my && my.status !== "declined";
  const travelViews: TravelPostView[] = posts
    .sort((a, b) => +a.createdAt - +b.createdAt)
    .map((p) => ({
      id: p.id,
      userId: p.userId,
      nick: names.get(p.userId) ?? "?",
      kind: p.kind,
      mode: p.mode,
      town: p.town,
      places: p.places,
      whenText: p.whenText,
      note: p.note,
      notComing: !isIn(p.userId),
      spots: spots.filter((s) => s.postId === p.id).map((s) => ({ userId: s.userId, nick: names.get(s.userId) ?? "?" })),
    }));
  const openRequests = posts.filter((p) => p.mode === "request" && isIn(p.userId)).length;
  const needViews = needs
    .sort((a, b) => +a.createdAt - +b.createdAt)
    .map((n) => ({
      id: n.id,
      name: n.name,
      qty: n.qty,
      note: n.note,
      pledges: pledges
        .filter((p) => p.needId === n.id && isIn(p.userId))
        .map((p) => ({ userId: p.userId, nick: names.get(p.userId) ?? "?", qty: p.qty })),
    }));
  const packed =
    tab === "gear"
      ? db
          .select()
          .from(schema.gearPacked)
          .where(and(eq(schema.gearPacked.lanId, id), eq(schema.gearPacked.userId, me.id)))
          .all()
          .map((p) => p.item)
      : [];
  const src = tab === "gear" && isAdmin && needs.length === 0 ? lastGearSource(id) : undefined;
  const copyFrom = src
    ? { id: src.id, name: src.name, count: db.select().from(schema.gearNeed).where(eq(schema.gearNeed.lanId, src.id)).all().length }
    : undefined;
  const gearMissing = needViews.filter((n) => n.pledges.reduce((s, p) => s + p.qty, 0) < n.qty).length;


  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          {lanClan && (
            <Link href={`/clans/${lanClan.slug}`} className="mb-1.5 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
              <ClanAvatar clan={lanClan} size={20} /> <span className="truncate">{lanClan.name}</span>
            </Link>
          )}
          <h1 className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">{l.name}</h1>
          <p className="mt-1 text-sm text-muted sm:text-base">
            {fmtRange(l.startsAt, l.endsAt)}
            {l.location && <span className="block sm:inline"><span className="hidden sm:inline"> · </span>{l.location}</span>}
          </p>
          {(l.websiteUrl || l.ticketUrl) && (
            <p className="mt-3 flex flex-wrap gap-2 text-sm">
              {l.websiteUrl && (
                <a href={l.websiteUrl} target="_blank" rel="noreferrer" className={`${btnGhost} border border-line !text-bit`}>
                  Event website <span aria-hidden>↗</span>
                </a>
              )}
              {l.ticketUrl && (
                <a href={l.ticketUrl} target="_blank" rel="noreferrer" className={`${btnGhost} border border-line !text-bit`}>
                  Ticket shop <span aria-hidden>↗</span>
                </a>
              )}
            </p>
          )}
        </div>
        {isAdmin && (
          <Link href={`/lans/${l.id}/manage`} className={btnSecondary}>
            Manage
          </Link>
        )}
      </div>

      <Tabs
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "travel", label: "Travel", badge: openRequests ? `${openRequests} looking` : undefined },
          { id: "gear", label: "Gear", badge: gearMissing ? `${gearMissing} missing` : undefined },
        ]}
        active={tab}
        hrefFor={(t) => (t === "overview" ? `/lans/${l.id}` : `/lans/${l.id}?tab=${t}`)}
      />

      {tab === "travel" && (
        <div>
          <p className="mb-4 max-w-2xl text-sm text-muted">
            Share rides and places to sleep, grouped by town. Join a ride with free seats, or post where you need one from.
          </p>
          <TravelBoard lanId={l.id} posts={travelViews} meId={me.id} canPost={canTakePart} isManager={isAdmin} />
        </div>
      )}

      {tab === "gear" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="min-w-0 lg:col-span-2">
            <SharedGear
              lanId={l.id}
              needs={needViews}
              extras={pledges
                .filter((p) => !p.needId && isIn(p.userId))
                .map((p) => ({ id: p.id, userId: p.userId, nick: names.get(p.userId) ?? "?", name: p.name, qty: p.qty }))}
              meId={me.id}
              canPledge={canTakePart}
              isManager={isAdmin}
              suggestions={GEAR_SUGGESTIONS}
              copyFrom={copyFrom}
            />
          </div>
          <div className="min-w-0">
            <PackingList lanId={l.id} items={PACKING_ITEMS} packed={packed} />
          </div>
        </div>
      )}

      {tab === "overview" && (
        // Phones: your answer and checklist first, then the event, then the rest.
        // Desktop: event on the left, your stuff in a sidebar on the right.
        <div className="grid grid-cols-1 items-start gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] 2xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0 space-y-4 sm:space-y-6 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <Card title="Your attendance" actions={<StatusBadge status={my?.status} seat={seatOf.get(me.id)} />}>
            <AttendanceButtons lanId={l.id} current={my?.status ?? null} disabled={!!closed || locked} />
            {locked && !closed && <p className="mt-3 text-sm text-muted">{ATTENDANCE_LOCKED_MSG}</p>}
            {my?.status === "waitlist" && (
              <p className="mt-3 text-sm text-seat-taken">
                The LAN is full. You&apos;re on the waitlist and will get an email if a spot opens up.
              </p>
            )}
            {closed && <p className="mt-3 text-sm text-muted">Sign-up is closed.</p>}
          </Card>

          {my && my.status !== "declined" && (
            <Card title="Your checklist" actions={<span className="text-sm text-muted">{prog.done} / {prog.total}</span>}>
              <LanChecklist
                lanId={l.id}
                steps={steps}
                ticketBought={my.ticketBought}
                canReportTicket={my.status === "going" || my.status === "waitlist"}
              />
            </Card>
          )}
          <Card title="Dates">
            <dl className="space-y-3 text-sm">
              <DateRow label="Answer by" d={l.signupDeadline} now={now} />
              <DateRow label="Buy ticket by" d={l.paymentDueDate} now={now} />
              {l.price && (
                <div className="flex justify-between">
                  <dt className="text-muted">Ticket price</dt>
                  <dd>{l.price}</dd>
                </div>
              )}
              {my && (my.status === "going" || my.status === "waitlist") && l.paymentDueDate && (
                <div className="flex justify-between">
                  <dt className="text-muted">Your ticket</dt>
                  <dd>
                    {my.paid ? (
                      <Pill tone="emerald">Confirmed</Pill>
                    ) : my.ticketBought ? (
                      <Pill tone="amber">Reported</Pill>
                    ) : (
                      <Pill tone="red">Open</Pill>
                    )}
                  </dd>
                </div>
              )}
            </dl>
          </Card>

          </div>

          <div className="min-w-0 space-y-4 sm:space-y-6 lg:col-start-1 lg:row-start-1">
          {l.description && (
            <Card>
              <p className="whitespace-pre-wrap text-fg/90">{l.description}</p>
            </Card>
          )}

          <Card
            title="Our seats"
            actions={
              <span className="flex gap-2">
                {!published && seats.length > 0 && <Pill tone="amber">Not published yet</Pill>}
              </span>
            }
          >
            {seats.length === 0 ? (
              <p className="text-sm text-muted">The orgas haven&apos;t entered the group&apos;s seats yet.</p>
            ) : published || isAdmin ? (
              <SeatMap
                lanId={l.id}
                rows={l.seatRows}
                cols={l.seatCols}
                meId={me.id}
                mode="view"
                seats={seats.map((s) => ({ ...s, nick: s.userId ? (names.get(s.userId) ?? "?") : null }))}
              />
            ) : (
              <p className="text-sm text-muted">
                The group has {seats.length} seats ({seats[0]?.label}
                {seats.length > 1 ? `–${seats[seats.length - 1]?.label}` : ""}). The orgas assign them after the deadline
                and then publish the seat plan here.
              </p>
            )}
          </Card>

          <Card
            title={`Attendees (${going.length}${l.capacity ? ` / ${l.capacity}` : ""})`}
            actions={full && <Pill tone="red">Full · new sign-ups go on the waitlist</Pill>}
          >
            <AttendeeList title="Coming" list={going} names={names} seatOf={seatOf} showPaid={isAdmin} meId={me.id} />
            <AttendeeList title="Waitlist" list={group("waitlist")} names={names} seatOf={seatOf} showPaid={isAdmin} meId={me.id} />
            <AttendeeList title="Unsure" list={group("maybe")} names={names} seatOf={seatOf} showPaid={false} meId={me.id} />
            {group("declined").length > 0 && (
              <p className="mt-3 text-xs text-muted">{group("declined").length} can&apos;t make it.</p>
            )}
          </Card>
          </div>

          <div className="min-w-0 space-y-4 sm:space-y-6 lg:col-start-1 lg:row-start-2">
          {my?.status === "going" && !published && seats.length > 0 && (
            <Card title="Seat wishes">
              <p className="mb-3 text-sm text-muted">
                Tell the orgas where you&apos;d like to sit. They plan the seats after the deadline.
              </p>
              <SeatWishes
                lanId={l.id}
                people={rows
                  .filter((r) => r.userId !== me.id && (r.status === "going" || r.status === "maybe" || r.status === "waitlist"))
                  .map((r) => ({ id: r.userId, nick: names.get(r.userId) ?? "?" }))
                  .sort((a, b) => a.nick.localeCompare(b.nick))}
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
          )}

          <div className="grid items-start gap-4 sm:gap-6 md:grid-cols-2">
          <Card title={orgaIds.length ? "Orgas" : "Contact"}>
            <p className="mb-3 text-sm text-muted">Questions about this LAN? Ask the orgas.</p>
            <ul className="space-y-2">
              {orgas.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>
                    <span className="font-medium text-fg">{orgaNames.get(o.id) ?? o.name}</span>
                    {orgaNames.get(o.id) !== o.name && <span className="text-faint"> · {o.name}</span>}
                  </span>
                  <a
                    href={`mailto:${o.email}?subject=${encodeURIComponent(l.name)}`}
                    className="text-bit hover:underline"
                  >
                    Email
                  </a>
                </li>
              ))}
            </ul>
          </Card>

          <Card title={lanType ? `Your nick & ID at ${lanType.name}` : "Your nick & ID at this LAN"}>
            <p className="mb-3 text-sm text-muted">
              Shown as <strong className="text-fg">{myNick}</strong>.{" "}
              {lanType
                ? `The nick you set here is used for every ${lanType.name} event. `
                : "The nick you set here is used for this LAN only. "}
              Your default nick is on your{" "}
              <Link href="/profile" className="text-bit hover:underline">
                profile
              </Link>
              .
            </p>
            {lanType ? (
              <NickManager nicks={myNicks} typeId={lanType.id} placeholder={`Your ${lanType.name} nick`} />
            ) : (
              <NickManager nicks={myNicks} lanId={l.id} />
            )}
            <div className="mt-4 border-t border-line pt-4">
              <h3 className="mb-1 text-sm font-medium text-fg">{lanType ? `Your ${lanType.name} ID` : "Your ID at this LAN"}</h3>
              <p className="mb-2 text-sm text-muted">
                Optional: your user ID or ticket number on the LAN&apos;s own site, so the orgas can match you up. Only
                orgas see it.
              </p>
              <LanIdForm value={myLanId} lanId={l.id} label={lanType ? `${lanType.name} ID` : "LAN ID"} />
            </div>
          </Card>
          </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DateRow({ label, d, now }: { label: string; d: Date | null; now: Date }) {
  if (!d) return null;
  const past = d < now;
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right">
        {fmtDate(d)}
        <span className={`block text-xs ${past ? "text-faint" : "text-warn"}`}>{relative(d, now)}</span>
      </dd>
    </div>
  );
}

function AttendeeList({
  title,
  list,
  names,
  seatOf,
  showPaid,
  meId,
}: {
  title: string;
  list: (typeof attendance.$inferSelect)[];
  names: Map<string, string>;
  seatOf: Map<string, string>;
  showPaid: boolean;
  meId: string;
}) {
  if (list.length === 0) return null;
  // Long lists show the first dozen; the rest folds out so the page stays short on phones.
  const FIRST = 12;
  const item = (a: (typeof list)[number]) => (
    <li key={a.id} className="flex min-h-10 items-center justify-between gap-2 rounded-bit bg-raised/60 px-3 py-1.5 text-sm">
      <span className={`truncate ${a.userId === meId ? "font-semibold text-bit" : ""}`}>{names.get(a.userId)}</span>
      <span className="flex shrink-0 gap-1">
        {seatOf.get(a.userId) && <Pill>{seatOf.get(a.userId)}</Pill>}
        {showPaid && (a.paid ? <Pill tone="emerald">ticket ok</Pill> : a.ticketBought ? <Pill tone="amber">reported</Pill> : <Pill tone="red">no ticket</Pill>)}
      </span>
    </li>
  );
  // Me first, then by nick, so the folded part never hides your own row.
  const sorted = [...list].sort(
    (a, b) => Number(b.userId === meId) - Number(a.userId === meId) || (names.get(a.userId) ?? "").localeCompare(names.get(b.userId) ?? ""),
  );
  const fold = sorted.length > FIRST + 3;
  return (
    <div className="mb-4">
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">{title} <span className="text-faint">{list.length}</span></h3>
      <ul className="grid gap-1 sm:grid-cols-2">{(fold ? sorted.slice(0, FIRST) : sorted).map(item)}</ul>
      {fold && (
        <details className="group mt-1">
          <summary className="cursor-pointer list-none py-2 text-sm text-bit hover:underline group-open:hidden">
            Show all {sorted.length}
          </summary>
          <ul className="grid gap-1 sm:grid-cols-2">{sorted.slice(FIRST).map(item)}</ul>
        </details>
      )}
    </div>
  );
}
