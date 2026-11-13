import Link from "next/link";
import { ReportButton } from "@/components/report-button";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, gt, inArray, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Lan } from "@/db/schema";
import { leaveClan } from "@/app/clan-actions";
import { Avatar } from "@/components/avatar";
import { ClanHeader, CLAN_VIEW_TABS, showsPaymentsTab } from "@/components/clan-header";
import { MyPayments } from "@/components/clan-payments";
import { memberLines, owedSummary, paymentsAvailable } from "@/lib/payments";
import { ClanMemberGrid } from "@/components/clan-member-list";
import { Card, Columns, EmptyState, Notice, Page, Pill, StatusBadge, btnGhost, btnPrimary, btnSecondary } from "@/components/ui";
import { lanDay, lanRange } from "@/lib/format";
import { clanPerms, clanRole, getClanBySlug } from "@/lib/clans";
import { MANAGE_TAB_PERMS, isMemberRole } from "@/lib/clan-roles";
import { pickNick } from "@/lib/lans";
import { personLabel } from "@/lib/names";
import { avatarData } from "@/lib/avatars";
import { requireUser, visibleLans } from "@/lib/session";
import { missingServers } from "@/lib/discord-invite";
import { claimableGuests, guestSuggestions } from "@/lib/guest-claim";
import { getT } from "@/i18n/server";
import type { T } from "@/i18n/translate";
import { ActionForm } from "@/components/action-form";

