import "server-only";
import type { MessageKey } from "@/i18n/translate";
import type { PlatformPermission } from "@/lib/platform-roles";
import { donationsEnabled } from "@/lib/donations";
import { openReportCount } from "@/lib/reports";

/**
 * The platform admin sections, listed on every page under /admin (see layout.tsx).
 * A new admin page adds one line here instead of editing the overview page, so
 * parallel features don't collide in one list of links. Order is list order.
 */
export type AdminSection = {
  href: string;
  label: MessageKey;
  /** Who sees the tab. The page itself still checks with requirePlatform(). */
  perm: PlatformPermission;
  /** Hide the tab when the feature is switched off. */
  enabled?: () => boolean;
  /** Something waiting, shown as a dot and "{count} open" in its row. */
  badge?: () => number;
  /** The row's line on why you'd open it. */
  status: MessageKey;
};

export const ADMIN_SECTIONS: AdminSection[] = [
  { href: "/admin", label: "admin.tabs.overview", perm: "view", status: "adminRows.overview" },
  { href: "/admin/reports", label: "moderation.reports", perm: "reports", badge: openReportCount, status: "adminRows.reports" },
  { href: "/admin/stats", label: "admin.usage", perm: "view", status: "adminRows.usage" },
  { href: "/admin/health", label: "health.title", perm: "view", status: "adminRows.health" },
  { href: "/admin/log", label: "clanHeader.log", perm: "view", status: "adminRows.log" },
  { href: "/admin/backups", label: "admin.backups", perm: "owner", status: "adminRows.backups" },
  { href: "/admin/donations", label: "adminDonations.title", perm: "owner", enabled: donationsEnabled, status: "adminRows.donations" },
  { href: "/admin/settings", label: "admin.tabs.settings", perm: "settings", status: "adminRows.settings" },
];
