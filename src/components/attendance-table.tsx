"use client";
import { useState, useTransition } from "react";
import {
  adminRemoveAttendance,
  adminSetAttendance,
  adminSetNote,
  adminSetPaid,
  adminSetSeatFor,
} from "@/app/actions";
import type { AttendanceStatus } from "@/db/schema";
import { btnGhost, btnSecondary, input, StatusBadge } from "./ui";

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

  return (
    <div className={`space-y-4 ${pending ? "opacity-70" : ""}`}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-zinc-500">Show</span>
        {(["all", ...statuses] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={filter === s ? `${btnSecondary} !py-1` : `${btnGhost} !py-1`}
          >
            {s === "all" ? "all" : statusLabel[s]} ({s === "all" ? rows.length : rows.filter((r) => r.status === s).length})
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-zinc-500">
            <tr>
              <th className="py-2">Nick</th>
              <th>Status</th>
              <th>Ticket</th>
              <th>Seat</th>
              <th>Note</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {shown.map((r) => (
              <tr key={r.id}>
                <td className="py-2 pr-2">
                  <div className="font-medium">{r.nick}</div>
                  <div className="text-xs text-zinc-500">
                    {r.name} · {r.email}
                  </div>
                </td>
                <td className="pr-2">
                  <select
                    key={r.status}
                    defaultValue={r.status}
                    onChange={(e) =>
                      run(() => adminSetAttendance(lanId, r.userId, e.target.value as AttendanceStatus))
                    }
                    className={`${input} !w-auto !py-1`}
                  >
                    {statuses.map((s) => (
                      <option key={s} value={s}>
                        {statusLabel[s]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="pr-2">
                  <input
                    type="checkbox"
                    key={String(r.paid)}
                    defaultChecked={r.paid}
                    onChange={(e) => run(() => adminSetPaid(r.id, e.target.checked))}
                    className="h-4 w-4 accent-bit"
                    aria-label="Ticket confirmed"
                    title="Ticket / payment confirmed"
                  />
                  {r.ticketBought && !r.paid && (
                    <span className="ml-2 text-xs text-amber-300" title="Says they bought a ticket, not confirmed yet">
                      reported
                    </span>
                  )}
                </td>
                <td className="pr-2">
                  {r.status === "going" && seats.length > 0 ? (
                    <select
                      key={r.seatId ?? "none"}
                      defaultValue={r.seatId ?? ""}
                      onChange={(e) => run(() => adminSetSeatFor(lanId, r.userId, e.target.value || null))}
                      className={`${input} !w-auto !py-1 font-mono`}
                      aria-label={`Seat for ${r.nick}`}
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
                    <span className="font-mono text-xs">{r.seat ?? "—"}</span>
                  )}
                </td>
                <td className="pr-2">
                  <input
                    defaultValue={r.note}
                    onBlur={(e) => e.target.value !== r.note && run(() => adminSetNote(r.id, e.target.value))}
                    className={`${input} !py-1`}
                    placeholder="—"
                  />
                </td>
                <td className="text-right">
                  <button
                    className={`${btnGhost} text-xs text-red-300`}
                    onClick={() => confirm(`Remove ${r.nick} from this LAN?`) && run(() => adminRemoveAttendance(lanId, r.userId))}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={6} className="py-4 text-center text-zinc-500">
                  Nobody here yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {others.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <select value={addUser} onChange={(e) => setAddUser(e.target.value)} className={`${input} !w-auto`}>
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
            Add as going
          </button>
        </div>
      )}
      <StatusLegend />
    </div>
  );
}

function StatusLegend() {
  return (
    <p className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
      <StatusBadge status="going" /> counts toward capacity. <StatusBadge status="waitlist" /> moves up automatically
      when someone drops out. Admins can override capacity.
    </p>
  );
}
