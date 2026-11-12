import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, gt, inArray, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Lan } from "@/db/schema";
import { leaveClan } from "@/app/clan-actions";
import { Avatar } from "@/components/avatar";
import { ClanHeader, CLAN_VIEW_TABS } from "@/components/clan-header";
import { ClanMemberGrid } from "@/components/clan-member-list";
import { Card, Columns, EmptyState, Notice, Page, Pill, StatusBadge, btnGhost, btnPrimary, btnSecondary } from "@/components/ui";
import { lanDay, lanRange } from "@/lib/format";
import { canManageClan, clanRole, getClanBySlug } from "@/lib/clans";
import { pickNick } from "@/lib/lans";
import { personLabel } from "@/lib/names";
import { avatarData } from "@/lib/avatars";
import { requireUser, visibleLans } from "@/lib/session";
import { missingServers } from "@/lib/discord-invite";
import { guestSuggestions, unclaimedGuests } from "@/lib/guest-claim";

export default async function ClanPage({ params, searchParams }: PageProps<"/clans/[slug]">) {
  const { slug } = await params;
  const sp = await searchParams;
  const me = await requireUser();
  const c = getClanBySlug(slug);
  if (!c) notFound();
  const role = clanRole(me.id, c.id);
  const isMember = role === "admin" || role === "member";
  const canManage = canManageClan(me, c.id);
  const seesEvents = isMember || canManage;
  const tabs: string[] = CLAN_VIEW_TABS.filter((t) => t !== "stats" && (t !== "events" || seesEvents));
  const tab = tabs.includes(sp.tab as string) ? (sp.tab as string) : "overview";

  const memberRows = db
    .select({ u: schema.user, role: schema.clanMember.role })
    .from(schema.clanMember)
    .innerJoin(schema.user, eq(schema.user.id, schema.clanMember.userId))
    .where(eq(schema.clanMember.clanId, c.id))
    .all();
  const pending = memberRows.filter((m) => m.role === "pending").length;
  const nicks = db.select().from(schema.nickname).all();
  const members = memberRows
    .filter((m) => m.role !== "pending")
    .map((m) => ({
      id: m.u.id,
      admin: m.role === "admin",
      guest: m.u.isGuest,
      name: personLabel(m.u, pickNick(nicks.filter((n) => n.userId === m.u.id), { lanId: null, typeId: null }, m.u.name)),
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
  const hasGuests = claiming && tab === "members" && unclaimedGuests(c.id).length > 0;
  const openClaims = canManage
    ? db
        .select({ id: schema.guestClaim.id })
        .from(schema.guestClaim)
        .where(and(eq(schema.guestClaim.clanId, c.id), eq(schema.guestClaim.status, "pending")))
        .all().length
    : 0;

  // Members who aren't on the clan's Discord server(s) yet get an invite.
  const discordInvites = isMember && tab === "overview" ? await missingServers(me.id, c.id) : [];

  const leave = role && (
    <form action={leaveClan.bind(null, c.id)} className="flex justify-end">
      <button className={`${btnGhost} hover:!text-danger`}>{role === "pending" ? "Cancel request" : "Leave clan"}</button>
    </form>
  );

  return (
    <Page>
      <ClanHeader clan={c} role={role} canManage={canManage} mode="view" tab={tab} />

      {canManage && pending + openClaims > 0 && (
        <Notice tone="warn">
          <span className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {[
                pending > 0 && `${pending === 1 ? "1 person wants" : `${pending} people want`} to join ${c.name}.`,
                openClaims > 0 && `${openClaims === 1 ? "1 member says they're" : `${openClaims} members say they're`} one of your guests.`,
              ]
                .filter(Boolean)
                .join(" ")}
            </span>
            <Link href={`/clans/${c.slug}/settings?tab=members`} className="font-semibold underline underline-offset-2">
              Review requests
            </Link>
          </span>
        </Notice>
      )}

      {sp.claimed && tab === "overview" && (
        <Notice>Done: the guest&apos;s events, seats and nicks are yours now.</Notice>
      )}
      {guestMatch && (
        <Notice>
          <span className="flex flex-wrap items-center justify-between gap-2">
            <span>
              The orgas added <span className="font-semibold">{guestMatch.guest.name}</span> as a guest, with the same{" "}
              {guestMatch.match} as you. Is that you?
            </span>
            <Link href={`/clans/${c.slug}/claim`} className="font-semibold text-bit underline underline-offset-2">
              Check
            </Link>
          </span>
        </Notice>
      )}
      {myClaim && !guestMatch && (
        <Notice>
          You asked to take over the guest <span className="font-semibold">{myClaim.guest.name}</span>. An admin will confirm it.
        </Notice>
      )}

      {tab === "overview" && (
        <Columns
          aside={
            <>
              {c.description && (
                <Card title="About">
                  <p className="whitespace-pre-wrap text-sm text-fg/90">{c.description}</p>
                </Card>
              )}
              <Card
                title="Members"
                actions={
                  <Link href={`/clans/${c.slug}?tab=members`} className="text-sm text-bit hover:underline">
                    See all {members.length}
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
              {canManage && (
                <Card title="Admin">
                  <ul className="-mx-2 text-sm">
                    {[
                      { href: `/clans/${c.slug}/settings`, label: "Clan settings", sub: "Name, avatar, who can join" },
                      { href: `/clans/${c.slug}/settings?tab=members`, label: "Members & requests", sub: pending ? `${pending} waiting` : "Roles, add people" },
                      { href: `/clans/${c.slug}/settings?tab=guests`, label: "Guests", sub: "People without a login yet" },
                      { href: `/clans/${c.slug}/settings?tab=types`, label: "LAN types", sub: "Templates for yearly events" },
                      { href: `/clans/${c.slug}/settings?tab=invites`, label: "Invite links", sub: "Let people join right away" },
                      { href: `/clans/${c.slug}/settings?tab=chat`, label: "Discord & WhatsApp", sub: "Bot, channels, invites" },
                    ].map((l) => (
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
                <span className="font-semibold">{c.name} is on Discord.</span>{" "}
                <span className="text-muted">Join the server for LAN news, reminders and to answer right from Discord.</span>
              </p>
              {discordInvites.map((sv) => (
                <a
                  key={sv.guildId}
                  href={sv.inviteUrl!}
                  target="_blank"
                  rel="noreferrer"
                  className={`${btnPrimary} !bg-[#5865F2] !text-white hover:!bg-[#4752c4]`}
                >
                  Join {discordInvites.length > 1 && sv.guildName ? sv.guildName : "our Discord"}
                </a>
              ))}
            </div>
          )}

          {!seesEvents ? (
            <EmptyState icon="users" title={role === "pending" ? "Waiting for approval" : "Members only"}>
              {role === "pending"
                ? "An admin still needs to let you in. You'll see the clan's events once they do."
                : c.joinPolicy === "invite"
                  ? "This clan is invite only. Ask an admin for an invite link."
                  : "Join the clan to see its events and sign up."}
            </EmptyState>
          ) : upcoming.length === 0 ? (
            <EmptyState
              icon="calendar"
              title="Nothing planned yet"
              action={
                canManage && (
                  <Link href={`/clans/${c.slug}/lans/new`} className={btnPrimary}>
                    <span aria-hidden>+</span> New event
                  </Link>
                )
              }
            >
              {canManage ? "Add the next LAN the clan is going to." : "Your admins add the next LAN here."}
            </EmptyState>
          ) : (
            <>
              <NextEvent lan={upcoming[0]} status={mine.get(upcoming[0].id)} going={going(upcoming[0].id)} />
              {upcoming.length > 1 && (
                <Card
                  title="Also coming up"
                  actions={
                    <Link href={`/clans/${c.slug}?tab=events`} className="text-sm text-bit hover:underline">
                      All events
                    </Link>
                  }
                >
                  <EventList lans={upcoming.slice(1, 5)} mine={mine} />
                </Card>
              )}
            </>
          )}
        </Columns>
      )}

      {tab === "events" && (
        <Columns>
          <Card
            title="Upcoming"
            actions={
              canManage && (
                <Link href={`/clans/${c.slug}/lans/new`} className={btnSecondary}>
                  <span aria-hidden>+</span> New event
                </Link>
              )
            }
          >
            {upcoming.length === 0 ? <p className="text-sm text-muted">Nothing planned yet.</p> : <EventList lans={upcoming} mine={mine} />}
          </Card>
          <Card title="Past">
            {past.length === 0 ? <p className="text-sm text-muted">No past events yet.</p> : <EventList lans={past} mine={mine} past />}
          </Card>
        </Columns>
      )}

      {tab === "members" && (
        <Card
          title={`Members (${members.length})`}
          actions={
            canManage && (
              <span className="flex flex-wrap gap-2">
                <Link href={`/clans/${c.slug}/settings?tab=guests`} className={btnGhost}>
                  Guests
                </Link>
                <Link href={`/clans/${c.slug}/settings?tab=members`} className={btnSecondary}>
                  Manage members
                </Link>
              </span>
            )
          }
        >
          <ClanMemberGrid slug={c.slug} members={members} />
          {hasGuests && (
            <p className="mt-4 border-t border-line pt-3 text-sm text-muted">
              Did the orgas add you as a guest before you signed up?{" "}
              <Link href={`/clans/${c.slug}/claim`} className="text-bit hover:underline">
                Take it over
              </Link>
            </p>
          )}
        </Card>
      )}
    </Page>
  );
}

/** The next event as a highlighted card, with the viewer's own answer. */
function NextEvent({ lan: l, status, going }: { lan: Lan; status?: (typeof schema.attendance.$inferSelect)["status"]; going: number }) {
  return (
    <Link
      href={`/lans/${l.id}`}
      className="block rounded-card border border-bit/30 bg-bit-soft/40 p-4 transition hover:border-bit/60 sm:p-5"
    >
      <p className="text-xs font-medium uppercase tracking-wide text-bit">Next event</p>
      <div className="mt-1 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl">
            {l.name}
            {!l.publishedAt && <Pill tone="amber">Draft</Pill>}
            {l.cancelledAt && <Pill tone="red">Cancelled</Pill>}
            {l.interestCheck && !l.cancelledAt && <Pill tone="emerald">Interest check</Pill>}
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            {lanRange(l)}
            {l.location && ` · ${l.location}`}
          </p>
        </div>
        <StatusBadge status={status} />
      </div>
      <p className="mt-3 text-sm text-fg/90">
        {going} {going === 1 ? "person is" : "people are"} coming
        {!status && <span className="text-warn"> · you haven&apos;t answered yet</span>}
      </p>
    </Link>
  );
}

function EventList({ lans, mine, past }: { lans: Lan[]; mine: Map<string, string>; past?: boolean }) {
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
                  {!l.publishedAt && <Pill tone="amber">Draft</Pill>}
                  {l.cancelledAt && <Pill tone="red">Cancelled</Pill>}
                  {l.interestCheck && !l.cancelledAt && <Pill tone="emerald">Interest check</Pill>}
                </span>
                <span className="block truncate text-xs text-muted">
                  {lanDay(l)}
                  {l.location && ` · ${l.location}`}
                </span>
              </span>
              {past ? s === "going" ? <Pill tone="emerald">Attended</Pill> : null : <StatusBadge status={s} />}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
