"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Avatar } from "@/components/avatar";
import { DiscordBadge, type DiscordState } from "@/components/discord-badge";
import { PagerBar, matches, usePager } from "@/components/pager";
import { Pill, Verified, btnGhost, btnSecondary, input } from "@/components/ui";
import { useT } from "@/i18n/client";
import type { AvatarData } from "@/lib/avatars";

export type AdminUserRow = {
  id: string;
  /** Name "Nick" Surname. */
  name: string;
  /** Everything the search looks at: name, nicks, email, Discord username. */
  search: string;
  /** Email, or the guest's clan. */
  sub: string;
  avatar: AvatarData;
  /** Platform role label for staff. */
  role?: string;
  isStaff: boolean;
  isGuest: boolean;
  suspended: boolean;
  discord?: DiscordState;
  clans: number;
  /** "Thu 29.10.2026", or null when never seen. */
  lastActive: string | null;
  /** YYYY-MM-DD for sorting. */
  lastDay: string;
  createdAt: number;
  /** Role picker and suspend, rendered on the server. */
  actions: ReactNode;
};

type Filter = "all" | "staff" | "members" | "guests" | "discord" | "noDiscord" | "suspended";
const FILTERS: { id: Filter; test: (u: AdminUserRow) => boolean }[] = [
  { id: "all", test: () => true },
  { id: "staff", test: (u) => u.isStaff },
  { id: "members", test: (u) => !u.isGuest },
  { id: "guests", test: (u) => u.isGuest },
  { id: "discord", test: (u) => !!u.discord },
  { id: "noDiscord", test: (u) => !u.isGuest && !u.discord },
  { id: "suspended", test: (u) => u.suspended },
];
type Sort = "name" | "active" | "new";
const SORTS: Record<Sort, (a: AdminUserRow, b: AdminUserRow) => number> = {
  name: (a, b) => a.name.localeCompare(b.name),
  active: (a, b) => b.lastDay.localeCompare(a.lastDay) || a.name.localeCompare(b.name),
  new: (a, b) => b.createdAt - a.createdAt,
};

/** Admin → Users: every account with search, filters, sorting and pages; actions per row. */
export function AdminUserList({ users }: { users: AdminUserRow[] }) {
  const t = useT();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("name");
  const test = FILTERS.find((f) => f.id === filter)!.test;
  const shown = users.filter((u) => test(u) && (!q || matches(u.search, q))).sort(SORTS[sort]);
  const pager = usePager(shown, 25);
  return (
    <div className="space-y-3">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 text-sm sm:mx-0 sm:flex-wrap sm:px-0">
        {FILTERS.filter((f) => f.id === "all" || users.some(f.test)).map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => {
              setFilter(f.id);
              pager.reset();
            }}
            className={`${filter === f.id ? btnSecondary + " !border-bit" : btnGhost} shrink-0 !rounded-full !py-1`}
          >
            {t(`adminUsers.filter.${f.id}`)} <span className="text-faint">{users.filter(f.test).length}</span>
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            pager.reset();
          }}
          placeholder={t("adminUsers.search")}
          aria-label={t("adminUsers.search")}
          className={input}
          type="search"
        />
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label={t("adminUsers.sort")} className={`${input} !w-auto`}>
          {(Object.keys(SORTS) as Sort[]).map((s) => (
            <option key={s} value={s}>
              {t(`adminUsers.sortBy.${s}`)}
            </option>
          ))}
        </select>
      </div>
      <ul className="divide-y divide-line">
        {pager.items.map((u) => (
          <li key={u.id} className="flex min-h-14 flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2">
            <Link href={`/admin/users/${u.id}`} className="group flex min-w-0 items-center gap-3">
              <Avatar data={u.avatar} size={36} />
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                  <span className="truncate font-medium group-hover:text-bit">{u.name}</span>
                  {!u.isGuest && <Verified />}
                  {u.discord && <DiscordBadge state={u.discord} t={t} />}
                  {u.role && <Pill tone="emerald">{u.role}</Pill>}
                  {u.isGuest && <Pill>{t("clanSettings.guest")}</Pill>}
                  {u.suspended && <Pill tone="red">{t("moderation.suspended")}</Pill>}
                </span>
                <span className="block truncate text-xs text-muted">
                  {u.sub} · {t("adminUsers.clans", { count: u.clans })}
                  {u.lastActive && ` · ${t("adminUsers.active", { date: u.lastActive })}`}
                </span>
              </span>
            </Link>
            {u.actions}
          </li>
        ))}
        {shown.length === 0 && <li className="py-6 text-center text-sm text-muted">{t("adminUsers.none")}</li>}
      </ul>
      <PagerBar pager={pager} />
    </div>
  );
}
