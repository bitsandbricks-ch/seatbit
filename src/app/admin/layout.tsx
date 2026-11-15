import type { ReactNode } from "react";
import { getT } from "@/i18n/server";
import { platformCan } from "@/lib/platform-roles";
import { requirePlatform } from "@/lib/session";
import { AdminSections } from "./admin-sections";
import { ADMIN_SECTIONS } from "./sections";

/** Every admin page keeps the same section list, filtered by the viewer's platform role. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const me = await requirePlatform("view");
  const t = await getT();
  const sections = ADMIN_SECTIONS.filter((s) => platformCan(me, s.perm) && (s.enabled?.() ?? true)).map((s) => {
    const n = s.badge?.() ?? 0;
    return { id: s.href, label: t(s.label), href: s.href, status: n > 0 ? t("adminRows.open", { count: n }) : t(s.status), dot: n > 0 };
  });
  return (
    <AdminSections sections={sections} label={t("admin.tabs.label")}>
      {children}
    </AdminSections>
  );
}
