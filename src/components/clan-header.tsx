import Link from "next/link";
import { and, eq, gt } from "drizzle-orm";
import type { ReactNode } from "react";
import { db, schema } from "@/db";
import type { Clan, ClanRole } from "@/db/schema";
import { MANAGE_TAB_PERMS, isMemberRole, type ClanPermission } from "@/lib/clan-roles";
import { getT } from "@/i18n/server";
import { joinClan } from "@/app/clan-actions";
import { isSupporter } from "@/lib/billing";
import { clanPaymentsOn, memberLines, owedSummary, paymentsAvailable, reportedCount } from "@/lib/payments";
import { ClanAvatar } from "./clan-avatar";
import { DonorBadge, SupporterBadge } from "./support-card";
import { isDonorClan } from "@/lib/donations";
import type { Tab } from "./tabs";
import { SectionLayout, type NavSection } from "./section-nav";
import { groupTabs } from "./tab-groups";
import { PageHeader, Pill, Segmented, btnPrimary } from "./ui";
import { ViewManageSwitch } from "./view-manage-switch";
import { ActionForm } from "@/components/action-form";

export const CLAN_VIEW_TABS = ["overview", "events", "members", "payments", "stats"] as const;
export const CLAN_MANAGE_TABS = ["general", "members", "guests", "types", "invites", "chat", "payments", "log"] as const;
export type ClanManageTab = (typeof CLAN_MANAGE_TABS)[number];

/**
 * The manage tab bar shows groups, so it stays short; a group with more than one part
 * switches between them below the bar. Each part keeps its own ?tab= link.
 */
const MANAGE_GROUPS: ClanManageTab[][] = [["general", "chat"], ["members", "guests", "invites"], ["types"], ["payments"], ["log"]];


/** Where a tab lives: stats has its own page, the rest are ?tab= on the clan or settings page. */
export function clanTabHref(slug: string, mode: "view" | "manage", tab: string) {
  if (mode === "view") return tab === "stats" ? `/clans/${slug}/stats` : tab === "overview" ? `/clans/${slug}` : `/clans/${slug}?tab=${tab}`;
  return tab === "general" ? `/clans/${slug}/settings` : `/clans/${slug}/settings?tab=${tab}`;
}

/** The manage tabs this user may open, in tab order. Empty = no Manage switch. */
export function manageTabsFor(perms: Set<ClanPermission>) {
  // Payments only where the operator allows them.
  return CLAN_MANAGE_TABS.filter((t) => perms.has(MANAGE_TAB_PERMS[t]) && (t !== "payments" || paymentsAvailable()));
}

/** Members see a Payments tab once the clan has charged them something (or they run payments). */
export function showsPaymentsTab(c: Clan, userId: string, perms: Set<ClanPermission>) {
  if (!clanPaymentsOn(c)) return false;
  return perms.has("payments") || memberLines(userId, { clanId: c.id }).length > 0;
}

/**
 * The clan's header and section list, the same on the clan page, its stats and its settings. Admins, event managers
 * and recruiters get the View / Manage switch (like on events), with the manage tabs their role allows.
 * Switching keeps you on Members if you're there.
 */
