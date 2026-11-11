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
    <nav aria-label="Sections" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1 border-b border-line">
        {tabs.map((t) => {
          const on = t.id === active;
          return (
            <li key={t.id}>
              <Link
                href={hrefFor(t.id)}
                scroll={false}
                aria-current={on ? "page" : undefined}
                className={`-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition ${
                  on ? "border-bit text-zinc-100" : "border-transparent text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {t.label}
                {t.badge && (
                  <span className="rounded-full bg-amber-500/15 px-1.5 text-[10px] text-amber-300">{t.badge}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
