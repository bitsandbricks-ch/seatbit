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
  /** Show the badge as a small dot (its text stays for screen readers), e.g. when a guide on the page already says what to do. */
  dot?: boolean;
  /** Only you (a lead) see this tab for now: muted, with a crossed-out eye. The text says why, for the tooltip and screen readers. */
  hidden?: string;
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
  sticky = true,
}: {
  tabs: Tab[];
  active: string;
  hrefFor: (id: string) => string;
  label?: string;
  /** Off for a second bar above a page's own sticky tabs (platform admin). */
  sticky?: boolean;
}) {
  return (
    <div className={`${sticky ? "sticky top-14 z-20 bg-ink/95 backdrop-blur" : ""} -mx-4 border-b border-line sm:-mx-6`}>
      <nav aria-label={label} className="scroll-fade-x overflow-x-auto px-4 sm:px-6">
        <ul className="flex min-w-max gap-4 pr-8 sm:gap-6">
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
                  } ${t.hidden ? "opacity-60" : ""}`}
                  title={t.hidden}
                >
                  {t.hidden && <HiddenIcon />}
                  {t.label}
                  {t.hidden && <span className="sr-only">, {t.hidden}</span>}
                  {t.count !== undefined && (
                    <span className={`rounded-full px-1.5 py-px text-[11px] tabular-nums ${on ? "bg-bit-soft text-bit" : "bg-raised text-muted"}`}>
                      {t.count}
                    </span>
                  )}
                  {t.badge &&
                    (t.dot ? (
                      <>
                        <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${t.badgeTone === "ok" ? "bg-bit" : "bg-warn"}`} />
                        <span className="sr-only">{t.badge}</span>
                      </>
                    ) : (
                      <span className={`rounded-full px-1.5 py-px text-[11px] font-medium ${t.badgeTone === "ok" ? "bg-bit-soft text-bit" : "bg-warn/15 text-warn"}`}>{t.badge}</span>
                    ))}
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

/** A crossed-out eye: something only leads see for now. */
export function HiddenIcon({ label, className = "size-3.5" }: { label?: string; className?: string }) {
  return (
    <>
      <svg viewBox="0 0 16 16" className={`${className} shrink-0`} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 8s2.2-4 6-4c1 0 1.9.3 2.7.7M14 8s-2.2 4-6 4c-1 0-1.9-.3-2.7-.7" />
        <path d="M6.6 9.4a2 2 0 0 1 2.8-2.8M2.5 13.5l11-11" />
      </svg>
      {label && <span className="sr-only">{label}</span>}
    </>
  );
}
