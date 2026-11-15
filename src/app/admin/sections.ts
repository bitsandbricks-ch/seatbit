import "server-only";
import type { MessageKey } from "@/i18n/translate";
import type { PlatformPermission } from "@/lib/platform-roles";
import { donationsEnabled } from "@/lib/donations";
import { openReportCount } from "@/lib/reports";

/**
 * The platform admin tabs, shown on every page under /admin (see layout.tsx).
 * A new admin page adds one line here instead of editing the overview page, so
 * parallel features don't collide in one list of links. Order is tab order.
 */
export type AdminSection = {
  href: string;
  label: MessageKey;
  /** Who sees the tab. The page itself still checks with requirePlatform(). */
  perm: PlatformPermission;
  /** Hide the tab when the feature is switched off. */
  enabled?: () => boolean;
  /** Something waiting, shown as a badge. */
  badge?: () => number;
};

export const ADMIN_SECTIONS: AdminSection[] = [
  { href: "/admin", label: "admin.tabs.overview", perm: "view" },
  { href: "/admin/reports", label: "moderation.reports", perm: "reports", badge: openReportCount },
  { href: "/admin/stats", label: "admin.usage", perm: "view" },
  { href: "/admin/health", label: "health.title", perm: "view" },
  { href: "/admin/log", label: "clanHeader.log", perm: "view" },
  { href: "/admin/backups", label: "admin.backups", perm: "owner" },
  { href: "/admin/donations", label: "adminDonations.title", perm: "owner", enabled: donationsEnabled },
  { href: "/admin/settings", label: "admin.tabs.settings", perm: "settings" },
];
