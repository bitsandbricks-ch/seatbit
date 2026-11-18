import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "./ui";
import { HiddenIcon } from "./tabs";

export type GlanceRow = {
  id: string;
  label: string;
  /** Left out: nothing to open yet (e.g. a section that opens later); the row is plain text. */
  href?: string;
  /** One short line: why you'd open it ("You owe CHF 12", "14 coming"). */
  status?: ReactNode;
  /** Something waits for you there: yellow dot, yellow status. */
  dot?: boolean;
  /** Only leads see it for now: a crossed-out eye, muted. The text says why. */
  hidden?: string;
};

/**
 * A page's tabs at a glance, on its overview: one compact row per tab with what's going on there. The rows are plain
 * links to ?tab=<id>, so with <ClientTabs> they switch tabs instantly.
 */
export function GlanceList({ title, rows, actions }: { title: string; rows: GlanceRow[]; actions?: ReactNode }) {
  if (rows.length === 0) return null;
  return (
    <Card title={title} actions={actions}>
      <ul className="-my-1 divide-y divide-line">
        {rows.map((r) => (
          <li key={r.id}>
            {r.href ? (
              <Link href={r.href} scroll={false} title={r.hidden} className={`group flex min-h-11 items-center gap-3 py-1.5 text-sm ${r.hidden ? "opacity-60" : ""}`}>
                <span className="flex w-28 shrink-0 items-center gap-1.5 font-medium text-fg group-hover:text-bit">
                  {r.hidden && <HiddenIcon />}
                  {r.label}
                  {r.hidden && <span className="sr-only">, {r.hidden}</span>}
                </span>
                <span className={`min-w-0 flex-1 truncate ${r.dot ? "text-warn" : "text-muted"}`}>{r.status}</span>
                {r.dot && <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-warn" />}
                <svg viewBox="0 0 16 16" width={12} height={12} aria-hidden className="shrink-0 text-faint group-hover:text-bit">
                  <path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="M6 4l4 4-4 4" />
                </svg>
              </Link>
            ) : (
              <div className="flex min-h-11 items-center gap-3 py-1.5 text-sm">
                <span className="w-28 shrink-0 font-medium text-muted">{r.label}</span>
                <span className="min-w-0 flex-1 truncate text-faint">{r.status}</span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
