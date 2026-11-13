import type { ReactNode } from "react";
import { stack } from "@/components/ui";
import { getT } from "@/i18n/server";
import { platformCan } from "@/lib/platform-roles";
import { requirePlatform } from "@/lib/session";
import { AdminTabs } from "./admin-tabs";
import { ADMIN_SECTIONS } from "./sections";

/** Every admin page keeps the same tab bar, filtered by the viewer's platform role. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const me = await requirePlatform("view");
  const t = await getT();
  const tabs = ADMIN_SECTIONS.filter((s) => platformCan(me, s.perm) && (s.enabled?.() ?? true)).map((s) => {
    const n = s.badge?.() ?? 0;
    return { id: s.href, label: t(s.label), badge: n > 0 ? String(n) : undefined };
  });
  return (
    <div className={stack}>
      <AdminTabs tabs={tabs} label={t("admin.tabs.label")} />
      {children}
    </div>
  );
}
