import Link from "next/link";
import { TabScroll } from "./tab-scroll";

export type Tab = {
  id: string;
  label: string;
  /** Neutral number after the label, e.g. how many attendees. */
  count?: number;
  /** Something needs attention, e.g. "2 to confirm". Shown in warning colour. */
  badge?: string;
  /** warn (default): something to do. ok: done, e.g. a picked seat. */
  badgeTone?: "warn" | "ok";
};

/**
 * The one tab bar for page sections (event, manage, clan settings, platform
 * settings). Tabs are links (e.g. ?tab=mail), so they work without JavaScript,
 * can be bookmarked and survive reloads. The bar sticks under the top bar while
 * you scroll and scrolls sideways on narrow screens instead of wrapping.
 * Switches inside a card use <Segmented> from ui.tsx instead.
 */
export function Tabs({
  tabs,
  active,
  hrefFor,
  label = "Sections",
}: {
  tabs: Tab[];
  active: string;
  hrefFor: (id: string) => string;
  label?: string;
}) {
  return (
    <div className="sticky top-14 z-20 -mx-4 border-b border-line bg-ink/95 backdrop-blur sm:-mx-6">
      <nav aria-label={label} className="scroll-fade-x overflow-x-auto px-4 sm:px-6">
        <ul className="flex min-w-max gap-6 pr-8">
          {tabs.map((t) => {
            const on = t.id === active;
            return (
              <li key={t.id}>
                <Link
                  href={hrefFor(t.id)}
                  scroll={false}
                  aria-current={on ? "page" : undefined}
                  className={`flex min-h-11 items-center gap-1.5 whitespace-nowrap border-b-2 text-sm font-medium transition ${
                    on ? "border-bit text-fg" : "border-transparent text-muted hover:border-line hover:text-fg"
                  }`}
                >
                  {t.label}
                  {t.count !== undefined && (
                    <span className={`rounded-full px-1.5 py-px text-[11px] tabular-nums ${on ? "bg-bit-soft text-bit" : "bg-raised text-muted"}`}>
                      {t.count}
                    </span>
                  )}
                  {t.badge && (
                    <span className={`rounded-full px-1.5 py-px text-[11px] font-medium ${t.badgeTone === "ok" ? "bg-bit-soft text-bit" : "bg-warn/15 text-warn"}`}>{t.badge}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
        <TabScroll active={active} />
      </nav>
    </div>
  );
}
