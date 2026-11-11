"use client";
import { useState, useTransition } from "react";
import {
  adminRemoveAttendance,
  adminSetAttendance,
  adminSetNote,
  adminSetPaid,
  adminSetSeatFor,
} from "@/app/actions";
import { addGuestToLan } from "@/app/clan-actions";
import type { AttendanceStatus } from "@/db/schema";
import { GuestForm } from "./guest-form";
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
  const run = (fn: () => Promise<unknown>) => start(async () => void (await fn()));
  const shown = rows.filter((r) => filter === "all" || r.status === filter);

  const [q, setQ] = useState("");
  const visible = shown.filter(
    (r) => !q || `${r.nick} ${r.name} ${r.email}`.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className={`space-y-4 ${pending ? "opacity-70" : ""}`}>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 text-sm sm:mx-0 sm:flex-wrap sm:px-0">
        {(["all", ...statuses] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`${filter === s ? btnSecondary + " !border-bit" : btnGhost} shrink-0 !rounded-full !py-1`}
          >
            {s === "all" ? "all" : statusLabel[s]}{" "}
            <span className="text-zinc-500">{s === "all" ? rows.length : rows.filter((r) => r.status === s).length}</span>
          </button>
        ))}
      </div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search nick, name or email"
        className={input}
        type="search"
      />

      <ul className="space-y-2">
        {visible.map((r) => (
          <li key={r.id} className="rounded-card border border-line bg-surface p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{r.nick}</p>
                <p className="truncate text-xs text-zinc-500">
                  {r.name} · {r.email}
                </p>
              </div>
              <button
                className={`${btnGhost} shrink-0 !px-2 text-xs text-red-300`}
                onClick={() =>
                  confirm(`Remove ${r.nick} from this LAN?`) && run(() => adminRemoveAttendance(lanId, r.userId))
                }
              >
                Remove
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <label className="block">
                <span className="mb-1 block text-[11px] uppercase tracking-wide text-zinc-500">Status</span>
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
                <span className="mb-1 block text-[11px] uppercase tracking-wide text-zinc-500">Seat</span>
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
                  <span className="block py-1.5 font-mono text-sm text-zinc-500">{r.seat ?? "—"}</span>
                )}
              </label>
              <label className="col-span-2 flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm sm:col-span-1 sm:self-end">
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
              <label className="col-span-2 block sm:col-span-1">
                <span className="mb-1 block text-[11px] uppercase tracking-wide text-zinc-500">Note</span>
                <input
                  defaultValue={r.note}
                  onBlur={(e) => e.target.value !== r.note && run(() => adminSetNote(r.id, e.target.value))}
                  className={`${input} !py-1.5`}
                  placeholder="—"
                />
              </label>
            </div>
          </li>
        ))}
        {visible.length === 0 && <li className="py-6 text-center text-sm text-zinc-500">Nobody here.</li>}
      </ul>

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
          For people not on Seatbit yet. They&apos;re signed up as coming and can get a seat right away. Add their email
          and Seatbit mails them an invite; signing in with Discord on that address takes over this spot. Their personal
          link is also under Clan settings › Members.
        </p>
        <GuestForm action={addGuestToLan.bind(null, lanId)} submitLabel="Add guest as coming" />
      </details>
    </div>
  );
}