export async function ClanHeader({
  clan: c,
  role,
  perms,
  mode,
  tab,
  meId,
  children,
}: {
  clan: Clan;
  /** The viewer, for their own Payments tab. */
  meId: string;
  role: ClanRole | null;
  /** From clanPerms(). */
  perms: Set<ClanPermission>;
  mode: "view" | "manage";
  tab: string;
  /** The open section's content; it sits next to the section list. */
  children: ReactNode;
}) {
  const t = await getT();
  const manageTabs = manageTabsFor(perms);
  const canManage = manageTabs.length > 0;
  const seesDrafts = perms.has("events");
  const roles = db
    .select({ role: schema.clanMember.role, isGuest: schema.user.isGuest })
    .from(schema.clanMember)
    .innerJoin(schema.user, eq(schema.user.id, schema.clanMember.userId))
    .where(eq(schema.clanMember.clanId, c.id))
    .all();
  const active = roles.filter((r) => r.role !== "pending");
  // Join requests plus members asking to take over a guest: both wait for an admin.
  const pending =
    roles.length -
    active.length +
    (canManage
      ? db
          .select({ id: schema.guestClaim.id })
          .from(schema.guestClaim)
          .where(and(eq(schema.guestClaim.clanId, c.id), eq(schema.guestClaim.status, "pending")))
          .all().length
      : 0);
  const guests = active.filter((r) => r.isGuest).length;
  const isMember = isMemberRole(role);

  const other = mode === "view" ? "manage" : "view";
  const keepTab =
    tab === "members" && (other === "view" || manageTabs.includes("members")) ? "members" : other === "view" ? "overview" : manageTabs[0];

  let tabs: Tab[];
  // Manage mode: the parts of the open group, shown as a switch below the bar.
  let parts: Tab[] = [];
  let activeTab = tab;
  /** One line per section row: why you'd open it. */
  let status: Record<string, string> = {};
  if (mode === "view") {
    const upcoming =
      isMember || canManage
        ? db
            .select({ id: schema.lan.id, publishedAt: schema.lan.publishedAt })
            .from(schema.lan)
            .where(and(eq(schema.lan.clanId, c.id), gt(schema.lan.endsAt, new Date())))
            .all()
            // Members don't see drafts.
            .filter((l) => seesDrafts || l.publishedAt).length
        : 0;
    const myOwed = showsPaymentsTab(c, meId, perms) ? owedSummary(memberLines(meId, { clanId: c.id })).count : null;
    tabs = [
      { id: "overview", label: t("event.tabs.overview") },
      ...(isMember || canManage ? [{ id: "events", label: t("clanHeader.events"), count: upcoming }] : []),
      { id: "members", label: t("clanPage.members"), count: active.length },
      ...(myOwed !== null ? [{ id: "payments", label: t("payments.title"), badge: myOwed ? t("payments.openBadge", { count: myOwed }) : undefined }] : []),
      ...(perms.has("stats") ? [{ id: "stats", label: t("clanHeader.stats") }] : []),
    ];
    status = {
      overview: t("clanRows.overview"),
      events: upcoming ? t("clanRows.events", { count: upcoming }) : t("clanRows.noEvents"),
      members: t("common.members", { count: active.length }),
      payments: myOwed ? t("payments.openBadge", { count: myOwed }) : t("clanRows.allPaid"),
      stats: t("clanRows.stats"),
    };
  } else {
    const types = db.select({ id: schema.lanType.id }).from(schema.lanType).where(eq(schema.lanType.clanId, c.id)).all().length;
    const all: Record<ClanManageTab, Tab> = {
      general: { id: "general", label: t("clanHeader.general") },
      members: {
        id: "members",
        label: t("clanPage.members"),
        count: active.length - guests,
        badge: pending ? t("clanPage.links.waiting", { count: pending }) : undefined,
      },
      guests: { id: "guests", label: t("clanPage.links.guests"), count: guests },
      types: { id: "types", label: t("clanPage.links.types"), count: types },
      invites: { id: "invites", label: t("clanPage.links.invites") },
      chat: { id: "chat", label: t("manage.tabs.chat") },
      payments: (() => {
        const toCheck = c.paymentsEnabled && manageTabs.includes("payments") ? reportedCount(c.id) : 0;
        return { id: "payments", label: t("payments.title"), badge: toCheck ? t("payments.toCheck", { count: toCheck }) : undefined };
      })(),
      log: { id: "log", label: t("clanHeader.log") },
    };
    // Members, guests and invite links share the bar as "People".
    ({ bar: tabs, active: activeTab, parts } = groupTabs(MANAGE_GROUPS, manageTabs.map((x) => all[x]), tab, { members: t("clanHeader.people") }));
    status = {
      general: t("clanRows.general"),
      chat: t("clanRows.chat"),
      members: pending ? t("clanPage.links.waiting", { count: pending }) : t("clanRows.people", { members: active.length - guests, guests }),
      guests: t("clanRows.guests", { count: guests }),
      invites: t("clanRows.invites"),
      types: t("clanRows.types", { count: types }),
      payments: all.payments.badge ?? t("clanRows.payments"),
      log: t("clanRows.log"),
    };
  }

  let actions: ReactNode = null;
  if (canManage) {
    actions = (
      <>
        {mode === "view" && perms.has("events") && (
          <Link href={`/clans/${c.slug}/lans/new`} className={btnPrimary}>
            <span aria-hidden>+</span> {t("home.newEvent")}
          </Link>
        )}
        <ViewManageSwitch
          mode={mode}
          viewHref={clanTabHref(c.slug, "view", mode === "manage" ? keepTab : tab)}
          manageHref={clanTabHref(c.slug, "manage", mode === "view" ? keepTab : tab)}
          manageBadge={mode === "view" && perms.has("members") ? pending : undefined}
        />
      </>
    );
  } else if (!role && c.joinPolicy !== "invite") {
    actions = (
      <ActionForm action={joinClan.bind(null, c.id)} done={false}>
        <button className={btnPrimary}>{c.joinPolicy === "open" ? t("clans.join") : t("clans.askToJoin")}</button>
      </ActionForm>
    );
  } else if (role === "pending") {
    actions = <Pill tone="amber">{t("clanPage.waitingApproval")}</Pill>;
  }

  return (
    <>
      <PageHeader
        avatar={<ClanAvatar clan={c} size={56} />}
        eyebrow={
          <Link href="/clans" className="hover:text-fg">
            {t("clanHeader.clan")}
          </Link>
        }
        title={c.name}
        subtitle={
          <>
            {t("common.members", { count: active.length })}
            <span className="text-faint"> · {t(`clanHeader.policy.${c.joinPolicy}`)}</span>
            {isMemberRole(role) && role !== "member" && (
              <span className="text-faint"> · {t("clanHeader.youAre", { role: t(`roleA.${role}`) })}</span>
            )}
            {isSupporter(c) ? (
              <span className="ml-2 align-middle">
                <SupporterBadge title={t("support.badge")} />
              </span>
            ) : (
              isDonorClan(c.id) && (
                <span className="ml-2 align-middle">
                  <DonorBadge label={t("donate.badgeLabel")} title={t("donate.badgeClan")} />
                </span>
              )
            )}
          </>
        }
        actions={actions}
      />
      <SectionLayout
        sections={tabs.map(
          (x): NavSection => ({ id: x.id, label: x.label, href: clanTabHref(c.slug, mode, x.id), status: status[x.id], dot: !!x.badge }),
        )}
        active={activeTab}
        label={mode === "view" ? t("clanHeader.sections") : t("clanHeader.settingsSections")}
        backLabel={tabs[0]?.label ?? ""}
      >
        {parts.length > 1 && (
          <Segmented
            label={tabs.find((x) => x.id === activeTab)?.label}
            value={tab}
            fill
            options={parts.map((x) => ({ id: x.id, href: clanTabHref(c.slug, mode, x.id), label: x.label, count: x.count, dot: !!x.badge }))}
          />
        )}
        {children}
      </SectionLayout>
    </>
  );
}
