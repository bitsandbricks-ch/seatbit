import Link from "next/link";
import { fmtDay } from "@/lib/format";

export type TurnoutPoint = {
  id: string;
  name: string;
  startsAt: Date;
  past: boolean;
  asked: number;
  answered: number;
  /** Past: attended. Upcoming: coming so far. */
  coming: number;
};

// One hue, light to dark: each bar is a subset of the one behind it.
const ASKED = "#41584f";
const ANSWERED = "#178a5f";
const COMING = "var(--color-bit)";

/**
 * Asked / answered / attended per event, one row per event in date order.
 * The three bars are nested from the same baseline, so the gaps read as
 * "never answered" and "answered but didn't come". Every row also says its
 * numbers in text, and the table below the chart has the details.
 */
export function EventTurnoutChart({ points }: { points: TurnoutPoint[] }) {
  const max = Math.max(1, ...points.map((p) => p.asked));
  const w = (n: number) => `${(n / max) * 100}%`;
  return (
    <figure className="space-y-4">
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <Key color={ASKED} label="Asked (in the clan)" />
        <Key color={ANSWERED} label="Answered" />
        <Key color={COMING} label="Attended / coming" />
      </figcaption>
      <ol className="space-y-1">
        {points.map((p) => (
          <li key={p.id}>
            <Link
              href={`/lans/${p.id}`}
              className="group relative -mx-2 grid grid-cols-[minmax(0,1fr)] gap-1 rounded-md px-2 py-2 transition hover:bg-raised sm:grid-cols-[13rem_minmax(0,1fr)] sm:items-center sm:gap-3"
            >
              <span className="flex min-w-0 items-baseline justify-between gap-2 sm:block">
                <span className="block truncate text-sm font-medium">{p.name}</span>
                <span className="shrink-0 text-xs text-muted tabular-nums">
                  {fmtDay(p.startsAt)}
                  {!p.past && <span className="text-warn"> · upcoming</span>}
                </span>
              </span>
              <span className="flex min-w-0 items-center gap-3">
                <span className="relative block h-3 min-w-0 flex-1" aria-hidden>
                  <span className="absolute inset-y-0 left-0 rounded-r-[4px]" style={{ width: w(p.asked), background: ASKED }} />
                  <span
                    className="absolute inset-y-0 left-0 rounded-r-[4px] ring-2 ring-surface"
                    style={{ width: w(p.answered), background: ANSWERED }}
                  />
                  <span
                    className="absolute inset-y-0 left-0 rounded-r-[4px] ring-2 ring-surface"
                    style={{ width: w(p.coming), background: COMING }}
                  />
                </span>
                <span className="w-24 shrink-0 text-right text-xs text-muted tabular-nums">
                  <span className="font-semibold text-fg">{p.coming}</span> / {p.answered} / {p.asked}
                </span>
              </span>
              <span
                role="tooltip"
                className="pointer-events-none absolute right-2 bottom-full z-10 mb-1 hidden w-max max-w-[16rem] rounded-md border border-line bg-ink px-3 py-2 text-xs shadow-lg group-hover:block group-focus-visible:block"
              >
                <span className="block font-medium text-fg">{p.name}</span>
                <span className="block text-muted">
                  {p.asked} asked · {p.answered} answered ({p.asked ? Math.round((p.answered / p.asked) * 100) : 0}%)
                </span>
                <span className="block text-muted">
                  {p.coming} {p.past ? "attended" : "coming so far"} · {Math.max(0, p.asked - p.answered)} never answered
                </span>
              </span>
              <span className="sr-only">
                {p.asked} asked, {p.answered} answered, {p.coming} {p.past ? "attended" : "coming"}
              </span>
            </Link>
          </li>
        ))}
      </ol>
      <p className="text-xs text-faint">Numbers: attended or coming / answered / asked.</p>
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
