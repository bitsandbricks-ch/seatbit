import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { ClanAvatar } from "@/components/clan-avatar";
import { EventTurnoutChart } from "@/components/event-turnout-chart";
import { Card, StatTile, EmptyState, Pill } from "@/components/ui";
import { canManageClan, getClanBySlug } from "@/lib/clans";
import { clanStats, pct, type MemberStats } from "@/lib/clan-stats";
import { fmtDay } from "@/lib/format";
import { personLabel } from "@/lib/names";
import { requireUser } from "@/lib/session";

export default async function ClanStatsPage({ params }: PageProps<"/clans/[slug]/stats">) {
  const { slug } = await params;
  const me = await requireUser();
  const c = getClanBySlug(slug);
  if (!c) notFound();
  if (!canManageClan(me, c.id)) redirect(`/clans/${slug}`);

  const { events, members, totalMembers } = clanStats(c.id);
  const past = events.filter((e) => e.past);
  const upcoming = events.filter((e) => !e.past);
  const sum = (list: typeof events, k: "asked" | "answered" | "going") => list.reduce((n, e) => n + e[k], 0);
  const guests = members.filter((m) => m.isGuest).length;
  const defaultNicks = new Map(
    db
      .select({ userId: schema.nickname.userId, nick: schema.nickname.nick })
      .from(schema.nickname)
      .where(and(isNull(schema.nickname.lanId), isNull(schema.nickname.typeId)))
      .all()
      .map((n) => [n.userId, n.nick]),
  );
  const label = (m: MemberStats) => personLabel(m, defaultNicks.get(m.userId));

  const withPast = members.filter((m) => m.asked > 0);
  const mostActive = [...withPast]
    .filter((m) => m.attended > 0)
    .sort((a, b) => b.attended - a.attended || b.attended / b.asked - a.attended / a.asked || label(a).localeCompare(label(b)))
    .slice(0, 10);
  const quiet = [...withPast]
    .filter((m) => m.answered < m.asked)
    .sort((a, b) => b.asked - b.answered - (a.asked - a.answered) || label(a).localeCompare(label(b)))
    .slice(0, 10);
  const neverCame = withPast.filter((m) => m.attended === 0).sort((a, b) => b.asked - a.asked || label(a).localeCompare(label(b)));
  const unsure = withPast.filter((m) => m.stayedUnsure > 0).sort((a, b) => b.stayedUnsure - a.stayedUnsure).slice(0, 10);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-center gap-3">
        <ClanAvatar clan={c} size={48} />
        <div className="min-w-0">
          <Link href={`/clans/${c.slug}`} className="text-sm text-muted hover:text-fg">
            ← {c.name}
          </Link>
          <h1 className="text-2xl font-bold">Clan stats</h1>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <StatTile label="Members" value={String(totalMembers)} sub={guests ? `${guests} guests without login` : "all with login"} />
        <StatTile label="Events" value={String(past.length)} sub={`past · ${upcoming.length} upcoming`} />
        <StatTile
          label="Answer rate"
          value={pct(sum(past, "answered"), sum(past, "asked"))}
          sub="of people asked, past events"
        />
        <StatTile
          label="Turnout"
          value={pct(sum(past, "going"), sum(past, "asked"))}
          sub={past.length ? `avg ${Math.round((sum(past, "going") / past.length) * 10) / 10} per event` : "no past events yet"}
        />
      </div>

      {events.length === 0 ? (
        <EmptyState icon="calendar" title="No events yet">
          Stats show up once the clan has its first event.
        </EmptyState>
      ) : (
        <>
          <Card title="Asked, answered and attended per event">
            <EventTurnoutChart
              points={events.map((e) => ({
                id: e.lan.id,
                name: e.lan.name,
                startsAt: e.lan.startsAt,
                past: e.past,
                asked: e.asked,
                answered: e.answered,
                coming: e.going,
              }))}
            />
          </Card>

          <Card title="Events in detail">
            <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              <table className="w-full min-w-[46rem] text-sm tabular-nums">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                    <th className="py-2 pr-3 font-medium">Event</th>
                    <th className="px-2 py-2 text-right font-medium">Asked</th>
                    <th className="px-2 py-2 text-right font-medium" title="Answered (of them before the answer-by date)">
                      Answered
                    </th>
                    <th className="px-2 py-2 text-right font-medium">Coming</th>
                    <th className="px-2 py-2 text-right font-medium">Unsure</th>
                    <th className="px-2 py-2 text-right font-medium">Not coming</th>
                    <th className="px-2 py-2 text-right font-medium">No answer</th>
                    <th className="px-2 py-2 text-right font-medium" title="Confirmed by an orga / reported by the member">
                      Tickets
                    </th>
                    <th className="py-2 pl-2 text-right font-medium">Seats</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {[...events].reverse().map((e) => {
                    const coming = e.going + e.maybe + e.waitlist;
                    return (
                      <tr key={e.lan.id}>
                        <td className="py-2 pr-3">
                          <Link href={`/lans/${e.lan.id}/manage`} className="font-medium hover:text-bit">
                            {e.lan.name}
                          </Link>
                          <span className="block text-xs text-muted">
                            {fmtDay(e.lan.startsAt)} {!e.past && <Pill tone="amber">upcoming</Pill>}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-right">{e.asked}</td>
                        <td className="px-2 py-2 text-right">
                          {e.answered} <span className="text-xs text-faint">{pct(e.answered, e.asked)}</span>
                          {e.lan.signupDeadline && (
                            <span className="block text-xs text-faint">{e.answeredOnTime} on time</span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-right font-semibold text-bit">
                          {e.going}
                          {e.lan.capacity != null && <span className="font-normal text-faint"> / {e.lan.capacity}</span>}
                          {e.waitlist > 0 && <span className="block text-xs font-normal text-muted">+{e.waitlist} waitlist</span>}
                        </td>
                        <td className="px-2 py-2 text-right">{e.maybe || "–"}</td>
                        <td className="px-2 py-2 text-right">{e.declined || "–"}</td>
                        <td className={`px-2 py-2 text-right ${e.noAnswer ? "text-warn" : ""}`}>{e.noAnswer || "–"}</td>
                        <td className="px-2 py-2 text-right">
                          {coming ? (
                            <>
                              {e.ticketConfirmed} <span className="text-faint">/ {e.ticketReported}</span>
                            </>
                          ) : (
                            "–"
                          )}
                        </td>
                        <td className="py-2 pl-2 text-right">
                          {e.seats ? (
                            <>
                              {e.seatsAssigned} <span className="text-faint">/ {e.seats}</span>
                              {e.lan.seatsPublishedAt && <span className="block text-xs text-faint">published</span>}
                            </>
                          ) : (
                            "–"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-faint">
              Asked = everyone in the clan when the event started, plus anyone who answered. People who left the clan
              since aren&apos;t counted. Tickets: confirmed by an orga / reported by the member. Seats: assigned / the
              group&apos;s seats.
            </p>
          </Card>

          <div className="grid items-start gap-6 md:grid-cols-2">
            <Card title="Most active">
              <MemberList
                slug={c.slug}
                list={mostActive}
                label={label}
                empty="Nobody has come to a past event yet."
                right={(m) => (
                  <>
                    <span className="font-semibold text-fg">{m.attended}</span> of {m.asked}
                    <span className="block text-xs text-faint">
                      {m.lastAttended ? `last ${fmtDay(m.lastAttended.startsAt)}` : ""}
                    </span>
                  </>
                )}
              />
            </Card>
            <Card title="Often no answer">
              <p className="mb-3 text-sm text-muted">Past events these members never answered for.</p>
              <MemberList
                slug={c.slug}
                list={quiet}
                label={label}
                empty="Everyone answered every time."
                right={(m) => (
                  <>
                    <span className="font-semibold text-warn">{m.asked - m.answered}</span> of {m.asked}
                  </>
                )}
              />
            </Card>
            <Card title="Left it at unsure">
              <p className="mb-3 text-sm text-muted">Past events where the answer stayed &ldquo;unsure&rdquo;.</p>
              <MemberList
                slug={c.slug}
                list={unsure}
                label={label}
                empty="No open “unsure” answers at past events."
                right={(m) => (
                  <>
                    <span className="font-semibold text-fg">{m.stayedUnsure}</span> of {m.asked}
                  </>
                )}
              />
            </Card>
            <Card title={`Not at a LAN yet (${neverCame.length})`}>
              <p className="mb-3 text-sm text-muted">Members who haven&apos;t come to any past event since joining.</p>
              <MemberList
                slug={c.slug}
                list={neverCame.slice(0, 15)}
                label={label}
                empty="Everyone has been to at least one LAN."
                right={(m) => (
                  <>
                    {m.asked} asked{m.upcomingComing > 0 && <span className="block text-xs text-bit">coming next time</span>}
                  </>
                )}
              />
              {neverCame.length > 15 && <p className="mt-2 text-xs text-faint">and {neverCame.length - 15} more</p>}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function MemberList({
  slug,
  list,
  label,
  right,
  empty,
}: {
  slug: string;
  list: MemberStats[];
  label: (m: MemberStats) => string;
  right: (m: MemberStats) => React.ReactNode;
  empty: string;
}) {
  if (list.length === 0) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ol className="space-y-1">
      {list.map((m) => (
        <li key={m.userId}>
          <Link
            href={`/clans/${slug}/members/${m.userId}`}
            className="-mx-2 flex min-h-11 items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm transition hover:bg-raised"
          >
            <span className="min-w-0 truncate">
              {label(m)} {m.isGuest && <Pill>guest</Pill>}
            </span>
            <span className="shrink-0 text-right text-muted tabular-nums">{right(m)}</span>
          </Link>
        </li>
      ))}
    </ol>
  );
}
