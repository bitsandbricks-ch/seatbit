"use client";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { SectionLayout, type NavSection } from "@/components/section-nav";

/** The admin section list; the open section is the longest href that the path starts with. */
export function AdminSections({ sections, label, children }: { sections: NavSection[]; label: string; children: ReactNode }) {
  const path = usePathname();
  const active =
    sections
      .filter((s) => path === s.href || path.startsWith(`${s.href}/`))
      .sort((a, b) => b.href.length - a.href.length)[0]?.id ?? "";
  // Every admin page has its own title, so the layout adds none.
  return (
    <SectionLayout sections={sections} active={active} label={label} backLabel={sections[0]?.label ?? ""} heading={false}>
      {children}
    </SectionLayout>
  );
}