export default async function ClanPage({ params, searchParams }: PageProps<"/clans/[slug]">) {
  const { slug } = await params;
  const sp = await searchParams;
  const me = await requireUser();
  const t = await getT();
  const c = getClanBySlug(slug);
  if (!c) notFound();
  const role = clanRole(me.id, c.id);
  const isMember = isMemberRole(role);
  const perms = clanPerms(me, c.id);
  const canEvents = perms.has("events");
  const canMembers = perms.has("members");
  const seesEvents = isMember || canEvents;
  const hasPayments = showsPaymentsTab(c, me.id, perms);
  const tabs: string[] = CLAN_VIEW_TABS.filter((x) => x !== "stats" && (x !== "events" || seesEvents) && (x !== "payments" || hasPayments));
  const tab = tabs.includes(sp.tab as string) ? (sp.tab as string) : "overview";

  const memberRows = db
    .select({ u: schema.user, role: schema.clanMember.role })
    .from(schema.clanMember)
    .innerJoin(schema.user, eq(schema.user.id, schema.clanMember.userId))
    .where(eq(schema.clanMember.clanId, c.id))
    .all();
  const pending = memberRows.filter((m) => m.role === "pending").length;
  const nicks = memberRows.length
    ? db.select().from(schema.nickname).where(inArray(schema.nickname.userId, memberRows.map((m) => m.u.id))).all()
    : [];
  const members = memberRows
    .filter((m) => m.role !== "pending")
    .map((m) => ({
      id: m.u.id,
      role: isMemberRole(m.role) ? m.role : ("member" as const),
      guest: m.u.isGuest,
      name: personLabel(m.u, pickNick(nicks.filter((n) => n.userId === m.u.id), { lanId: null, typeId: null }, m.u.name), c.nameDisplay),
      avatar: avatarData(m.u),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const now = new Date();
  const upcoming = seesEvents
    ? visibleLans(
        me,
        db
        .select()
        .from(schema.lan)
        .where(and(eq(schema.lan.clanId, c.id), gt(schema.lan.endsAt, now)))
        .orderBy(asc(schema.lan.startsAt))
          .all(),
      )
    : [];
  const past =
    seesEvents && tab === "events"
      ? visibleLans(
          me,
          db
            .select()
            .from(schema.lan)
            .where(and(eq(schema.lan.clanId, c.id), lte(schema.lan.endsAt, now)))
            .orderBy(desc(schema.lan.startsAt))
            .all(),
        )
      : [];
  const mine = new Map(
    upcoming.length + past.length
      ? db
          .select()
          .from(schema.attendance)
          .where(
            and(
              eq(schema.attendance.userId, me.id),
              inArray(
                schema.attendance.lanId,
                [...upcoming, ...past].map((l) => l.id),
              ),
            ),
          )
          .all()
          .map((a) => [a.lanId, a.status])
      : [],
  );
  const going = (lanId: string) =>
    db
      .select({ id: schema.attendance.id })
      .from(schema.attendance)
      .where(and(eq(schema.attendance.lanId, lanId), eq(schema.attendance.status, "going")))
      .all().length;

  // Guests that look like the viewer, and their own open request to take one over.
  const claiming = isMember && !me.isGuest && c.guestClaims !== "off";
  const mySuggestions = claiming && tab === "overview" ? guestSuggestions(c.id, me.id) : [];
  const guestMatch = mySuggestions.find((s) => s.match && !s.status);
  const myClaim = mySuggestions.find((s) => s.status === "pending");
  const hasGuests = claiming && tab === "members" && claimableGuests(c.id, me.id).length > 0;
  const openClaims = canMembers
    ? db
        .select({ id: schema.guestClaim.id })
        .from(schema.guestClaim)
        .where(and(eq(schema.guestClaim.clanId, c.id), eq(schema.guestClaim.status, "pending")))
        .all().length
    : 0;

  const myLines = hasPayments && (tab === "overview" || tab === "payments") ? memberLines(me.id, { clanId: c.id }) : [];
  const owed = owedSummary(myLines);

  // Members who aren't on the clan's Discord server(s) yet get an invite.
  const discordInvites = isMember && tab === "overview" ? await missingServers(me.id, c.id) : [];

  const adminLinks = (
    [
      { tab: "general", label: t("clanPage.links.general"), sub: t("clanPage.links.generalSub") },
      {
        tab: "members",
        label: t("clanPage.links.members"),
        sub: pending ? t("clanPage.links.waiting", { count: pending }) : t(perms.has("roles") ? "clanPage.links.membersRoles" : "clanPage.links.membersAdd"),
      },
      { tab: "guests", label: t("clanPage.links.guests"), sub: t("clanPage.links.guestsSub") },
      { tab: "types", label: t("clanPage.links.types"), sub: t("clanPage.links.typesSub") },
      { tab: "invites", label: t("clanPage.links.invites"), sub: t("clanPage.links.invitesSub") },
      { tab: "chat", label: t("manage.tabs.chat"), sub: t("clanPage.links.chatSub") },
      { tab: "payments", label: t("payments.title"), sub: t("clanPage.links.paymentsSub") },
    ] as const
  )
    .filter((l) => perms.has(MANAGE_TAB_PERMS[l.tab]) && (l.tab !== "payments" || paymentsAvailable()))
    .map((l) => ({ ...l, href: l.tab === "general" ? `/clans/${c.slug}/settings` : `/clans/${c.slug}/settings?tab=${l.tab}` }));

  const leave = role && (
    <ActionForm action={leaveClan.bind(null, c.id)} className="flex justify-end" done={false}>
      <button className={`${btnGhost} hover:!text-danger`}>{role === "pending" ? t("clanPage.cancelRequest") : t("clanPage.leave")}</button>
    </ActionForm>
  );

  return (
    <Page>
      <ClanHeader clan={c} meId={me.id} role={role} perms={perms} mode="view" tab={tab} />

      {canMembers && pending + openClaims > 0 && (
        <Notice tone="warn">
          <span className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {[
                pending > 0 && t("clanPage.wantToJoin", { count: pending, clan: c.name }),
                openClaims > 0 && t("clanPage.openClaims", { count: openClaims }),
              ]
                .filter(Boolean)
                .join(" ")}
            </span>
            <Link href={`/clans/${c.slug}/settings?tab=members`} className="font-semibold underline underline-offset-2">
              {t("clanPage.review")}
            </Link>
          </span>
        </Notice>
      )}

      {tab === "overview" && owed.count > 0 && (
        <Notice tone="warn">
          <span className="flex flex-wrap items-center justify-between gap-2">
            <span>{t("payments.youOwe", { amount: owed.text, count: owed.count })}</span>
            <Link href={`/clans/${c.slug}?tab=payments`} className="font-semibold underline underline-offset-2">
              {t("payments.seePayments")}
            </Link>
          </span>
        </Notice>
      )}

      {sp.claimed && tab === "overview" && (
        <Notice>{t("clanPage.claimedDone")}</Notice>
      )}
      {guestMatch && (
        <Notice>
          <span className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {t.rich(guestMatch.match === "nick" ? "clanPage.guestMatchNick" : "clanPage.guestMatchName", {
                guest: <span className="font-semibold">{guestMatch.guest.name}</span>,
              })}
            </span>
            <Link href={`/clans/${c.slug}/claim`} className="font-semibold text-bit underline underline-offset-2">
              {t("clanPage.check")}
            </Link>
          </span>
        </Notice>
      )}
      {myClaim && !guestMatch && (
        <Notice>
          {t.rich("clanPage.myClaim", { guest: <span className="font-semibold">{myClaim.guest.name}</span> })}
        </Notice>
      )}

      {tab === "overview" && (
        <Columns
          aside={
            <>
              {c.description && (
                <Card title={t("clanPage.about")}>
                  <p className="whitespace-pre-wrap text-sm text-fg/90">{c.description}</p>
                </Card>
              )}
              <Card
                title={t("clanPage.members")}
                actions={
                  <Link href={`/clans/${c.slug}?tab=members`} className="text-sm text-bit hover:underline">
                    {t("clanPage.seeAll", { count: members.length })}
                  </Link>
                }
              >
                <ul className="flex flex-wrap gap-1.5">
                  {members.slice(0, 18).map((m) => (
                    <li key={m.id}>
                      <Link href={`/clans/${c.slug}/members/${m.id}`} title={m.name} className="block rounded-full transition hover:opacity-80">
                        <Avatar data={m.avatar} size={36} />
                      </Link>
                    </li>
                  ))}
                  {members.length > 18 && (
                    <li>
                      <Link
                        href={`/clans/${c.slug}?tab=members`}
                        className="grid h-9 w-9 place-items-center rounded-full bg-raised text-xs font-medium text-muted hover:text-fg"
                      >
                        +{members.length - 18}
                      </Link>
                    </li>
                  )}
                </ul>
              </Card>
              {adminLinks.length > 0 && (
                <Card title={perms.has("settings") ? t("nav.admin") : t("common.manage")}>
                  <ul className="-mx-2 text-sm">
                    {adminLinks.map((l) => (
                      <li key={l.href}>
                        <Link href={l.href} className="flex min-h-11 items-center justify-between gap-2 rounded-md px-2 py-1.5 transition hover:bg-raised">
                          <span className="min-w-0">
                            <span className="block font-medium">{l.label}</span>
                            <span className="block truncate text-xs text-muted">{l.sub}</span>
                          </span>
                          <span aria-hidden className="text-faint">
                            ›
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
              {leave}
            </>
          }
        >
          {discordInvites.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-card border border-[#5865F2]/40 bg-[#5865F2]/10 p-4">
              <p className="min-w-0 flex-1 text-sm">
                <span className="font-semibold">{t("clanPage.onDiscord", { clan: c.name })}</span>{" "}
                <span className="text-muted">{t("clanPage.onDiscordText")}</span>
              </p>
              {discordInvites.map((sv) => (
                <a
                  key={sv.guildId}
                  href={sv.inviteUrl!}
                  target="_blank"
                  rel="noreferrer"
                  className={`${btnPrimary} !bg-[#5865F2] !text-white hover:!bg-[#4752c4]`}
                >
                  {discordInvites.length > 1 && sv.guildName ? t("clanPage.joinServer", { name: sv.guildName }) : t("clanPage.joinDiscord")}
                </a>
              ))}
            </div>
          )}

          {!seesEvents ? (
            <EmptyState icon="users" title={t(role === "pending" ? "clanPage.waitingApproval" : "clanPage.membersOnly")}>
              {t(
                role === "pending"
                  ? "clanPage.waitingApprovalText"
                  : c.joinPolicy === "invite"
                    ? "clanPage.inviteOnlyText"
                    : "clanPage.joinToSee",
              )}
            </EmptyState>
          ) : upcoming.length === 0 ? (
            <EmptyState
              icon="calendar"
              title={t("clanPage.nothingPlanned")}
              action={
                canEvents && (
                  <Link href={`/clans/${c.slug}/lans/new`} className={btnPrimary}>
                    <span aria-hidden>+</span> {t("home.newEvent")}
                  </Link>
                )
              }
            >
              {t(canEvents ? "clanPage.addNext" : "clanPage.adminsAdd")}
            </EmptyState>
          ) : (
            <>
              <NextEvent t={t} lan={upcoming[0]} status={mine.get(upcoming[0].id)} going={going(upcoming[0].id)} />
              {upcoming.length > 1 && (
                <Card
                  title={t("clanPage.alsoComing")}
                  actions={
                    <Link href={`/clans/${c.slug}?tab=events`} className="text-sm text-bit hover:underline">
                      {t("clanPage.allEvents")}
                    </Link>
                  }
                >
                  <EventList t={t} lans={upcoming.slice(1, 5)} mine={mine} />
                </Card>
              )}
            </>
          )}
        </Columns>
      )}

      {tab === "events" && (
        <Columns>
          <Card
            title={t("clanPage.upcoming")}
            actions={
              canEvents && (
                <Link href={`/clans/${c.slug}/lans/new`} className={btnSecondary}>
                  <span aria-hidden>+</span> {t("home.newEvent")}
                </Link>
              )
            }
          >
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted">{t("clanPage.nothingPlanned")}.</p>
            ) : (
              <EventList t={t} lans={upcoming} mine={mine} />
            )}
          </Card>
          <Card title={t("clanPage.past")}>
            {past.length === 0 ? <p className="text-sm text-muted">{t("clanPage.noPast")}</p> : <EventList t={t} lans={past} mine={mine} past />}
          </Card>
        </Columns>
      )}

      {tab === "payments" && <MyPayments t={t} clan={c} lines={myLines} status={typeof sp.paid === "string" ? sp.paid : undefined} />}

      {tab === "members" && (
        <Card
          title={`${t("clanPage.members")} (${members.length})`}
          actions={
            canMembers && (
              <span className="flex flex-wrap gap-2">
                <Link href={`/clans/${c.slug}/settings?tab=guests`} className={btnGhost}>
                  {t("clanPage.links.guests")}
                </Link>
                <Link href={`/clans/${c.slug}/settings?tab=members`} className={btnSecondary}>
                  {t("clanPage.manageMembers")}
                </Link>
              </span>
            )
          }
        >
          <ClanMemberGrid slug={c.slug} members={members} />
          {hasGuests && (
            <p className="mt-4 border-t border-line pt-3 text-sm text-muted">
              {t("clanPage.wereYouGuest")}{" "}
              <Link href={`/clans/${c.slug}/claim`} className="text-bit hover:underline">
                {t("clanPage.takeOver")}
              </Link>
            </p>
          )}
        </Card>
      )}
      {!perms.has("settings") && <ReportButton clanId={c.id} />}
    </Page>
  );
}

/** The next event as a highlighted card, with the viewer's own answer. */
function NextEvent({
  t,
  lan: l,
  status,
  going,
}: {
  t: T;
  lan: Lan;
  status?: (typeof schema.attendance.$inferSelect)["status"];
  going: number;
}) {
  return (
    <Link
      href={`/lans/${l.id}`}
      className="block rounded-card border border-bit/30 bg-bit-soft/40 p-4 transition hover:border-bit/60 sm:p-5"
    >
      <p className="text-xs font-medium uppercase tracking-wide text-bit">{t("clanPage.nextEvent")}</p>
      <div className="mt-1 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl">
            {l.name}
            {!l.publishedAt && <Pill tone="amber">{t("eventUi.draft")}</Pill>}
            {l.cancelledAt && <Pill tone="red">{t("eventUi.cancelled")}</Pill>}
            {l.interestCheck && !l.cancelledAt && <Pill tone="emerald">{t("eventUi.interestCheck")}</Pill>}
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            {lanRange(l, t.locale)}
            {l.location && ` · ${l.location}`}
          </p>
        </div>
        <StatusBadge status={status} />
      </div>
      <p className="mt-3 text-sm text-fg/90">
        {t("clanPage.peopleComing", { count: going })}
        {!status && <span className="text-warn"> · {t("clanPage.notAnswered")}</span>}
      </p>
    </Link>
  );
}

function EventList({ t, lans, mine, past }: { t: T; lans: Lan[]; mine: Map<string, string>; past?: boolean }) {
  return (
    <ul className="divide-y divide-line">
      {lans.map((l) => {
        const s = mine.get(l.id) as Parameters<typeof StatusBadge>[0]["status"];
        return (
          <li key={l.id}>
            <Link href={`/lans/${l.id}`} className="-mx-2 flex min-h-14 items-center justify-between gap-3 rounded-md p-2 transition hover:bg-raised">
              <span className="min-w-0">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium">{l.name}</span>
                  {!l.publishedAt && <Pill tone="amber">{t("eventUi.draft")}</Pill>}
                  {l.cancelledAt && <Pill tone="red">{t("eventUi.cancelled")}</Pill>}
                  {l.interestCheck && !l.cancelledAt && <Pill tone="emerald">{t("eventUi.interestCheck")}</Pill>}
                </span>
                <span className="block truncate text-xs text-muted">
                  {lanDay(l, t.locale)}
                  {l.location && ` · ${l.location}`}
                </span>
              </span>
              {past ? s === "going" ? <Pill tone="emerald">{t("clanPage.attended")}</Pill> : null : <StatusBadge status={s} />}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
