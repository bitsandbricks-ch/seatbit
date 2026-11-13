import type { T } from "@/i18n/translate";

export type UsagePoint = {
  key: string;
  /** Short label under the column ("Nov", "10.11."). */
  label: string;
  /** Full period name for the tooltip ("November 2026", "Week of 10.11.2026"). */
  title: string;
  /** The faint back column (e.g. all accounts). Leave out for a single series. */
  total?: number;
  /** The full-colour front column (e.g. active people). */
  value: number;
  /** Extra line in the tooltip. */
  note?: string;
};

// Same nesting idea as the event turnout chart: the faint column is the whole, the full one the part.
const BACK = "color-mix(in oklab, var(--color-bit) 28%, var(--color-raised))";
const FRONT = "var(--color-bit)";

/**
 * Columns over time, oldest left. Each column says its numbers in a tooltip and to
 * screen readers; the table on the stats page has all of them.
 */
export function UsageChart({
  points,
  totalLabel,
  valueLabel,
  t,
}: {
  points: UsagePoint[];
  totalLabel?: string;
  valueLabel: string;
  t: T;
}) {
  const max = Math.max(1, ...points.map((p) => Math.max(p.total ?? 0, p.value)));
  const h = (n: number) => `${(n / max) * 100}%`;
  // Label every column when there's room, else every second / third one.
  const every = points.length > 24 ? 3 : points.length > 12 ? 2 : 1;
  return (
    <figure className="space-y-3">
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {totalLabel && <Key color={BACK} label={totalLabel} />}
        <Key color={FRONT} label={valueLabel} />
        <span className="ml-auto text-faint tabular-nums">{t("usage.max", { n: max })}</span>
      </figcaption>
      <div className="overflow-x-auto">
        <ol className="flex h-40 min-w-full items-end gap-1 border-b border-line sm:h-48 sm:gap-1.5" style={{ minWidth: `${points.length * 14}px` }}>
          {points.map((p, i) => (
            <li key={p.key} className="group relative flex h-full min-w-0 flex-1 items-end" tabIndex={0}>
              {p.total !== undefined && (
                <span className="absolute inset-x-0 bottom-0 rounded-t-[3px]" style={{ height: h(p.total), background: BACK }} aria-hidden />
              )}
              <span
                className={`absolute bottom-0 rounded-t-[3px] ${p.total !== undefined ? "inset-x-[18%]" : "inset-x-0"}`}
                style={{ height: h(p.value), background: FRONT }}
                aria-hidden
              />
              <span
                role="tooltip"
                // Inside the chart area (the scroll box would clip it above), opening towards the middle.
                className={`pointer-events-none absolute top-0 z-10 hidden w-max max-w-[14rem] rounded-md ${i < points.length / 2 ? "left-0" : "right-0"} border border-line bg-ink px-3 py-2 text-xs shadow-lg group-hover:block group-focus-visible:block`}
              >
                <span className="block font-medium text-fg">{p.title}</span>
                <span className="block text-muted tabular-nums">
                  {valueLabel}: {p.value}
                  {p.total !== undefined && ` · ${totalLabel}: ${p.total}`}
                </span>
                {p.note && <span className="block text-muted">{p.note}</span>}
              </span>
              <span className="sr-only">
                {p.title}: {valueLabel} {p.value}
                {p.total !== undefined && `, ${totalLabel} ${p.total}`}
                {p.note && `, ${p.note}`}
              </span>
            </li>
          ))}
        </ol>
        <ol className="mt-1 flex min-w-full gap-1 sm:gap-1.5" style={{ minWidth: `${points.length * 14}px` }} aria-hidden>
          {points.map((p, i) => (
            <li key={p.key} className="min-w-0 flex-1 overflow-visible text-center text-[10px] whitespace-nowrap text-faint sm:text-xs">
              {(points.length - 1 - i) % every === 0 ? p.label : ""}
            </li>
          ))}
        </ol>
      </div>
    </figure>
  );
}

function Key({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: color }} aria-hidden />
      {label}
    </span>
  );
}
