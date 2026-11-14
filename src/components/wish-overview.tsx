import type { T } from "@/i18n/translate";
import type { WishItem } from "@/lib/seating";
import { Card, Pill } from "./ui";

export type WishRow = {
  userId: string;
  name: string;
  /** Full name, small below the display name. */
  full?: string;
  seat: string | null;
  items: WishItem[];
  score: number | null;
  note: string;
};

const pct = (x: number) => `${Math.round(x * 100)}%`;
const tone = (x: number) => (x >= 0.8 ? "emerald" : x >= 0.5 ? "amber" : "red");
const bar = (x: number) => (x >= 0.8 ? "bg-bit" : x >= 0.5 ? "bg-warn" : "bg-danger");

function Meter({ value, label }: { value: number; label: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)} aria-label={label}>
      <div className={`h-full rounded-full ${bar(value)}`} style={{ width: pct(value) }} />
    </div>
  );
}

/**
 * The leads' view of everyone's seat wishes against the current plan: one weighted score
 * overall and per member (a top wish counts more), lowest first so the people to look at
 * come up top, and each member's wishes in their ranked order.
 */
export function WishOverview({ rows, overall, t }: { rows: WishRow[]; overall: number | null; t: T }) {
  const scored = rows.filter((r) => r.score !== null);
  const happy = scored.filter((r) => r.score === 1).length;
  const open = rows.reduce((n, r) => n + r.items.filter((i) => i.ok === null).length, 0);
  const sorted = [...rows].sort(
    (a, b) => (a.score ?? 2) - (b.score ?? 2) || a.name.localeCompare(b.name),
  );
  const notes = rows.filter((r) => r.note);

  return (
    <Card
      id="wishes"
      title={t("wishOverview.title")}
      actions={overall !== null && <Pill tone={tone(overall)}>{t("wishOverview.met", { pct: pct(overall) })}</Pill>}
    >
      <p className="mb-3 text-sm text-muted">{t("wishOverview.hint")}</p>
      {overall !== null && (
        <div className="mb-4 space-y-1.5">
          <Meter value={overall} label={t("wishOverview.overall")} />
          <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
            <span>{t("wishOverview.allMet", { count: happy, total: scored.length })}</span>
            {open > 0 && <span>{t("wishOverview.open", { count: open })}</span>}
          </p>
        </div>
      )}
      {rows.length === 0 ? (
        <p className="text-sm text-muted">{t("wishOverview.none")}</p>
      ) : (
        <ul className="divide-y divide-line text-sm">
          {sorted.map((r) => (
            <li key={r.userId} className="py-2.5 first:pt-0 last:pb-0">
              <div className="mb-1.5 flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium leading-tight [overflow-wrap:anywhere]">{r.name}</p>
                  {r.full && r.full !== r.name && <p className="text-xs text-faint [overflow-wrap:anywhere]">{r.full}</p>}
                </div>
                <span className="shrink-0 text-xs text-muted">{r.seat ? t("wishOverview.seat", { seat: r.seat }) : t("wishOverview.noSeat")}</span>
                {r.score !== null ? (
                  <Pill tone={tone(r.score)}>{pct(r.score)}</Pill>
                ) : (
                  <Pill>{t("wishOverview.notYet")}</Pill>
                )}
              </div>
              {r.items.length > 0 && (
                <ol className="flex flex-wrap gap-1.5" aria-label={t("wishOverview.ranked", { name: r.name })}>
                  {r.items.map((i) => (
                    <li key={i.rank}>
                      <Pill tone={i.ok === null ? "zinc" : i.ok ? "emerald" : "red"}>
                        <span className="mr-1 font-semibold tabular-nums">{i.rank}.</span>
                        <span aria-hidden className="mr-1">
                          {i.ok === null ? "·" : i.ok ? "✓" : "✗"}
                        </span>
                        <span className="sr-only">{i.ok === null ? t("wishOverview.srOpen") : i.ok ? t("wishOverview.srMet") : t("wishOverview.srMissed")}</span>
                        {i.text}
                      </Pill>
                    </li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ul>
      )}
      {notes.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <p className="mb-2 text-xs uppercase tracking-wide text-faint">{t("manage.notes")}</p>
          <ul className="space-y-1 text-sm">
            {notes.map((r) => (
              <li key={r.userId}>
                <span className="font-medium">{r.name}:</span> <span className="text-fg/90">{r.note}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
