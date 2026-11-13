import { DonorBadge } from "@/components/support-card";
import { isDonor } from "@/lib/donations";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Attendance, Lan } from "@/db/schema";
import { CopyField } from "@/components/copy-field";
import { MemberAdminActions } from "@/components/member-admin-actions";
import { GuestEditForm } from "@/components/guest-form";
import { resendGuestDiscordDm, unlinkGuestDiscord, updateGuest } from "@/app/clan-actions";
import { GuestDiscordLink } from "@/components/guest-discord";
import { guestDiscordLines } from "@/lib/guest-claim";
import { Card, Page, PageHeader, Pill, StatTile, StatusBadge, Verified, columns, stack } from "@/components/ui";
import { clanPerms, getClanBySlug, isClanMember } from "@/lib/clans";
import { isMemberRole } from "@/lib/clan-roles";
import { RolePill } from "@/components/role-pill";
import { fmtDate, fmtWeekday, lanWeekday } from "@/lib/format";
import { pickNick } from "@/lib/lans";
import { personLabel } from "@/lib/names";
import { appUrl } from "@/lib/mail";
import { Avatar } from "@/components/avatar";
import { avatarData } from "@/lib/avatars";
import { pct } from "@/lib/clan-stats";
import { isLanManager, requireUser, visibleLans } from "@/lib/session";
import { platformCan } from "@/lib/platform-roles";
import { profileLink } from "@/lib/profile-link";
import { SocialList } from "@/components/social-list";
import { getT } from "@/i18n/server";
import type { T } from "@/i18n/translate";

