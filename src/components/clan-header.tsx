import Link from "next/link";
import { and, eq, gt } from "drizzle-orm";
import type { ReactNode } from "react";
import { db, schema } from "@/db";
import type { Clan, ClanRole } from "@/db/schema";
import { MANAGE_TAB_PERMS, isMemberRole, roleWithArticle, type ClanPermission } from "@/lib/clan-roles";
import { joinClan } from "@/app/clan-actions";
import { ClanAvatar } from "./clan-avatar";
import { Tabs, type Tab } from "./tabs";
import { PageHeader, Pill, btnPrimary } from "./ui";
import { ViewManageSwitch } from "./view-manage-switch";

export const CLAN_VIEW_TABS = ["overview", "events", "members", "stats"] as const;
export const CLAN_MANAGE_TABS = ["general", "members", "guests", "types", "invites", "chat", "log"] as const;
export type ClanViewTab = (typeof CLAN_VIEW_TABS)[number];
export type ClanManageTab = (typeof CLAN_MANAGE_TABS)[number];

const joinPolicyText = { open: "Open to join", approval: "Join on request", invite: "Invite only" } as const;

/** Where a tab lives: stats has its own page, the rest are ?tab= on the clan or settings page. */
export function clanTabHref(slug: string, mode: "view" | "manage", tab: string) {
  if (mode === "view") return tab === "stats" ? `/clans/${slug}/stats` : tab === "overview" ? `/clans/${slug}` : `/clans/${slug}?tab=${tab}`;
  return tab === "general" ? `/clans/${slug}/settings` : `/clans/${slug}/settings?tab=${tab}`;
}

/** The manage tabs this user may open, in tab order. Empty = no Manage switch. */
export function manageTabsFor(perms: Set<ClanPermission>) {
  return CLAN_MANAGE_TABS.filter((t) => perms.has(MANAGE_TAB_PERMS[t]));
}

/**
 * The clan's header and tab bar, the same on the clan page, its stats and its settings. Admins, event managers
 * and recruiters get the View / Manage switch (like on events), with the manage tabs their role allows.
 * Switching keeps you on Members if you're there.
 */
export function ClanHeader({
  clan: c,
  role,
  perms,
  mode,
  tab,
}: {
  clan: Clan;
  role: ClanRole | null;
  /** From clanPerms(). */
  perms: Set<ClanPermission>;
  mode: "view" | "manage";
  tab: string;
}) {
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
    tabs = [
      { id: "overview", label: "Overview" },
      ...(isMember || canManage ? [{ id: "events", label: "Events", count: upcoming || undefined }] : []),
      { id: "members", label: "Members", count: active.length },
      ...(perms.has("stats") ? [{ id: "stats", label: "Stats" }] : []),
    ];
  } else {
    const types = db.select({ id: schema.lanType.id }).from(schema.lanType).where(eq(schema.lanType.clanId, c.id)).all().length;
    const all: Record<ClanManageTab, Tab> = {
      general: { id: "general", label: "General" },
      members: { id: "members", label: "Members", count: active.length - guests, badge: pending ? `${pending} waiting` : undefined },
      guests: { id: "guests", label: "Guests", count: guests },
      types: { id: "types", label: "LAN types", count: types },
      invites: { id: "invites", label: "Invite links" },
      chat: { id: "chat", label: "Discord & WhatsApp" },
      log: { id: "log", label: "Audit log" },
    };
    tabs = manageTabs.map((t) => all[t]);
  }

  let actions: ReactNode = null;
  if (canManage) {
    actions = (
      <>
        {mode === "view" && perms.has("events") && (
          <Link href={`/clans/${c.slug}/lans/new`} className={btnPrimary}>
            <span aria-hidden>+</span> New event
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
      <form action={joinClan.bind(null, c.id)}>
        <button className={btnPrimary}>{c.joinPolicy === "open" ? "Join" : "Ask to join"}</button>
      </form>
    );
  } else if (role === "pending") {
    actions = <Pill tone="amber">Waiting for approval</Pill>;
  }

  return (
    <>
      <PageHeader
        avatar={<ClanAvatar clan={c} size={56} />}
        eyebrow={
          <Link href="/clans" className="hover:text-fg">
            Clan
          </Link>
        }
        title={c.name}
        subtitle={
          <>
            {active.length} {active.length === 1 ? "member" : "members"}
            <span className="text-faint"> · {joinPolicyText[c.joinPolicy]}</span>
            {isMemberRole(role) && role !== "member" && (
              <span className="text-faint"> · you&apos;re {roleWithArticle(role)}</span>
            )}
          </>
        }
        actions={actions}
      />
      <Tabs
        tabs={tabs}
        active={tab}
        hrefFor={(t) => clanTabHref(c.slug, mode, t)}
        label={mode === "view" ? "Clan sections" : "Clan settings"}
      />
    </>
  );
}
