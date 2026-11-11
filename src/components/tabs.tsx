import Link from "next/link";

/**
 * Link-based tabs: each tab is a URL (e.g. ?tab=mail), so tabs work without
 * JavaScript, can be bookmarked and survive reloads. On narrow screens the bar
 * scrolls sideways instead of wrapping.
 */
export function Tabs({
  tabs,
  active,
  hrefFor,
}: {
  tabs: { id: string; label: string; badge?: string }[];
  active: string;
  hrefFor: (id: string) => string;
}) {
  return (
    <div className="-mx-4 border-b border-line sm:mx-0">
    <nav aria-label="Sections" className="scroll-fade-x overflow-x-auto px-4 sm:px-0">
      <ul className="flex min-w-max gap-1 pr-8">
        {tabs.map((t) => {
          const on = t.id === active;
          return (
            <li key={t.id}>
              <Link
                href={hrefFor(t.id)}
                scroll={false}
                aria-current={on ? "page" : undefined}
                className={`flex min-h-11 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-sm font-medium transition ${
                  on ? "border-bit text-fg" : "border-transparent text-muted hover:border-line hover:text-fg"
                }`}
              >
                {t.label}
                {t.badge && (
                  <span className="rounded-full bg-warn/15 px-1.5 py-px text-[11px] font-medium text-warn">{t.badge}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
    </div>
  );
}
