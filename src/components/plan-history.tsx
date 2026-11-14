import type { AuditEntry } from "@/db/schema";
import type { T } from "@/i18n/translate";
import { decodeMoves } from "@/lib/seating";
import { AuditEntryList } from "./audit-log";
import { Card } from "./ui";

/** Shown open; the rest sits behind one "older changes" toggle. */
const RECENT = 6;

/**
 * The leads' plan history: the event's seat changes from the audit log, and for each
 * re-plan who moved from which seat to which, so a lead can see what an auto re-plan did.
 */
export function PlanHistory({ rows: all, names, t }: { rows: AuditEntry[]; names: Map<string, string>; t: T }) {
  // Every entry is about this event: leave out "at <event>".
  const rows = all.map((r) => ({ ...r, data: { ...r.data, event: undefined } }));
  const detail = (r: AuditEntry, name: (id: string | null | undefined, fallback?: string) => string) => {
    if (r.action !== "seat.auto") return null;
    // Entries from before the history kept moves have no list: say nothing rather than "nobody".
    if (!Array.isArray(r.data.moves)) return null;
    const moves = decodeMoves(r.data.moves);
    if (moves.length === 0) return <span className="mt-0.5 block text-xs text-faint">{t("planHistory.nobodyMoved")}</span>;
    return (
      <span className="mt-0.5 block text-xs text-muted">
        <span className="text-faint">{t("planHistory.moved", { count: moves.length })} </span>
        {moves
          .map((m) =>
            t("planHistory.move", {
              name: names.get(m.u) ?? name(m.u),
              from: m.from ?? t("planHistory.noSeat"),
              to: m.to ?? t("planHistory.noSeat"),
            }),
          )
          .join(", ")}
      </span>
    );
  };
  const older = rows.slice(RECENT);
  return (
    <Card id="plan-history" title={t("planHistory.title")}>
      <p className="mb-3 text-sm text-muted">{t("planHistory.hint")}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">{t("planHistory.none")}</p>
      ) : (
        <>
          <AuditEntryList rows={rows.slice(0, RECENT)} t={t} detail={detail} />
          {older.length > 0 && (
            <details className="mt-2 border-t border-line pt-2">
              <summary className="cursor-pointer text-sm text-muted hover:text-fg">{t("planHistory.older", { count: older.length })}</summary>
              <div className="mt-1">
                <AuditEntryList rows={older} t={t} detail={detail} />
              </div>
            </details>
          )}
        </>
      )}
    </Card>
  );
}