export default async function MemberProfilePage({ params }: PageProps<"/clans/[slug]/members/[userId]">) {
  const { slug, userId } = await params;
  const me = await requireUser();
  const t = await getT();
  const c = getClanBySlug(slug);
  if (!c) notFound();
  if (!isClanMember(me.id, c.id) && !platformCan(me, "view")) notFound();
  const membership = db
    .select()
    .from(schema.clanMember)
    .where(and(eq(schema.clanMember.clanId, c.id), eq(schema.clanMember.userId, userId)))
    .get();
  if (!membership || membership.role === "pending") notFound();
  const u = db.select().from(schema.user).where(eq(schema.user.id, userId)).get();
  if (!u) notFound();

  const isSelf = me.id === u.id;
  const perms = clanPerms(me, c.id);
  // Admins and recruiters look after members and guests.
  const isManager = perms.has("members");
  // Private bits (email, LAN IDs, tickets): clan admins, recruiters and the person themselves.
  const seesPrivate = isManager || isSelf;
  const now = new Date();

  const nicks = db.select().from(schema.nickname).where(eq(schema.nickname.userId, u.id)).all();
  const defaultNick = pickNick(nicks, { lanId: null, typeId: null }, "");
  const types = db
    .select()
    .from(schema.lanType)
    .where(eq(schema.lanType.clanId, c.id))
    .orderBy(asc(schema.lanType.name))
    .all();
  // IDs are private, except where the LAN type links them to a profile on the event's site.
  const lanAccounts = db.select().from(schema.lanAccount).where(eq(schema.lanAccount.userId, u.id)).all();
  const typeRows = types
    .map((ty) => {
      const value = lanAccounts.find((a) => a.typeId === ty.id && !a.lanId)?.value;
      return {
        type: ty,
        nick: nicks.find((n) => n.typeId === ty.id && n.isPrimary)?.nick ?? nicks.find((n) => n.typeId === ty.id)?.nick,
        lanId: seesPrivate ? value : undefined,
        profile: profileLink(ty.profileUrl, value),
      };
    })
    .filter((r) => r.nick || r.lanId || r.profile);

  const lans = visibleLans(
    me,
    db.select().from(schema.lan).where(eq(schema.lan.clanId, c.id)).orderBy(asc(schema.lan.startsAt)).all(),
  );
  const rows = db.select().from(schema.attendance).where(eq(schema.attendance.userId, u.id)).all();
  const seats = db.select().from(schema.seat).where(eq(schema.seat.userId, u.id)).all();
  // Events they were asked for: those after they joined, plus any they answered.
  const theirs = lans.filter((l) => l.startsAt >= membership.createdAt || rows.some((r) => r.lanId === l.id));
  const events = theirs.map((l) => {
    const a = rows.find((r) => r.lanId === l.id) ?? null;
    const s = seats.find((x) => x.lanId === l.id);
    const seatVisible = !!s && (!!l.seatsPublishedAt || isSelf || isManager || isLanManager(me, l.id));
    return {
      lan: l,
      a,
      seat: seatVisible ? s!.label : null,
      nick: pickNick(nicks, { lanId: l.id, typeId: l.typeId }, u.name),
      typeName: types.find((ty) => ty.id === l.typeId)?.name,
    };
  });
  const upcoming = events.filter((e) => e.lan.endsAt >= now);
  const past = events.filter((e) => e.lan.endsAt < now).reverse();
  const attended = past.filter((e) => e.a?.status === "going").length;
  const answeredPast = past.filter((e) => e.a).length;

  const admins = db
    .select()
    .from(schema.clanMember)
    .where(and(eq(schema.clanMember.clanId, c.id), eq(schema.clanMember.role, "admin")))
    .all().length;
  const discord = db
    .select()
    .from(schema.account)
    .where(and(eq(schema.account.userId, u.id), eq(schema.account.providerId, "discord")))
    .get();
  const role = isMemberRole(membership.role) ? membership.role : "member";
  const avatar = avatarData(u);
  const shownName = personLabel(u, defaultNick, c.nameDisplay);
  const fullName = personLabel(u, defaultNick);

  return (
    <Page>
      <PageHeader
        back={{ href: `/clans/${c.slug}?tab=members`, label: c.name }}
        avatar={<Avatar data={avatar} size={56} />}
        title={
          <span className="inline-flex max-w-full items-center gap-2">
            <span className="truncate">{shownName}</span>
            {!u.isGuest && <Verified size={20} />}
          </span>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <RolePill role={role} />
            {/* Managers and the member themself also see the full name the clan's display leaves out. */}
            {seesPrivate && fullName !== shownName && <span>{fullName}</span>}
            {u.isGuest && <Pill>{t("member.guestNoLogin")}</Pill>}
            {!u.isGuest && isDonor(u.id) && <DonorBadge label={t("donate.badgeLabel")} title={t("donate.badgePerson")} />}
            <span>{t("member.since", { date: fmtWeekday(membership.createdAt, t.locale) })}</span>
          </span>
        }
      />

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <StatTile
          label={t("member.attended")}
          value={String(attended)}
          sub={past.length ? t("member.ofPast", { count: past.length }) : t("member.noPast")}
        />
        <StatTile label={t("stats.answered")} value={pct(answeredPast, past.length)} sub={t("member.ofPastEvents")} />
        <StatTile
          label={t("member.comingNext")}
          value={String(upcoming.filter((e) => e.a?.status === "going").length)}
          sub={t("member.ofUpcoming", { count: upcoming.length })}
        />
      </div>

      <div className={columns}>
        <div className={`min-w-0 ${stack}`}>
          <Card title={t("member.upcoming")}>
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted">{t("member.nothingPlanned")}</p>
            ) : (
              <EventList t={t} events={upcoming} showTicket={seesPrivate} />
            )}
          </Card>
          <Card title={t("member.past")}>
            {past.length === 0 ? (
              <p className="text-sm text-muted">{t("member.noPastSince")}</p>
            ) : (
              <EventList t={t} events={past} showTicket={seesPrivate} past />
            )}
          </Card>
        </div>

        <div className={`min-w-0 ${stack}`}>
          {u.isGuest && isManager && (
            <Card title={t("member.editGuest")}>
              <p className="mb-3 text-sm text-muted">{t("member.editGuestHint", { name: u.firstName || u.name })}</p>
              <GuestEditForm
                action={updateGuest.bind(null, c.id, u.id)}
                guest={{ firstName: u.firstName, lastName: u.lastName, nick: defaultNick, email: u.inviteEmail ?? "" }}
                types={types.map((ty) => ({
                  id: ty.id,
                  name: ty.name,
                  nick: nicks.find((n) => n.typeId === ty.id && !n.lanId)?.nick ?? "",
                  lanId: lanAccounts.find((a) => a.typeId === ty.id && !a.lanId)?.value ?? "",
                }))}
              />
            </Card>
          )}
          <Card title={t("member.nicks")}>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">{t("member.default")}</dt>
                <dd className="truncate font-medium">{defaultNick || "—"}</dd>
              </div>
              {typeRows.map((r) => (
                <div key={r.type.id} className="flex justify-between gap-3">
                  <dt className="text-muted">{r.type.name}</dt>
                  <dd className="min-w-0 text-right">
                    <span className="block truncate font-medium">{r.nick ?? defaultNick ?? "—"}</span>
                    {r.profile ? (
                      <a href={r.profile} target="_blank" rel="noreferrer" className="block truncate text-xs text-bit hover:underline">
                        {r.lanId ? `ID ${r.lanId}` : t("member.profile")} ↗
                      </a>
                    ) : (
                      r.lanId && <span className="block truncate text-xs text-faint">ID {r.lanId}</span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
            {seesPrivate && typeRows.some((r) => r.lanId) && (
              <p className="mt-3 text-xs text-faint">{t(isSelf ? "member.idsPrivateSelf" : "member.idsPrivate")}</p>
            )}
          </Card>

          <Card title={t("member.socials")}>
            <SocialList socials={u.socials ?? {}} discordId={discord?.accountId} />
          </Card>

          {seesPrivate && (
            <Card title={t("member.contact")}>
              <dl className="space-y-2 text-sm">
                {u.isGuest ? (
                  <>
                    <Row label={t("member.email")}>{u.inviteEmail ?? t("member.notKnown")}</Row>
                    <Row label={t("member.invite")}>
                      {u.invitedAt
                        ? t("member.mailed", { date: fmtDate(u.invitedAt, t.locale) })
                        : t(u.inviteEmail ? "member.notSent" : "member.noEmailLink")}
                    </Row>
                  </>
                ) : (
                  <>
                    <Row label={t("member.email")}>
                      <a href={`mailto:${u.email}`} className="text-bit hover:underline">
                        {u.email}
                      </a>
                    </Row>
                    {isManager && <Row label="Discord">{t(discord ? "clanSettings.linked" : "member.notLinked")}</Row>}
                  </>
                )}
              </dl>
              {u.isGuest && isManager && (
                <div className="mt-3 space-y-1 border-t border-line pt-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted">Discord</p>
                  <GuestDiscordLink
                    linked={!!u.guestDiscordId}
                    lines={guestDiscordLines(u, t)}
                    resend={resendGuestDiscordDm.bind(null, c.id, u.id)}
                    unlink={unlinkGuestDiscord.bind(null, c.id, u.id)}
                  />
                </div>
              )}
              {u.isGuest && isManager && u.claimCode && (
                <div className="mt-3 space-y-1">
                  <p className="text-xs text-muted">{t("member.claimLink")}</p>
                  <CopyField value={`${appUrl}/claim/${u.claimCode}`} />
                </div>
              )}
              <p className="mt-3 text-xs text-faint">{t(isSelf && !isManager ? "member.onlyManagersYou" : "member.onlyManagers")}</p>
            </Card>
          )}

          {isManager && (
            <Card title={t("member.clanRole")}>
              <MemberAdminActions
                clanId={c.id}
                slug={c.slug}
                userId={u.id}
                name={u.name}
                role={role}
                canSetRoles={perms.has("roles")}
                isGuest={u.isGuest}
                isSelf={isSelf}
                lastAdmin={role === "admin" && admins <= 1}
              />
            </Card>
          )}
        </div>
      </div>
    </Page>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right">{children}</dd>
    </div>
  );
}

function EventList({
  t,
  events,
  showTicket,
  past,
}: {
  t: T;
  events: { lan: Lan; a: Attendance | null; seat: string | null; nick: string; typeName?: string }[];
  showTicket: boolean;
  past?: boolean;
}) {
  return (
    <ul className="divide-y divide-line">
      {events.map(({ lan: l, a, seat, nick, typeName }) => (
        <li key={l.id}>
          <Link href={`/lans/${l.id}`} className="-mx-2 flex min-h-14 items-center justify-between gap-3 rounded-md p-2 transition hover:bg-raised">
            <span className="min-w-0">
              <span className="block truncate font-medium">{l.name}</span>
              <span className="block truncate text-xs text-muted">
                {lanWeekday(l, t.locale)}
                {typeName && ` · ${typeName}`}
                {a?.status === "going" && ` · ${t("member.asNick", { nick })}`}
              </span>
            </span>
            <span className="flex shrink-0 flex-wrap justify-end gap-1">
              {past && a?.status === "going" ? (
                <Pill tone="emerald">{seat ? `${t("clanPage.attended")} · ${seat}` : t("clanPage.attended")}</Pill>
              ) : past && !a ? (
                <Pill>{t("stats.noAnswer")}</Pill>
              ) : (
                <StatusBadge status={a?.status} seat={seat} />
              )}
              {showTicket &&
                !past &&
                a &&
                a.status !== "declined" &&
                (a.paid ? (
                  <Pill tone="emerald">{t("event.ticketOk")}</Pill>
                ) : a.ticketBought ? (
                  <Pill tone="amber">{t("event.reported")}</Pill>
                ) : (
                  <Pill tone="red">{t("event.noTicket")}</Pill>
                ))}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
