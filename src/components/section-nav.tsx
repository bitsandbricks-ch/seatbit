import Link from "next/link";
import type { ReactNode } from "react";

export type NavSection = {
  id: string;
  label: string;
  href: string;
  /** One short line under the label: why you'd open it ("You owe CHF 12", "14 coming"). */
  status?: ReactNode;
  /** Something waits for you in there. A yellow dot; the status line says what. */
  dot?: boolean;
};

/**
 * The page's sections instead of a tab bar. Phones: the hub (the page's first section) lists the other sections
 * as rows; a row opens its section, which shows a back link to the hub. Desktop: the same rows as a sticky sidebar
 * on the left, always visible. Links are ?tab=<id>, so they work without JavaScript and can be bookmarked.
 *
 * Usage: <SectionLayout sections={...} active={tab} hub={...}>section content</SectionLayout>. The first section is
 * the hub; its rows sit above the hub's own content on phones.
 */
export function SectionLayout({
  sections,
  active,
  label,
  backLabel,
  heading = true,
  children,
}: {
  /** First one is the hub (e.g. Overview). */
  sections: NavSection[];
  active: string;
  /** Accessible name of the navigation, e.g. "Sections". */
  label: string;
  /** Phones, inside a section: the back link to the hub, e.g. "Overview". */
  backLabel: string;
  /** Off when each section brings its own page title (platform admin), so it isn't shown twice. */
  heading?: boolean;
  children: ReactNode;
}) {
  const [hub, ...rest] = sections;
  const onHub = !hub || active === hub.id;
  return (
    <div className="grid items-start gap-4 sm:gap-6 lg:grid-cols-[14rem_minmax(0,1fr)] 2xl:grid-cols-[16rem_minmax(0,1fr)]">
      {/* Desktop: every section, the hub too, as a sidebar. */}
      <nav aria-label={label} className="sticky top-20 hidden lg:block">
        <ul className="space-y-0.5">
          {sections.map((s) => (
            <li key={s.id}>
              <SideRow s={s} on={s.id === active} />
            </li>
          ))}
        </ul>
      </nav>

      <div className="min-w-0 space-y-4 sm:space-y-6">
        {/* Phones: rows on the hub, a back link inside a section. */}
        {onHub ? (
          rest.length > 0 && (
            <nav aria-label={label} className="lg:hidden">
              <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
                {rest.map((s) => (
                  <li key={s.id}>
                    <HubRow s={s} />
                  </li>
                ))}
              </ul>
            </nav>
          )
        ) : (
          <div>
            <Link href={hub.href} scroll={false} className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted hover:text-fg lg:hidden">
              <span aria-hidden>←</span> {backLabel}
            </Link>
            {heading && <h2 className="text-xl font-semibold tracking-tight text-fg">{sections.find((x) => x.id === active)?.label}</h2>}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

function Dot() {
  return <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-warn" />;
}

function Chevron() {
  return (
    <svg viewBox="0 0 16 16" width={14} height={14} aria-hidden className="shrink-0 text-faint">
      <path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="M6 4l4 4-4 4" />
    </svg>
  );
}

function HubRow({ s }: { s: NavSection }) {
  return (
    <Link href={s.href} className="flex min-h-14 items-center gap-3 px-4 py-2.5 transition hover:bg-raised">
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-fg">{s.label}</span>
        {s.status && <span className={`block truncate text-sm ${s.dot ? "text-warn" : "text-muted"}`}>{s.status}</span>}
      </span>
      {s.dot && <Dot />}
      <Chevron />
    </Link>
  );
}

function SideRow({ s, on }: { s: NavSection; on: boolean }) {
  return (
    <Link
      href={s.href}
      scroll={false}
      aria-current={on ? "page" : undefined}
      className={`flex items-center gap-2 rounded-md border-l-2 px-3 py-2 transition ${
        on ? "border-bit bg-raised text-fg" : "border-transparent text-muted hover:bg-raised/60 hover:text-fg"
      }`}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{s.label}</span>
        {s.status && <span className={`block truncate text-xs ${s.dot ? "text-warn" : "text-faint"}`}>{s.status}</span>}
      </span>
      {s.dot && <Dot />}
    </Link>
  );
}
