import Link from "next/link";
import { and, asc, desc, eq, gt, inArray, isNotNull, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Lan } from "@/db/schema";
import { EmptyState, Page, PageHeader, Pill, StatusBadge, btnPrimary } from "@/components/ui";
import { fmtDay, lanDay, lanWeekday, relative } from "@/lib/format";
import { requireUser, visibleLans } from "@/lib/session";
import { buildChecklist, progress } from "@/lib/checklist";
import { myClans } from "@/lib/clans";
import { roleCan } from "@/lib/clan-roles";
import { ClanAvatar } from "@/components/clan-avatar";

const { lan, attendance, seat, nickname } = schema;

export default async function Home() {
  const me = await requireUser();
  const now = new Date();
  const clans = myClans(me.id);
  if (clans.length === 0) return <NoClan />;
  const clanIds = clans.map((c) => c.clan.id);
  const clanById = new Map(clans.map((c) => [c.clan.id, c.clan]));
  // Clans this user creates events for (admins and event managers).
  const adminClans = clans.filter((c) => roleCan(c.role, "events"));
  const upcoming = visibleLans(
    me,
    db
      .select()
      .from(lan)
      .where(and(gt(lan.endsAt, now), inArray(lan.clanId, clanIds)))
      .orderBy(asc(lan.startsAt))
      .all(),
  );
  const past = db
    .select()
    .from(lan)
    .where(and(lte(lan.endsAt, now), inArray(lan.clanId, clanIds), isNotNull(lan.publishedAt)))
    .orderBy(desc(lan.startsAt))
    .limit(10)
    .all();
  const all = db.select().from(attendance).all();
  const mine = new Map(all.filter((a) => a.userId === me.id).map((a) => [a.lanId, a]));
  const going = (id: string) => all.filter((a) => a.lanId === id && a.status === "going").length;
  const seats = db.select().from(seat).all();
  const myNicks = db
    .select()
    .from(nickname)
    .where(eq(nickname.userId, me.id))
    .all();
  const info = (l: Lan) => {
    const ls = seats.filter((s) => s.lanId === l.id);
    const mySeat = l.seatsPublishedAt ? (ls.find((s) => s.userId === me.id)?.label ?? null) : null;
    const freeSeats = ls.filter((s) => !s.userId && !s.locked).length;
    const steps = buildChecklist({
      lan: l,
      attendance: mine.get(l.id),
      hasNick: myNicks.some(
        (n) => (n.lanId === null && n.typeId === null) || n.lanId === l.id || (!!l.typeId && n.typeId === l.typeId),
      ),
      seatLabel: mySeat,
      hasSeatPlan: ls.length > 0,
      freeSeats,
    });
    return { mySeat, freeSeats, hasSeats: ls.length > 0, progress: progress(steps) };
  };

  return (
    <Page>
      <PageHeader
        title="Upcoming LANs"
        actions={
          adminClans.length > 0 && (
            <Link href={`/clans/${adminClans[0].clan.slug}/lans/new`} className={btnPrimary}>
              <span aria-hidden>+</span> New event
            </Link>
          )
        }
      />

      {upcoming.length === 0 && (
        <EmptyState
          title="No LANs on the list yet"
          action={
            adminClans.length > 0 ? (
              <Link href={`/clans/${adminClans[0].clan.slug}/lans/new`} className={btnPrimary}>
                Add the next LAN
              </Link>
            ) : undefined
          }
        >
          {adminClans.length > 0
            ? "Add the next LAN your clan is going to, and everyone can say if they're coming."
            : "When an orga adds the next LAN your clan is going to, it shows up here."}
        </EmptyState>
      )}

      <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
        {upcoming.map((l) => (
          <LanCard
            key={l.id}
            l={l}
            my={mine.get(l.id)}
            going={going(l.id)}
            now={now}
            info={info(l)}
            clan={clans.length > 1 && l.clanId ? clanById.get(l.clanId) : undefined}
          />
        ))}
      </div>

      {past.length > 0 && (
        <div>
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">Past LANs</h2>
          <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface/50">
            {past.map((l) => (
              <li key={l.id}>
                <Link href={`/lans/${l.id}`} className="flex min-h-12 items-center justify-between gap-3 px-4 py-3 transition hover:bg-raised/60">
                  <span className="truncate">{l.name}</span>
                  <span className="shrink-0 text-sm text-muted">{lanDay(l)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Page>
  );
}

function LanCard({
  l,
  my,
  going,
  now,
  info,
  clan,
}: {
  clan?: { id: string; name: string; avatar: string | null };
  info: { mySeat: string | null; freeSeats: number; hasSeats: boolean; progress: { done: number; total: number } };
  l: Lan;
  my?: typeof attendance.$inferSelect;
  going: number;
  now: Date;
}) {
  const needsAnswer = (!my || my.status === "maybe") && !l.interestCheck && !l.cancelledAt;
  const deadlineSoon = l.signupDeadline && l.signupDeadline > now;
  const unpaid = my && (my.status === "going" || my.status === "waitlist") && !my.paid && !my.ticketBought && l.paymentDueDate;
  return (
    <Link
      href={l.publishedAt ? `/lans/${l.id}` : `/lans/${l.id}/manage`}
      className={`group block rounded-card border bg-surface p-4 transition hover:border-bit/50 active:scale-[0.99] sm:p-5 ${
        l.publishedAt ? "border-line" : "border-dashed border-warn/60"
      } ${l.cancelledAt ? "opacity-60" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {clan && (
            <p className="mb-1 flex items-center gap-1.5 text-xs text-muted">
              <ClanAvatar clan={clan} size={16} /> {clan.name}
            </p>
          )}
          <h3 className="text-lg font-semibold tracking-tight">{l.name}</h3>
          <p className="text-sm text-muted">
            {lanWeekday(l)}
            {!l.dateTbd && <span className="text-faint"> · {relative(l.startsAt, now)}</span>}
          </p>
          {l.location && <p className="truncate text-sm text-muted">{l.location}</p>}
        </div>
        <StatusBadge status={my?.status} seat={info.mySeat} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        {!l.publishedAt && <Pill tone="amber">Draft, only orgas see it</Pill>}
        {l.cancelledAt && <Pill tone="red">Cancelled</Pill>}
        {l.interestCheck && !l.cancelledAt && <Pill tone="emerald">Interest check: would you come?</Pill>}
        <Pill>
          {going}
          {l.capacity ? ` / ${l.capacity}` : ""} going
        </Pill>
        {needsAnswer && deadlineSoon && (
          <Pill tone="amber">Answer by {fmtDay(l.signupDeadline!)} ({relative(l.signupDeadline!, now)})</Pill>
        )}
        {unpaid && <Pill tone="red">Ticket due {fmtDay(l.paymentDueDate!)}</Pill>}
        {info.hasSeats && !l.cancelledAt && (
          <Pill tone={info.freeSeats ? "zinc" : "red"}>{info.freeSeats ? `${info.freeSeats} seats free` : "No seats left"}</Pill>
        )}
        {my && my.status !== "declined" && !l.cancelledAt && (
          <Pill tone={info.progress.done === info.progress.total ? "emerald" : "amber"}>
            Checklist {info.progress.done}/{info.progress.total}
          </Pill>
        )}
      </div>
    </Link>
  );
}

async function NoClan() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center space-y-4 py-10 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/seatbit-mark.svg" alt="" className="h-12 w-12" />
      <h1 className="text-2xl font-bold tracking-tight">Welcome to Seatbit</h1>
      <p className="text-muted">
        Seatbit organises your clan&apos;s trips to LAN parties. Join your clan, or start one, to see its events.
      </p>
      <Link href="/clans" className={btnPrimary}>
        Find or start a clan
      </Link>
    </div>
  );
}
