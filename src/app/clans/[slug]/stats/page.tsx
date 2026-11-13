import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ClanHeader } from "@/components/clan-header";
import { Avatar } from "@/components/avatar";
import { getAvatars, type AvatarData } from "@/lib/avatars";
import { EventTurnoutChart } from "@/components/event-turnout-chart";
import { Card, EmptyState, Page, Pill, StatTile } from "@/components/ui";
import { clanPerms, clanRole, getClanBySlug } from "@/lib/clans";
import { clanStats, pct, type MemberStats } from "@/lib/clan-stats";
import { fmtDay } from "@/lib/format";
import { getDefaultNames } from "@/lib/lans";
import { requireUser } from "@/lib/session";
import { getT } from "@/i18n/server";

export default async function ClanStatsPage({ params }: PageProps<"/clans/[slug]/stats">) {
  const { slug } = await params;
  const me = await requireUser();
  const t = await getT();
  const c = getClanBySlug(slug);
  if (!c) notFound();
  const perms = clanPerms(me, c.id);
  if (!perms.has("stats")) redirect(`/clans/${slug}`);

  const { events, members, totalMembers } = clanStats(c.id);
  const past = events.filter((e) => e.past);
  const upcoming = events.filter((e) => !e.past);
  const sum = (list: typeof events, k: "asked" | "answered" | "going") => list.reduce((n, e) => n + e[k], 0);
  const guests = members.filter((m) => m.isGuest).length;
  const people = getDefaultNames(members.map((m) => m.userId), c.nameDisplay);
  const avatars = getAvatars(members.map((m) => m.userId));
  const label = (m: MemberStats) => people.get(m.userId)?.label ?? m.name;

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
    <Page>
      <ClanHeader clan={c} meId={me.id} role={clanRole(me.id, c.id)} perms={perms} mode="view" tab="stats" />

      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <StatTile
          label={t("stats.members")}
          value={String(totalMembers)}
          sub={guests ? t("stats.guestsNoLogin", { count: guests }) : t("stats.allLogin")}
        />
        <StatTile label={t("stats.events")} value={String(past.length)} sub={t("stats.pastUpcoming", { count: upcoming.length })} />
        <StatTile
          label={t("stats.answerRate")}
          value={pct(sum(past, "answered"), sum(past, "asked"))}
          sub={t("stats.answerRateSub")}
        />
        <StatTile
          label={t("stats.turnout")}
          value={pct(sum(past, "going"), sum(past, "asked"))}
          sub={
            past.length
              ? t("stats.avg", { n: Math.round((sum(past, "going") / past.length) * 10) / 10 })
              : t("stats.noPast")
          }
        />
      </div>

      {events.length === 0 ? (
        <EmptyState icon="calendar" title={t("stats.noEvents")}>
          {t("stats.noEventsHint")}
        </EmptyState>
      ) : (
        <>
          <Card title={t("stats.chartTitle")}>
            <EventTurnoutChart
              t={t}
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

          <Card title={t("stats.detail")}>
            <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              <table className="w-full min-w-[46rem] text-sm tabular-nums">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                    <th className="py-2 pr-3 font-medium">{t("stats.event")}</th>
                    <th className="px-2 py-2 text-right font-medium">{t("stats.asked")}</th>
                    <th className="px-2 py-2 text-right font-medium" title={t("stats.answeredTitle")}>
                      {t("stats.answered")}
                    </th>
                    <th className="px-2 py-2 text-right font-medium">{t("stats.coming")}</th>
                    <th className="px-2 py-2 text-right font-medium">{t("stats.unsure")}</th>
                    <th className="px-2 py-2 text-right font-medium">{t("stats.notComing")}</th>
                    <th className="px-2 py-2 text-right font-medium">{t("stats.noAnswer")}</th>
                    <th className="px-2 py-2 text-right font-medium" title={t("stats.ticketsTitle")}>
                      {t("stats.tickets")}
                    </th>
                    <th className="py-2 pl-2 text-right font-medium">{t("stats.seats")}</th>
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
                            {fmtDay(e.lan.startsAt)} {!e.past && <Pill tone="amber">{t("stats.upcoming")}</Pill>}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-right">{e.asked}</td>
                        <td className="px-2 py-2 text-right">
                          {e.answered} <span className="text-xs text-faint">{pct(e.answered, e.asked)}</span>
                          {e.lan.signupDeadline && (
                            <span className="block text-xs text-faint">{t("stats.onTime", { count: e.answeredOnTime })}</span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-right font-semibold text-bit">
                          {e.going}
                          {e.lan.capacity != null && <span className="font-normal text-faint"> / {e.lan.capacity}</span>}
                          {e.waitlist > 0 && <span className="block text-xs font-normal text-muted">{t("stats.waitlist", { count: e.waitlist })}</span>}
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
                              {e.lan.seatsPublishedAt && <span className="block text-xs text-faint">{t("stats.final")}</span>}
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
            <p className="mt-3 text-xs text-faint">{t("stats.foot")}</p>
          </Card>

          <div className="grid items-start gap-4 sm:gap-6 md:grid-cols-2">
            <Card title={t("stats.mostActive")}>
              <MemberList
                guestLabel={t("clanSettings.guest")}
                slug={c.slug}
                avatars={avatars}
                list={mostActive}
                label={label}
                empty={t("stats.mostActiveEmpty")}
                right={(m) => (
                  <>
                    {t.rich("stats.of", { n: <span className="font-semibold text-fg">{m.attended}</span>, total: m.asked })}
                    <span className="block text-xs text-faint">
                      {m.lastAttended ? t("stats.last", { date: fmtDay(m.lastAttended.startsAt) }) : ""}
                    </span>
                  </>
                )}
              />
            </Card>
            <Card title={t("stats.quiet")}>
              <p className="mb-3 text-sm text-muted">{t("stats.quietHint")}</p>
              <MemberList
                guestLabel={t("clanSettings.guest")}
                slug={c.slug}
                avatars={avatars}
                list={quiet}
                label={label}
                empty={t("stats.quietEmpty")}
                right={(m) => (
                  <>
                    {t.rich("stats.of", { n: <span className="font-semibold text-warn">{m.asked - m.answered}</span>, total: m.asked })}
                  </>
                )}
              />
            </Card>
            <Card title={t("stats.unsureTitle")}>
              <p className="mb-3 text-sm text-muted">{t("stats.unsureHint")}</p>
              <MemberList
                guestLabel={t("clanSettings.guest")}
                slug={c.slug}
                avatars={avatars}
                list={unsure}
                label={label}
                empty={t("stats.unsureEmpty")}
                right={(m) => (
                  <>
                    {t.rich("stats.of", { n: <span className="font-semibold text-fg">{m.stayedUnsure}</span>, total: m.asked })}
                  </>
                )}
              />
            </Card>
            <Card title={`${t("stats.neverCame")} (${neverCame.length})`}>
              <p className="mb-3 text-sm text-muted">{t("stats.neverCameHint")}</p>
              <MemberList
                guestLabel={t("clanSettings.guest")}
                slug={c.slug}
                avatars={avatars}
                list={neverCame.slice(0, 15)}
                label={label}
                empty={t("stats.neverCameEmpty")}
                right={(m) => (
                  <>
                    {t("stats.askedN", { count: m.asked })}
                    {m.upcomingComing > 0 && <span className="block text-xs text-bit">{t("stats.comingNext")}</span>}
                  </>
                )}
              />
              {neverCame.length > 15 && <p className="mt-2 text-xs text-faint">{t("stats.more", { count: neverCame.length - 15 })}</p>}
            </Card>
          </div>
        </>
      )}
    </Page>
  );
}

function MemberList({
  slug,
  list,
  label,
  right,
  empty,
  avatars,
  guestLabel,
}: {
  guestLabel: string;
  avatars: Map<string, AvatarData>;
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
            <span className="flex min-w-0 items-center gap-2">
              <Avatar data={avatars.get(m.userId)} size={24} />
              <span className="truncate">{label(m)}</span>
              {m.isGuest && <Pill>{guestLabel}</Pill>}
            </span>
            <span className="shrink-0 text-right text-muted tabular-nums">{right(m)}</span>
          </Link>
        </li>
      ))}
    </ol>
  );
}
