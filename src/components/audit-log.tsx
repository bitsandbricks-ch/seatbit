import type { ReactNode } from "react";
import Link from "next/link";
import type { AuditEntry } from "@/db/schema";
import { AUDIT_GROUPS, AUDIT_PAGE_SIZE, type AuditGroup, auditNames, describeAudit } from "@/lib/audit";
import { getAvatars } from "@/lib/avatars";
import { fmtDate, relative } from "@/lib/format";
import { Avatar } from "./avatar";
import { EmptyState, btnGhost, btnSecondary } from "./ui";
import type { T } from "@/i18n/translate";

export type AuditFilter = { group?: AuditGroup; lan?: string; clan?: string; page?: number };

/** Reads ?group=, ?lan=, ?clan= and ?page= from the search params. */
export function parseAuditFilter(sp: Record<string, string | string[] | undefined>): AuditFilter {
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const group = s("group");
  return {
    group: group && group in AUDIT_GROUPS ? (group as AuditGroup) : undefined,
    lan: s("lan"),
    clan: s("clan"),
    page: Math.max(0, Number(s("page") ?? 1) - 1) || 0,
  };
}

/**
 * The audit log list: who changed what, when. Filters (kind of change, event or clan) and pages are
 * plain links, so the page works without JavaScript and filters can be shared as URLs.
 */
export function AuditLog({
  rows,
  total,
  page,
  pages,
  filter,
  href,
  events,
  clans,
  clanNames,
  keep = {},
  t,
}: {
  t: T;
  /** Extra query values the filter form keeps (e.g. tab=log). */
  keep?: Record<string, string>;
  rows: AuditEntry[];
  total: number;
  page: number;
  pages: number;
  filter: AuditFilter;
  /** Builds the URL for a filter. */
  href: (f: AuditFilter) => string;
  /** Events to filter by (clan log). */
  events?: { id: string; name: string }[];
  /** Clans to filter by (platform log). */
  clans?: { id: string; name: string }[];
  /** Shows the clan on each entry (platform log). */
  clanNames?: Map<string, string>;
}) {
  const chip = (on: boolean) =>
    `inline-flex min-h-8 items-center whitespace-nowrap rounded-full border px-3 text-sm transition ${
      on ? "border-bit bg-bit/10 text-fg" : "border-line text-muted hover:text-fg"
    }`;
  const base = { ...filter, page: undefined };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("auditLog.kind")}>
        <Link href={href({ ...base, group: undefined })} className={chip(!filter.group)} scroll={false}>
          {t("auditLog.all")}
        </Link>
        {(Object.keys(AUDIT_GROUPS) as AuditGroup[]).map((g) => (
          <Link key={g} href={href({ ...base, group: g })} className={chip(filter.group === g)} scroll={false}>
            {t(`auditLog.group.${g}`)}
          </Link>
        ))}
      </div>
      {((events && events.length > 0) || (clans && clans.length > 0)) && (
        <form className="flex flex-wrap items-center gap-2 text-sm" action="">
          {Object.entries(keep).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          {filter.group && <input type="hidden" name="group" value={filter.group} />}
          {events && filter.clan && <input type="hidden" name="clan" value={filter.clan} />}
          {clans && filter.lan && <input type="hidden" name="lan" value={filter.lan} />}
          {events && events.length > 0 && (
            <label className="flex min-w-0 items-center gap-2">
              <span className="text-muted">{t("stats.event")}</span>
              <select name="lan" defaultValue={filter.lan ?? ""} className="min-h-10 min-w-0 rounded-md border border-line bg-raised px-2 text-fg">
                <option value="">{t("auditLog.allEvents")}</option>
                {events.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {clans && clans.length > 0 && (
            <label className="flex min-w-0 items-center gap-2">
              <span className="text-muted">Clan</span>
              <select name="clan" defaultValue={filter.clan ?? ""} className="min-h-10 min-w-0 rounded-md border border-line bg-raised px-2 text-fg">
                <option value="">{t("auditLog.allClans")}</option>
                <option value="none">{t("auditLog.platformOnly")}</option>
                {clans.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button className={btnSecondary}>{t("auditLog.show")}</button>
        </form>
      )}

      {rows.length === 0 ? (
        <EmptyState icon="box" title={t("auditLog.empty")}>
          {t("auditLog.emptyHint")}
        </EmptyState>
      ) : (
        <AuditEntryList rows={rows} t={t} clanNames={clanNames} />
      )}

      {pages > 1 && (
        <nav aria-label={t("pager.pages")} className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-muted">
            {page * AUDIT_PAGE_SIZE + 1}–{Math.min(total, (page + 1) * AUDIT_PAGE_SIZE)} <span className="text-faint">{t("pager.of", { total })}</span>
          </span>
          <span className="flex gap-1">
            {page > 0 && (
              <Link href={href({ ...filter, page: page - 1 })} className={btnGhost}>
                ‹ {t("auditLog.newer")}
              </Link>
            )}
            {page < pages - 1 && (
              <Link href={href({ ...filter, page: page + 1 })} className={btnGhost}>
                {t("auditLog.older")} ›
              </Link>
            )}
          </span>
        </nav>
      )}
    </div>
  );
}

/** Query string for a filter (page numbers start at 1 in the URL). */
export function auditQuery(f: AuditFilter, extra: Record<string, string> = {}) {
  const q = new URLSearchParams(extra);
  if (f.group) q.set("group", f.group);
  if (f.lan) q.set("lan", f.lan);
  if (f.clan) q.set("clan", f.clan);
  if (f.page) q.set("page", String(f.page + 1));
  return q.toString();
}

/**
 * The entries themselves: avatar, who, what, when. Shared by the audit logs and the
 * plan history on the seats tab; `detail` adds a line under an entry.
 */
export function AuditEntryList({
  rows,
  t,
  clanNames,
  detail,
}: {
  rows: AuditEntry[];
  t: T;
  clanNames?: Map<string, string>;
  detail?: (r: AuditEntry, name: ReturnType<typeof auditNames>) => ReactNode;
}) {
  const name = auditNames(rows, t("audit.someone"));
  const loc = t.locale;
  const avatars = getAvatars(rows.map((r) => r.actorId).filter((x): x is string => !!x));
  const now = new Date();
  return (
    <ol className="-my-1 divide-y divide-line">
      {rows.map((r) => (
        <li key={r.id} className="flex gap-3 py-2.5">
          <span className="mt-0.5 shrink-0">
            {r.actorId ? (
              <Avatar data={avatars.get(r.actorId)} size={28} ring={false} />
            ) : (
              <span className="grid h-7 w-7 place-items-center rounded-full bg-raised text-xs text-muted" aria-hidden>
                ⏱
              </span>
            )}
          </span>
          <span className="min-w-0 flex-1 text-sm">
            <span className="block">
              <span className="font-medium text-fg">{r.actorId ? name(r.actorId, t("auditLog.deletedMember")) : "Seatbit"}</span>{" "}
              <span className="text-fg/90">{describeAudit(r, name, t)}</span>
            </span>
            <span className="block text-xs text-muted">
              <time dateTime={r.at.toISOString()} title={fmtDate(r.at, loc)}>
                {fmtDate(r.at, loc)}
              </time>
              <span className="text-faint"> · {relative(r.at, now, loc)}</span>
              {clanNames && <span className="text-faint"> · {r.clanId ? clanNames.get(r.clanId) ?? t("auditLog.deletedClan") : t("auditLog.platform")}</span>}
            </span>
            {detail?.(r, name)}
          </span>
        </li>
      ))}
    </ol>
  );
}
