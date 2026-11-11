"use client";
import { useState, useTransition } from "react";
import {
  adminRemoveAttendance,
  adminSetAttendance,
  adminSetLanId,
  adminSetNote,
  adminSetPaid,
  adminSetSeatFor,
} from "@/app/actions";
import { addGuestToLan } from "@/app/clan-actions";
import type { AttendanceStatus } from "@/db/schema";
import { GuestForm } from "./guest-form";
import { PagerBar, matches, usePager } from "./pager";
import { btnGhost, btnSecondary, input } from "./ui";

export type AttendanceRow = {
  id: string;
  userId: string;
  nick: string;
  name: string;
  email: string;
  status: AttendanceStatus;
  paid: boolean;
  ticketBought: boolean;
  note: string;
  /** Participant number/ID at the LAN (lal.gg user ID, ticket number, ...), "" when not given. */
  lanAccount: string;
  seatId: string | null;
  seat: string | null;
};

const statuses: AttendanceStatus[] = ["going", "waitlist", "maybe", "declined"];
const statusLabel: Record<AttendanceStatus, string> = {
  going: "coming",
  waitlist: "waitlist",
  maybe: "unsure",
  declined: "not coming",
};
const statusOrder: Record<AttendanceStatus, number> = { going: 0, waitlist: 1, maybe: 2, declined: 3 };

/** Extra "who still needs something" filters on top of the status chips. */
const needs = {
  all: { label: "Everyone", test: () => true },
  ticketOpen: { label: "Ticket not confirmed", test: (r: AttendanceRow) => r.status !== "declined" && !r.paid },
  ticketReported: { label: "Ticket reported, confirm it", test: (r: AttendanceRow) => r.ticketBought && !r.paid },
  noSeat: { label: "Coming, no seat yet", test: (r: AttendanceRow) => r.status === "going" && !r.seatId },
  noLanId: { label: "No LAN ID", test: (r: AttendanceRow) => r.status !== "declined" && !r.lanAccount },
  hasNote: { label: "Has a note", test: (r: AttendanceRow) => !!r.note },
} satisfies Record<string, { label: string; test: (r: AttendanceRow) => boolean }>;
type Need = keyof typeof needs;

const byText = (a: string | null, b: string | null) =>
  (a ?? "\uffff").localeCompare(b ?? "\uffff", undefined, { numeric: true, sensitivity: "base" });
const sorts = {
  status: { label: "Status", cmp: (a: AttendanceRow, b: AttendanceRow) => statusOrder[a.status] - statusOrder[b.status] || byText(a.nick, b.nick) },
  nick: { label: "Nick", cmp: (a: AttendanceRow, b: AttendanceRow) => byText(a.nick, b.nick) },
  name: { label: "Name", cmp: (a: AttendanceRow, b: AttendanceRow) => byText(a.name, b.name) },
  seat: { label: "Seat", cmp: (a: AttendanceRow, b: AttendanceRow) => byText(a.seat, b.seat) || byText(a.nick, b.nick) },
  lanId: { label: "LAN ID", cmp: (a: AttendanceRow, b: AttendanceRow) => byText(a.lanAccount || null, b.lanAccount || null) || byText(a.nick, b.nick) },
} satisfies Record<string, { label: string; cmp: (a: AttendanceRow, b: AttendanceRow) => number }>;
type Sort = keyof typeof sorts;

const PAGE_SIZE = 20;
const cols = "lg:grid-cols-[minmax(0,1.5fr)_9rem_6.5rem_11rem_8rem_minmax(0,1fr)_4.5rem]";

