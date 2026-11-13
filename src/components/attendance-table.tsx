"use client";
import Link from "next/link";
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
import { Avatar } from "./avatar";
import type { AvatarData } from "@/lib/avatars";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n/translate";

export type AttendanceRow = {
  id: string;
  userId: string;
  nick: string;
  /** As the clan shows names. */
  name: string;
  /** Name "Nick" Surname, shown small when the clan's display leaves part of it out. */
  full: string;
  email: string;
  status: AttendanceStatus;
  paid: boolean;
  ticketBought: boolean;
  note: string;
  /** Participant number/ID at the LAN (lal.gg user ID, ticket number, ...), "" when not given. */
  lanAccount: string;
  /** Their profile on the event's site, built from the LAN ID; null without a link pattern or ID. */
  profileUrl: string | null;
  seatId: string | null;
  seat: string | null;
  /** Booked the seat on the event's own seat plan; null when the event has no seat plan link. */
  seatBooked?: boolean | null;
  avatar?: AvatarData;
};

const statuses: AttendanceStatus[] = ["going", "waitlist", "maybe", "declined"];
const statusLabel: Record<AttendanceStatus, MessageKey> = {
  going: "bot.you.going",
  waitlist: "bot.you.waitlist",
  maybe: "bot.you.maybe",
  declined: "bot.you.declined",
};
const statusOrder: Record<AttendanceStatus, number> = { going: 0, waitlist: 1, maybe: 2, declined: 3 };

/** Extra "who still needs something" filters on top of the status chips. */
const needs = {
  all: { label: "attendees.need.all", test: () => true },
  ticketOpen: { label: "attendees.need.ticketOpen", test: (r: AttendanceRow) => r.status !== "declined" && !r.paid && !r.ticketBought },
  noSeat: { label: "attendees.need.noSeat", test: (r: AttendanceRow) => r.status === "going" && !r.seatId },
  notBooked: {
    label: "attendees.need.notBooked",
    test: (r: AttendanceRow) => r.status === "going" && !!r.seatId && r.seatBooked === false,
  },
  noLanId: { label: "attendees.need.noLanId", test: (r: AttendanceRow) => r.status !== "declined" && !r.lanAccount },
  hasNote: { label: "attendees.need.hasNote", test: (r: AttendanceRow) => !!r.note },
} satisfies Record<string, { label: MessageKey; test: (r: AttendanceRow) => boolean }>;
type Need = keyof typeof needs;

const byText = (a: string | null, b: string | null) =>
  (a ?? "\uffff").localeCompare(b ?? "\uffff", undefined, { numeric: true, sensitivity: "base" });
const sorts = {
  status: { label: "attendees.col.status", cmp: (a: AttendanceRow, b: AttendanceRow) => statusOrder[a.status] - statusOrder[b.status] || byText(a.name, b.name) },
  nick: { label: "attendees.col.nick", cmp: (a: AttendanceRow, b: AttendanceRow) => byText(a.nick, b.nick) },
  name: { label: "attendees.col.name", cmp: (a: AttendanceRow, b: AttendanceRow) => byText(a.name, b.name) },
  seat: { label: "attendees.col.seat", cmp: (a: AttendanceRow, b: AttendanceRow) => byText(a.seat, b.seat) || byText(a.name, b.name) },
  lanId: { label: "attendees.col.lanId", cmp: (a: AttendanceRow, b: AttendanceRow) => byText(a.lanAccount || null, b.lanAccount || null) || byText(a.name, b.name) },
} satisfies Record<string, { label: MessageKey; cmp: (a: AttendanceRow, b: AttendanceRow) => number }>;
type Sort = keyof typeof sorts;

const PAGE_SIZE = 20;
const cols = "lg:grid-cols-[minmax(0,1.5fr)_9rem_6.5rem_11rem_8rem_minmax(0,1fr)_4.5rem]";

