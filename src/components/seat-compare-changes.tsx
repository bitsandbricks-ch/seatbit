import type { T } from "@/i18n/translate";
import type { PlanMove } from "@/lib/seating";
import { Card, Pill } from "./ui";

const pct = (x: number) => `${Math.round(x * 100)}%`;

/**
 * Under the seat map while the leads compare two plans: everyone who sits somewhere else, gets a
 * seat or loses theirs, with how their seat wishes fare in each plan. Plain list, so it works on a phone.
 */
export function SeatCompareChanges({
  moves,
  shown,
  base,
  names,
  scores,
  t,
}: {
  moves: PlanMove[];
  /** Name of the plan on the map. */
  shown: string;
  /** Name of the plan it is compared with. */
  base: string;
  names: Map<string, string>;
  /** Wish score per person in the compared plan (`base`) and on the map (`shown`); missing: no wishes. */
  scores: { base: Map<string, number | null>; shown: Map<string, number | null> };
  t: T;
}) {
  if (moves.length === 0) return null;
  const counts = {
    moved: moves.filter((m) => m.from && m.to).length,
    gained: moves.filter((m) => !m.from).length,
    lost: moves.filter((m) => !m.to).length,
  };
  return (
    <Card id="seat-compare" title={t("seatCompare.title", { base })} actions={<Pill>{moves.length}</Pill>}>
      <p className="mb-3 text-sm text-muted">
        {t("seatCompare.hint", { shown, base })}{" "}
        {[
          counts.moved && t("seatCompare.moved", { count: counts.moved }),
          counts.gained && t("seatCompare.gained", { count: counts.gained }),
          counts.lost && t("seatCompare.lost", { count: counts.lost }),
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <ul className="divide-y divide-line rounded-md border border-line">
        {moves.map((m) => {
          const before = scores.base.get(m.u) ?? null;
          const after = scores.shown.get(m.u) ?? null;
          const tone = before === null || after === null || Math.abs(after - before) < 1e-9 ? "text-muted" : after > before ? "text-bit" : "text-warn";
          return (
            <li key={m.u} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 px-3 py-2 text-sm">
              <span className="min-w-0 break-words font-medium text-fg">{names.get(m.u) ?? "?"}</span>
              <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs tabular-nums">
                <span className="font-mono">
                  <span className={m.from ? "text-muted" : "text-faint"}>{m.from ?? t("seatCompare.noSeat")}</span>
                  <span className="text-faint"> → </span>
                  <span className={m.to ? "font-semibold text-warn" : "font-semibold text-danger"}>{m.to ?? t("seatCompare.noSeat")}</span>
                </span>
                {(before !== null || after !== null) && (
                  <span className={tone}>
                    {t("seatCompare.wishes", { before: before === null ? "–" : pct(before), after: after === null ? "–" : pct(after) })}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
