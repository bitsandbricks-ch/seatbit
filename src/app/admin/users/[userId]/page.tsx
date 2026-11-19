import Link from "next/link";
import { MemberBadges } from "@/components/member-badges";
import { memberBadges } from "@/lib/member-badges";
import { notFound } from "next/navigation";
import { desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { Avatar } from "@/components/avatar";
import { ClanAvatar } from "@/components/clan-avatar";
import { CopyField } from "@/components/copy-field";
import { DiscordIdentity } from "@/components/discord-identity";
import { RolePill } from "@/components/role-pill";
import { SocialList } from "@/components/social-list";
import { Card, Notice, Page, PageHeader, Pill, StatTile, StatusBadge, columns, stack } from "@/components/ui";
import { getT } from "@/i18n/server";
import type { T } from "@/i18n/translate";
import { avatarData } from "@/lib/avatars";
import { discordIdentity } from "@/lib/discord-verify";
import { fmtDate, fmtWeekday, lanWeekday } from "@/lib/format";
import { guestDiscordLines } from "@/lib/guest-claim";
import { getDefaultNames, pickNick } from "@/lib/lans";
import { STAFF_ROLES, isStaff, platformCan } from "@/lib/platform-roles";
import { requirePlatform } from "@/lib/session";
import { UserAdminActions } from "../../user-admin-actions";
import { updateUserLanInfo } from "@/app/member-lan-actions";
import { MemberLanForm } from "@/components/member-lan-form";
import { allTypes } from "@/lib/lan-types";
import { GuestLinkForm } from "@/components/guest-link-form";
import { guestLinkCandidates } from "@/lib/guest-link";

/**
 * One account for platform staff: who it is, how they sign in, their Discord, clans, nicks and
 * events across all clans, plus the platform role and suspension. Read-only apart from those two.
 */
export default async function AdminUserPage({ params }: PageProps<"/admin/users/[userId]">) {
  const me = await requirePlatform("view");
  const t = await getT();
  const { userId } = await params;
  const u = db.select().from(schema.user).where(eq(schema.user.id, userId)).get();
  // Deleted accounts are only empty rows kept for past events.
  if (!u || u.deletedAt) notFound();

  const name = getDefaultNames([u.id]).get(u.id)?.full ?? u.name;
  const memberships = db
    .select({ m: schema.clanMember, c: schema.clan })
    .from(schema.clanMember)
    .innerJoin(schema.clan, eq(schema.clan.id, schema.clanMember.clanId))
    .where(eq(schema.clanMember.userId, u.id))
    .orderBy(schema.clan.name)
    .all();
  const answers = db
    .select({ a: schema.attendance, l: schema.lan })
    .from(schema.attendance)
    .innerJoin(schema.lan, eq(schema.lan.id, schema.attendance.lanId))
    .where(eq(schema.attendance.userId, u.id))
    .orderBy(desc(schema.lan.startsAt))
    .all();
  const seats = db.select().from(schema.seat).where(eq(schema.seat.userId, u.id)).all();
  const nicks = db.select().from(schema.nickname).where(eq(schema.nickname.userId, u.id)).all();
  // LAN IDs are private to clan admins, so only staff who may manage any clan see them here.
  const lanIds = platformCan(me, "clans") ? db.select().from(schema.lanAccount).where(eq(schema.lanAccount.userId, u.id)).all() : [];
  const typeIds = [...new Set([...nicks, ...lanIds].map((n) => n.typeId).filter((x): x is string => !!x))];
  const types = typeIds.length ? db.select().from(schema.lanType).where(inArray(schema.lanType.id, typeIds)).all() : [];
  const nickLanIds = [...new Set([...nicks, ...lanIds].map((n) => n.lanId).filter((x): x is string => !!x))];
  const nickLans = nickLanIds.length ? db.select().from(schema.lan).where(inArray(schema.lan.id, nickLanIds)).all() : [];
  const clans = db.select({ id: schema.clan.id, name: schema.clan.name }).from(schema.clan).all();
  const clanName = (id: string | null) => clans.find((c) => c.id === id)?.name;
  const providers = db
    .select({ p: schema.account.providerId })
    .from(schema.account)
    .where(eq(schema.account.userId, u.id))
    .all()
    .map((r) => r.p);
  const lastDay = db
    .select({ day: schema.userActivity.day })
    .from(schema.userActivity)
    .where(eq(schema.userActivity.userId, u.id))
    .orderBy(desc(schema.userActivity.day))
    .limit(1)
    .get()?.day;
  const discord = u.isGuest ? null : discordIdentity(u.id);
  const defaultNick = pickNick(nicks, { lanId: null, typeId: null }, "");
  const now = new Date();
  // Owners and admins manage every clan, so they fix nicks and LAN IDs for every (global) LAN type.
  const editTypes = platformCan(me, "clans") && !u.isGuest ? allTypes() : [];
  const typeRow = (ty: { id: string; name: string }) => {
    const ns = nicks.filter((n) => n.typeId === ty.id && !n.lanId);
    return { id: ty.id, name: ty.name, nick: (ns.find((n) => n.isPrimary) ?? ns[0])?.nick ?? "", lanId: lanIds.find((a) => a.typeId === ty.id && !a.lanId)?.value ?? "" };
  };

  // Nicks and LAN IDs by scope: default, per LAN type, per single event.
  const scopes = [
    { key: "default", label: t("member.default"), typeId: null as string | null, lanId: null as string | null },
    ...types.map((ty) => ({ key: ty.id, label: ty.name, typeId: ty.id, lanId: null })),
    ...nickLans.map((l) => ({ key: l.id, label: l.name, typeId: null, lanId: l.id })),
  ]
    .map((s) => {
      const here = <T extends { typeId: string | null; lanId: string | null }>(r: T) => r.typeId === s.typeId && r.lanId === s.lanId;
      const ns = nicks.filter(here);
      return {
        ...s,
        nick: (ns.find((n) => n.isPrimary) ?? ns[0])?.nick,
        others: ns.length > 1 ? ns.filter((n) => n !== (ns.find((x) => x.isPrimary) ?? ns[0])).map((n) => n.nick) : [],
        lanId: lanIds.find(here)?.value,
      };
    })
    .filter((s) => s.key === "default" || s.nick || s.lanId);

  const past = answers.filter((r) => r.l.endsAt < now);
  const attended = past.filter((r) => r.a.status === "going").length;
  const roleLabel = isStaff(u) ? t(`platformRoles.name.${u.role as (typeof STAFF_ROLES)[number]}`) : null;

  return (
    <Page>
      <PageHeader
        back={{ href: "/admin/users", label: t("admin.users") }}
        avatar={<Avatar data={avatarData(u)} size={56} />}
        title={
          <span className="inline-flex max-w-full items-center gap-2">
            <span className="truncate">{name}</span>
            <MemberBadges b={memberBadges([u.id]).get(u.id)} t={t} linkDiscord size={20} full />
          </span>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {roleLabel && <Pill tone="emerald">{roleLabel}</Pill>}
            {u.isGuest && <Pill>{t("clanSettings.guest")}</Pill>}
            {u.suspendedAt && <Pill tone="red">{t("moderation.suspended")}</Pill>}
            <span>{t("adminUser.since", { date: fmtWeekday(u.createdAt, t.locale) })}</span>
          </span>
        }
        actions={<UserAdminActions t={t} me={me} u={u} name={name} />}
      />
      {u.suspendedAt && (
        <Notice tone="danger">
          {t("adminUser.suspendedOn", { date: fmtDate(u.suspendedAt, t.locale) })}
          {u.suspendedReason && ` ${t("adminUser.reason", { reason: u.suspendedReason })}`}
        </Notice>
      )}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <StatTile label={t("admin.clans")} value={String(memberships.filter((r) => r.m.role !== "pending").length)} />
        <StatTile label={t("member.attended")} value={String(attended)} sub={past.length ? t("member.ofPast", { count: past.length }) : t("member.noPast")} />
        <StatTile
          label={t("adminUser.lastActive")}
          value={lastDay ? fmtWeekday(new Date(`${lastDay}T12:00:00`), t.locale) : "—"}
        />
      </div>

      <div className={columns}>
        <div className={`min-w-0 ${stack}`}>
          <Card title={t("adminUser.clans")}>
            {memberships.length === 0 ? (
              <p className="text-sm text-muted">{t("adminUser.noClans")}</p>
            ) : (
              <ul className="-my-1 divide-y divide-line">
                {memberships.map(({ m, c }) => (
                  <li key={c.id}>
                    <Link
                      href={m.role === "pending" ? `/clans/${c.slug}` : `/clans/${c.slug}/members/${u.id}`}
                      className="-mx-2 flex min-h-12 items-center justify-between gap-3 rounded-md px-2 py-2 transition hover:bg-raised/60"
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <ClanAvatar clan={c} size={28} />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{c.name}</span>
                          <span className="block text-xs text-muted">{t("member.since", { date: fmtWeekday(m.createdAt, t.locale) })}</span>
                        </span>
                      </span>
                      <span className="flex shrink-0 gap-1">
                        {m.role === "pending" ? <Pill tone="amber">{t("roles.pending")}</Pill> : <RolePill role={m.role} />}
                        {c.suspendedAt && <Pill tone="red">{t("moderation.suspended")}</Pill>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={t("adminUser.events")}>
            {answers.length === 0 ? (
              <p className="text-sm text-muted">{t("adminUser.noEvents")}</p>
            ) : (
              <ul className="-my-1 divide-y divide-line">
                {answers.map(({ a, l }) => {
                  const seat = seats.find((s) => s.lanId === l.id)?.label ?? null;
                  const past = l.endsAt < now;
                  return (
                    <li key={a.id}>
                      <Link
                        href={platformCan(me, "clans") ? `/lans/${l.id}/manage` : `/lans/${l.id}`}
                        className={`-mx-2 flex min-h-12 items-center justify-between gap-3 rounded-md px-2 py-2 transition hover:bg-raised/60 ${past ? "opacity-60" : ""}`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{l.name}</span>
                          <span className="block truncate text-xs text-muted">
                            {lanWeekday(l, t.locale)} · {clanName(l.clanId) ?? t("admin.noClan")}
                          </span>
                        </span>
                        <span className="flex shrink-0 flex-wrap justify-end gap-1">
                          <StatusBadge status={a.status} seat={seat} />
                          {a.status === "going" && <TicketPill t={t} paid={a.paid} bought={a.ticketBought} />}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        <div className={`min-w-0 ${stack}`}>
          <Card title={t("adminUser.account")}>
            <dl className="space-y-2 text-sm">
              {u.isGuest ? (
                <>
                  <Row label={t("adminUser.guestOf")}>{clanName(u.guestClanId) ?? "—"}</Row>
                  <Row label={t("member.email")}>{u.inviteEmail ?? t("member.notKnown")}</Row>
                  <Row label={t("member.invite")}>
                    {u.invitedAt ? t("member.mailed", { date: fmtDate(u.invitedAt, t.locale) }) : t("member.notSent")}
                  </Row>
                </>
              ) : (
                <>
                  <Row label={t("member.email")}>
                    <a href={`mailto:${u.email}`} className="text-bit hover:underline">
                      {u.email}
                    </a>
                    <span className="block text-xs text-muted">{t(u.emailVerified ? "adminUser.emailVerified" : "adminUser.emailNotVerified")}</span>
                  </Row>
                  <Row label={t("adminUser.signIn")}>
                    {providers.length ? providers.map((p) => providerName(t, p)).join(", ") : "—"}
                  </Row>
                </>
              )}
              <Row label={t("adminUser.firstName")}>{u.firstName || "—"}</Row>
              <Row label={t("adminUser.lastName")}>{u.lastName || "—"}</Row>
              <Row label={t("adminUser.language")}>{u.locale ? u.locale.toUpperCase() : t("adminUser.browser")}</Row>
            </dl>
            <div className="mt-3 space-y-1">
              <p className="text-xs text-muted">{t("adminUser.userId")}</p>
              <CopyField value={u.id} label={t("adminUser.userId")} />
            </div>
          </Card>

          {u.isGuest && u.guestClanId && platformCan(me, "clans") && (
            <Card title={t("guestLink.title")}>
              <p className="mb-3 text-sm text-muted">
                {t("guestLink.hint", { guest: u.firstName || u.name })}{" "}
                {t("guestLink.hintStaff", { clan: clanName(u.guestClanId) ?? "—" })}
              </p>
              <GuestLinkForm
                clanId={u.guestClanId}
                guestId={u.id}
                guestName={u.name}
                candidates={guestLinkCandidates(u, true)}
                afterHref="/admin/users/{id}"
              />
            </Card>
          )}

          <Card title="Discord">
            {u.isGuest ? (
              <ul className="space-y-1 text-sm text-muted">
                {guestDiscordLines(u, t).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : discord ? (
              <DiscordIdentity t={t} identity={discord} canVerify={false} others />
            ) : (
              <p className="text-sm text-muted">{t("member.notLinked")}</p>
            )}
          </Card>

          <Card title={t("member.nicks")}>
            <dl className="space-y-2 text-sm">
              {scopes.map((s) => (
                <div key={s.key} className="flex justify-between gap-3">
                  <dt className="min-w-0 truncate text-muted">{s.label}</dt>
                  <dd className="min-w-0 text-right">
                    <span className="block truncate font-medium">{s.nick ?? (defaultNick || "—")}</span>
                    {s.others.length > 0 && <span className="block truncate text-xs text-muted">{s.others.join(", ")}</span>}
                    {s.lanId && <span className="block truncate text-xs text-faint">ID {s.lanId}</span>}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>

          {editTypes.length > 0 && (
            <Card title={t("memberLan.title")}>
              <MemberLanForm
                label={t("memberLan.edit")}
                action={updateUserLanInfo.bind(null, u.id)}
                defaultNick={defaultNick}
                types={editTypes.map(typeRow)}
              />
            </Card>
          )}

          <Card title={t("member.socials")}>
            <SocialList socials={u.socials ?? {}} discordId={discord?.id} />
          </Card>
        </div>
      </div>
    </Page>
  );
}

const PROVIDERS = ["credential", "discord", "google"] as const;
function providerName(t: T, p: string) {
  return PROVIDERS.find((x) => x === p) ? t(`profile.providers.${p as (typeof PROVIDERS)[number]}`) : p;
}

function TicketPill({ t, paid, bought }: { t: T; paid: boolean; bought: boolean }) {
  if (paid) return <Pill tone="emerald">{t("event.ticketOk")}</Pill>;
  if (bought) return <Pill tone="amber">{t("event.reported")}</Pill>;
  return <Pill tone="red">{t("event.noTicket")}</Pill>;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right">{children}</dd>
    </div>
  );
}