export function AttendanceTable({
  lanId,
  rows,
  others,
  seats,
  profileBase = null,
}: {
  /** "/clans/<slug>/members/" to link each nick to the member's profile. */
  profileBase?: string | null;
  lanId: string;
  seats: { id: string; label: string; userId: string | null; locked: boolean }[];
  rows: AttendanceRow[];
  others: { id: string; name: string }[];
}) {
  const t = useT();
  const [pending, start] = useTransition();
  const [addUser, setAddUser] = useState("");
  const [filter, setFilter] = useState<AttendanceStatus | "all">("all");
  const [need, setNeed] = useState<Need>("all");
  const [sort, setSort] = useState<Sort>("status");
  const run = (fn: () => Promise<unknown>) => start(async () => void (await fn()));

  const [q, setQ] = useState("");
  const visible = rows
    .filter((r) => (filter === "all" || r.status === filter) && needs[need].test(r))
    .filter((r) => !q || matches(`${r.nick} ${r.name} ${r.full} ${r.email} ${r.lanAccount} ${r.seat ?? ""} ${r.note}`, q))
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
            {s === "all" ? t("attendees.all") : t(statusLabel[s])}{" "}
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
          placeholder={t("attendees.search")}
          className={input}
          type="search"
          aria-label={t("attendees.searchLabel")}
        />
        <div className="grid grid-cols-2 gap-2 sm:contents">
          <select
            value={need}
            onChange={(e) => {
              setNeed(e.target.value as Need);
              pager.reset();
            }}
            className={`${input} sm:!w-auto`}
            aria-label={t("attendees.onlyShow")}
          >
            {Object.entries(needs).map(([k, v]) => (
              <option key={k} value={k}>
                {k === "all" ? t("attendees.showEveryone") : `${t(v.label)} (${rows.filter(v.test).length})`}
              </option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className={`${input} sm:!w-auto`}
            aria-label={t("attendees.sortBy")}
          >
            {Object.entries(sorts).map(([k, v]) => (
              <option key={k} value={k}>
                {t("attendees.sort", { by: t(v.label) })}
              </option>
            ))}
          </select>
        </div>
      </div>
      {narrowed && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
          {t("attendees.shown", { shown: visible.length, count: rows.length })}
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
            {t("attendees.clearFilters")}
          </button>
        </p>
      )}

      {/* Phones: one card per person. Desktop: one row per person in a table-like list. */}
      <ul className="space-y-2 lg:space-y-0 lg:divide-y lg:divide-line lg:overflow-hidden lg:rounded-card lg:border lg:border-line lg:bg-surface">
        <li aria-hidden className={`hidden gap-3 bg-raised/40 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted lg:grid ${cols}`}>
          <span>{t("attendees.col.member")}</span>
          <span>{t("attendees.col.status")}</span>
          <span>{t("attendees.col.seat")}</span>
          <span>{t("bot.ticket")}</span>
          <span>{t("attendees.col.lanId")}</span>
          <span>{t("attendees.col.note")}</span>
          <span />
        </li>
        {pager.items.map((r) => (
          <li
            key={r.id}
            className={`rounded-card border border-line bg-surface p-3 lg:grid ${cols} lg:items-center lg:gap-3 lg:rounded-none lg:border-0 lg:bg-transparent lg:px-4 lg:py-2 lg:hover:bg-raised/30`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5">
              <Avatar data={r.avatar} size={28} />
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {profileBase ? (
                    <Link href={`${profileBase}${r.userId}`} className="hover:text-bit hover:underline">
                      {r.name}
                    </Link>
                  ) : (
                    r.name
                  )}
                  {r.lanAccount && (
                    <span className="ml-2 font-mono text-xs font-normal text-muted lg:hidden">#{r.lanAccount}</span>
                  )}
                  {r.profileUrl && (
                    <a
                      href={r.profileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-2 text-xs font-normal text-bit hover:underline"
                      title={t("attendees.profileTitle")}
                    >
                      {t("attendees.profile")} ↗
                    </a>
                  )}
                </p>
                <p className="truncate text-xs text-muted">
                  {r.full !== r.name && `${r.full} · `}
                  {r.email}
                </p>
              </div>
              </div>
              <button
                className={`${btnGhost} shrink-0 !px-2 text-xs !text-danger lg:hidden`}
                onClick={() =>
                  confirm(t("attendees.removeConfirm", { name: r.name })) && run(() => adminRemoveAttendance(lanId, r.userId))
                }
              >
                {t("attendees.remove")}
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:contents">
              <label className="block">
                <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted lg:sr-only">{t("attendees.col.status")}</span>
                <select
                  key={r.status}
                  defaultValue={r.status}
                  onChange={(e) => run(() => adminSetAttendance(lanId, r.userId, e.target.value as AttendanceStatus))}
                  className={`${input} !py-1.5`}
                >
                  {statuses.map((s) => (
                    <option key={s} value={s}>
                      {t(statusLabel[s])}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted lg:sr-only">{t("attendees.col.seat")}</span>
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
                          {s.locked ? ` (${t("attendees.held")})` : ""}
                        </option>
                      ))}
                  </select>
                ) : (
                  <span className="block py-1.5 font-mono text-sm text-muted">{r.seat ?? "—"}</span>
                )}
                {r.seat && r.seatBooked != null && (
                  <span className={`mt-0.5 block text-[11px] ${r.seatBooked ? "text-bit" : "text-warn"}`}>
                    {r.seatBooked ? `✓ ${t("attendees.bookedOnSite")}` : t("attendees.notBookedOnSite")}
                  </span>
                )}
              </label>
              <label className="col-span-2 flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-line px-3 py-2 text-sm sm:col-span-1 sm:self-end lg:self-auto">
                <input
                  type="checkbox"
                  key={String(r.paid || r.ticketBought)}
                  defaultChecked={r.paid || r.ticketBought}
                  onChange={(e) => run(() => adminSetPaid(r.id, e.target.checked))}
                  className="h-5 w-5 accent-bit"
                />
                <span>
                  {t("attendees.ticketOk")}
                </span>
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted lg:sr-only">{t("attendees.col.lanId")}</span>
                <input
                  key={r.lanAccount}
                  defaultValue={r.lanAccount}
                  onBlur={(e) =>
                    e.target.value.trim() !== r.lanAccount && run(() => adminSetLanId(lanId, r.userId, e.target.value))
                  }
                  maxLength={40}
                  className={`${input} !py-1.5 font-mono`}
                  placeholder="—"
                  aria-label={t("attendees.lanIdOf", { name: r.name })}
                />
              </label>
              <label className="block sm:col-span-4 lg:col-span-1">
                <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted lg:sr-only">{t("attendees.col.note")}</span>
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
                confirm(t("attendees.removeConfirm", { name: r.name })) && run(() => adminRemoveAttendance(lanId, r.userId))
              }
            >
              {t("attendees.remove")}
            </button>
          </li>
        ))}
        {visible.length === 0 && <li className="py-6 text-center text-sm text-muted">{t("attendees.nobody")}</li>}
      </ul>
      <PagerBar pager={pager} />

      {others.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <select value={addUser} onChange={(e) => setAddUser(e.target.value)} className={`${input} min-w-0 flex-1 sm:!w-auto sm:flex-none`}>
            <option value="">{t("attendees.addMember")}</option>
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
            {t("attendees.addAsComing")}
          </button>
        </div>
      )}
      <details className="rounded-card border border-line bg-surface p-3">
        <summary className="cursor-pointer text-sm font-medium">{t("attendees.addGuest")}</summary>
        <p className="mb-3 mt-2 text-sm text-muted">{t("attendees.addGuestHint")}</p>
        <GuestForm action={addGuestToLan.bind(null, lanId)} submitLabel={t("attendees.addGuestSubmit")} />
      </details>
    </div>
  );
}
