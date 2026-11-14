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
const text = (x: number) => (x >= 0.8 ? "text-bit" : x >= 0.5 ? "text-warn" : "text-danger");
const bar = (x: number) => (x >= 0.8 ? "bg-bit" : x >= 0.5 ? "bg-warn" : "bg-danger");

/**
 * The leads' view of everyone's seat wishes against the current plan: one weighted score
 * overall and per member (a top wish counts more), lowest first so the people to look at
 * come up top. One calm row per member: name, seat, wishes in their order, score.
 */
export function WishOverview({ rows, overall, t }: { rows: WishRow[]; overall: number | null; t: T }) {
  const scored = rows.filter((r) => r.score !== null);
  const happy = scored.filter((r) => r.score === 1).length;
  const open = rows.reduce((n, r) => n + r.items.filter((i) => i.ok === null).length, 0);
  const sorted = [...rows].sort((a, b) => (a.score ?? 2) - (b.score ?? 2) || a.name.localeCompare(b.name));

  return (
    <Card
      id="wishes"
      className="lg:col-span-2"
      title={t("wishOverview.title")}
      actions={overall !== null && <Pill tone={tone(overall)}>{t("wishOverview.met", { pct: pct(overall) })}</Pill>}
    >
      {rows.length === 0 ? (
        <p className="text-sm text-muted">{t("wishOverview.none")}</p>
      ) : (
        <>
          <div className="mb-3 space-y-1.5">
            {overall !== null && (
              <div
                className="h-1.5 w-full overflow-hidden rounded-full bg-line"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(overall * 100)}
                aria-label={t("wishOverview.overall")}
              >
                <div className={`h-full rounded-full ${bar(overall)}`} style={{ width: pct(overall) }} />
              </div>
            )}
            <p className="text-xs text-muted">
              {[
                scored.length > 0 && t("wishOverview.allMet", { count: happy, total: scored.length }),
                open > 0 && t("wishOverview.open", { count: open }),
                t("wishOverview.hint"),
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <ul className="divide-y divide-line text-sm">
            {sorted.map((r) => (
              <li
                key={r.userId}
                className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 py-2.5 sm:grid-cols-[12rem_3.5rem_minmax(0,1fr)_3.5rem] sm:items-baseline"
              >
                <div className="min-w-0">
                  <p className="font-medium leading-tight [overflow-wrap:anywhere]">
                    {r.name}
                    <span className="ml-1.5 font-mono text-xs font-normal text-faint sm:hidden">{r.seat ?? t("wishOverview.noSeat")}</span>
                  </p>
                  {r.full && r.full !== r.name && <p className="text-xs text-faint [overflow-wrap:anywhere]">{r.full}</p>}
                </div>
                <span className="hidden font-mono text-xs text-muted sm:block" title={r.seat ? undefined : t("wishOverview.noSeat")}>{r.seat ?? "–"}</span>
                <div className="col-span-2 row-start-2 min-w-0 sm:col-span-1 sm:col-start-3 sm:row-start-1">
                  {r.items.length > 0 && (
                    <ol className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs" aria-label={t("wishOverview.ranked", { name: r.name })}>
                      {r.items.map((i) => (
                        <li key={i.rank} className={i.ok === false ? "text-fg" : "text-muted"}>
                          <span className="mr-0.5 tabular-nums text-faint">{i.rank}</span>
                          <span aria-hidden className={`mr-1 font-semibold ${i.ok === null ? "text-faint" : i.ok ? "text-bit" : "text-danger"}`}>
                            {i.ok === null ? "·" : i.ok ? "✓" : "✗"}
                          </span>
                          <span className="sr-only">{i.ok === null ? t("wishOverview.srOpen") : i.ok ? t("wishOverview.srMet") : t("wishOverview.srMissed")}</span>
                          {i.text}
                        </li>
                      ))}
                    </ol>
                  )}
                  {r.note && <p className="mt-0.5 text-xs italic text-muted [overflow-wrap:anywhere]">“{r.note}”</p>}
                </div>
                <span className="col-start-2 row-start-1 text-right text-xs tabular-nums sm:col-start-4">
                  {r.score !== null ? (
                    <span className={`font-semibold ${text(r.score)}`}>{pct(r.score)}</span>
                  ) : (
                    <span className="text-faint">–</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
