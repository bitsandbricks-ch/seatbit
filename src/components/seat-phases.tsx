import type { T } from "@/i18n/translate";

/**
 * Where the seat plan stands, as a slim bar with one sentence: the only seat explanation on the Seats tab
 * (the whole flow is in "How this event works"). Phases: pick or wish → final → booked (only when the
 * leads book on the event's site).
 */
export function SeatPhases({
  t,
  picking,
  final,
  booking,
  booked,
  mySeat,
}: {
  t: T;
  /** Self pick is on for this event. */
  picking: boolean;
  final: boolean;
  /** The leads book the seats on the event's own site. */
  booking: boolean;
  booked: boolean;
  mySeat: string | null;
}) {
  const phases = [t(picking ? "seatPhases.pick" : "seatPhases.wish"), t("seatPhases.final"), ...(booking ? [t("seatPhases.booked")] : [])];
  const at = !final ? 0 : booking && !booked ? 1 : phases.length;
  const line = !final
    ? picking
      ? mySeat
        ? t("seatPhases.pickedLine", { seat: mySeat })
        : t("seatPhases.pickLine")
      : t("seatPhases.wishLine")
    : booking && !booked
      ? t("seatPhases.bookLine")
      : t("seatPhases.finalLine");
  return (
    <div className="mb-3">
      <ol className="flex gap-1.5" aria-label={t("seatPhases.label")}>
        {phases.map((p, i) => (
          <li key={p} className="min-w-0 flex-1 text-center" aria-current={i === at ? "step" : undefined}>
            <span aria-hidden className={`block h-1 rounded-full ${i <= at && at < phases.length ? (i === at ? "bg-bit" : "bg-bit/50") : at >= phases.length ? "bg-bit/50" : "bg-line"}`} />
            <span className={`mt-1 block truncate text-xs ${i === at ? "font-semibold text-bit" : i < at ? "text-muted" : "text-faint"}`}>
              {i < at && <span aria-hidden>✓ </span>}
              {p}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-sm text-muted">{line}</p>
    </div>
  );
}