export function AttendanceTable({
  lanId,
  rows,
  others,
  seats,
}: {
  lanId: string;
  seats: { id: string; label: string; userId: string | null; locked: boolean }[];
  rows: AttendanceRow[];
  others: { id: string; name: string }[];
}) {
  const [pending, start] = useTransition();
  const [addUser, setAddUser] = useState("");
  const [filter, setFilter] = useState<AttendanceStatus | "all">("all");
  const [need, setNeed] = useState<Need>("all");
  const [sort, setSort] = useState<Sort>("status");
  const run = (fn: () => Promise<unknown>) => start(async () => void (await fn()));

  const [q, setQ] = useState("");
  const visible = rows
    .filter((r) => (filter === "all" || r.status === filter) && needs[need].test(r))
    .filter((r) => !q || matches(`${r.nick} ${r.name} ${r.email} ${r.lanAccount} ${r.seat ?? ""} ${r.note}`, q))
    .sort(sorts[sort].cmp);
  const pager = usePager(visible, PAGE_SIZE);
  const narrowed = filter !== "all" || need !== "all" || q !== "";

  return (
    <div className={`space-y-4 ${pending ? "opacity-70" : ""}`}>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 text-sm sm:mx-0 sm:flex-wrap sm:px-0">
        {(["all", ...statuses] as const).map((s) => (
          <button
            key={s}
            onClick={() => {
              setFilter(s);
              pager.reset();
            }}
            className={`${filter === s ? btnSecondary + " !border-bit" : btnGhost} shrink-0 !rounded-full !py-1`}
          >
            {s === "all" ? "all" : statusLabel[s]}{" "}
            <span className="text-faint">{s === "all" ? rows.length : rows.filter((r) => r.status === s).length}</span>
          </button>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            pager.reset();
          }}
          placeholder="Search nick, name, email, LAN ID, seat or note"
          className={input}
          type="search"
          aria-label="Search attendees"
        />
        <div className="grid grid-cols-2 gap-2 sm:contents">
          <select
            value={need}
            onChange={(e) => {
              setNeed(e.target.value as Need);
              pager.reset();
            }}
            className={`${input} sm:!w-auto`}
            aria-label="Only show"
          >
            {Object.entries(needs).map(([k, v]) => (
              <option key={k} value={k}>
                {k === "all" ? "Show: everyone" : `${v.label} (${rows.filter(v.test).length})`}
              </option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className={`${input} sm:!w-auto`}
            aria-label="Sort by"
          >
            {Object.entries(sorts).map(([k, v]) => (
              <option key={k} value={k}>
                Sort: {v.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {narrowed && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
          {visible.length} of {rows.length} shown
          <button
            type="button"
            className={`${btnGhost} !min-h-0 !px-2 !py-0.5 text-xs`}
            onClick={() => {
              setFilter("all");
              setNeed("all");
              setQ("");
              pager.reset();
            }}
          >
            Clear filters
          </button>
        </p>
      )}

      {/* Phones: one card per person. Desktop: one row per person in a table-like list. */}
      <ul className="space-y-2 lg:space-y-0 lg:divide-y lg:divide-line lg:overflow-hidden lg:rounded-card lg:border lg:border-line lg:bg-surface">
        <li aria-hidden className={`hidden gap-3 bg-raised/40 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted lg:grid ${cols}`}>
          <span>Member</span>
          <span>Status</span>
          <span>Seat</span>
          <span>Ticket</span>
          <span>LAN ID</span>
          <span>Note</span>
          <span />
        </li>
        {pager.items.map((r) => (
          <li
            key={r.id}
            className={`rounded-card border border-line bg-surface p-3 lg:grid ${cols} lg:items-center lg:gap-3 lg:rounded-none lg:border-0 lg:bg-transparent lg:px-4 lg:py-2 lg:hover:bg-raised/30`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {r.nick}
                  {r.lanAccount && (
                    <span className="ml-2 font-mono text-xs font-normal text-muted lg:hidden">#{r.lanAccount}</span>
                  )}
                </p>
                <p className="truncate text-xs text-muted">
                  {r.name} · {r.email}
                </p>
              </div>
              <button
                className={`${btnGhost} shrink-0 !px-2 text-xs !text-danger lg:hidden`}
                onClick={() =>
                  confirm(`Remove ${r.nick} from this LAN?`) && run(() => adminRemoveAttendance(lanId, r.userId))
                }
              >
                Remove
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:contents">
              <label className="block">
                <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted lg:sr-only">Status</span>
                <select
                  key={r.status}
                  defaultValue={r.status}
                  onChange={(e) => run(() => adminSetAttendance(lanId, r.userId, e.target.value as AttendanceStatus))}
                  className={`${input} !py-1.5`}
                >
                  {statuses.map((s) => (
                    <option key={s} value={s}>
                      {statusLabel[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted lg:sr-only">Seat</span>
                {r.status === "going" && seats.length > 0 ? (
                  <select
                    key={r.seatId ?? "none"}
                    defaultValue={r.seatId ?? ""}
                    onChange={(e) => run(() => adminSetSeatFor(lanId, r.userId, e.target.value || null))}
                    className={`${input} !py-1.5 font-mono`}
                  >
                    <option value="">—</option>
                    {seats
                      .filter((s) => !s.userId || s.userId === r.userId)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                          {s.locked ? " (held)" : ""}
                        </option>
                      ))}
                  </select>
                ) : (
                  <span className="block py-1.5 font-mono text-sm text-muted">{r.seat ?? "—"}</span>
                )}
              </label>
              <label className="col-span-2 flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-line px-3 py-2 text-sm sm:col-span-1 sm:self-end lg:self-auto">
                <input
                  type="checkbox"
                  key={String(r.paid)}
                  defaultChecked={r.paid}
                  onChange={(e) => run(() => adminSetPaid(r.id, e.target.checked))}
                  className="h-5 w-5 accent-bit"
                />
                <span>
                  Ticket ok
                  {r.ticketBought && !r.paid && <span className="ml-1 text-xs text-warn">(reported)</span>}
                </span>
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted lg:sr-only">LAN ID</span>
                <input
                  key={r.lanAccount}
                  defaultValue={r.lanAccount}
                  onBlur={(e) =>
                    e.target.value.trim() !== r.lanAccount && run(() => adminSetLanId(lanId, r.userId, e.target.value))
                  }
                  maxLength={40}
                  className={`${input} !py-1.5 font-mono`}
                  placeholder="—"
                  aria-label={`LAN ID of ${r.nick}`}
                />
              </label>
              <label className="block sm:col-span-4 lg:col-span-1">
                <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted lg:sr-only">Note</span>
                <input
                  defaultValue={r.note}
                  onBlur={(e) => e.target.value !== r.note && run(() => adminSetNote(r.id, e.target.value))}
                  className={`${input} !py-1.5`}
                  placeholder="—"
                />
              </label>
            </div>
            <button
              className={`${btnGhost} !hidden !px-2 text-xs hover:!text-danger lg:!inline-flex`}
              onClick={() =>
                confirm(`Remove ${r.nick} from this LAN?`) && run(() => adminRemoveAttendance(lanId, r.userId))
              }
            >
              Remove
            </button>
          </li>
        ))}
        {visible.length === 0 && <li className="py-6 text-center text-sm text-muted">Nobody here.</li>}
      </ul>
      <PagerBar pager={pager} />

      {others.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <select value={addUser} onChange={(e) => setAddUser(e.target.value)} className={`${input} min-w-0 flex-1 sm:!w-auto sm:flex-none`}>
            <option value="">Add a member…</option>
            {others.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <button
            disabled={!addUser}
            className={btnSecondary}
            onClick={() =>
              run(async () => {
                await adminSetAttendance(lanId, addUser, "going");
                setAddUser("");
              })
            }
          >
            Add as coming
          </button>
        </div>
      )}
      <details className="rounded-card border border-line bg-surface p-3">
        <summary className="cursor-pointer text-sm font-medium">Add a guest without an account</summary>
        <p className="mb-3 mt-2 text-sm text-zinc-400">
          For people not on Seatbit yet. They&apos;re signed up as coming and can get a seat right away. Their personal link is
          under Clan settings › Members: when they sign in with Discord through it, they take over this spot.
        </p>
        <GuestForm action={addGuestToLan.bind(null, lanId)} />
      </details>
    </div>
  );
}
