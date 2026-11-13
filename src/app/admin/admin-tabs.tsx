"use client";
import { usePathname } from "next/navigation";
import { Tabs, type Tab } from "@/components/tabs";

/** The admin tab bar; the active tab is the longest href that the path starts with. */
export function AdminTabs({ tabs, label }: { tabs: Tab[]; label: string }) {
  const path = usePathname();
  const active = tabs
    .filter((t) => path === t.id || path.startsWith(`${t.id}/`))
    .sort((a, b) => b.id.length - a.id.length)[0]?.id ?? "";
  return <Tabs tabs={tabs} active={active} hrefFor={(id) => id} label={label} sticky={false} />;
}
