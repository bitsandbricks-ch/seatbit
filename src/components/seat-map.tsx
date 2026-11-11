"use client";
import { useState, useTransition } from "react";
import {
  adminAssignSeat,
  renameSeat,
  toggleSeatCell,
  toggleSeatLock,
  toggleSeatRow,
} from "@/app/actions";
import { rowLetter } from "@/lib/seat-labels";
import { btnGhost, btnSecondary, input } from "./ui";

export type SeatView = {
  id: string;
  row: number;
  col: number;
  label: string;
  userId: string | null;
  locked: boolean;
  nick: string | null;
};

type Tool = "layout" | "assign" | "lock" | "rename";

export function SeatMap({
  lanId,
  rows,
  cols,
  seats,
  meId,
  mode,
  assignable = [],
}: {
  lanId: string;
  rows: number;
  cols: number;
  seats: SeatView[];
  meId: string;
  mode: "view" | "admin";
  assignable?: { id: string; nick: string }[];
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("assign");
  const [assignee, setAssignee] = useState<string>("");
  const byPos = new Map(seats.map((s) => [`${s.row}:${s.col}`, s]));
  const mySeat = seats.find((s) => s.userId === meId);
  const seatedIds = new Set(seats.map((s) => s.userId).filter(Boolean));

  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      setError(null);
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });

  function onCell(row: number, col: number, s?: SeatView) {
    if (mode === "view") return;
    // admin
    if (tool === "layout") {
      if (s?.userId && !confirm(`${s.label} is taken by ${s.nick}. Remove the seat anyway?`)) return;
      return run(() => toggleSeatCell(lanId, row, col));
    }
    if (!s) return;
    if (tool === "lock") return run(() => toggleSeatLock(s.id));
    if (tool === "rename") {
      const label = prompt("Seat label", s.label);
      if (label) run(() => renameSeat(s.id, label));
      return;
    }
    if (tool === "assign") {
      if (s.userId && !assignee) return run(() => adminAssignSeat(s.id, null));
      if (assignee) return run(() => adminAssignSeat(s.id, assignee));
    }
  }

  return (
    <div className="space-y-3">
      {mode === "admin" && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {(
            [
              ["assign", "Assign"],
              ["layout", "Seats / aisles"],
              ["lock", "Hold"],
              ["rename", "Rename"],
            ] as [Tool, string][]
          ).map(([t, name]) => (
            <button
              key={t}
              onClick={() => setTool(t)}
              className={tool === t ? btnSecondary + " !border-bit" : btnGhost}
            >
              {name}
            </button>
          ))}
          {tool === "assign" && (
            <select
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              className={`${input} !w-auto`}
            >
              <option value="">Click a seat to clear it</option>
              {assignable.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nick}
                  {seatedIds.has(a.id) ? " (seated)" : ""}
                </option>
              ))}
            </select>
          )}
          <span className="text-xs text-zinc-500">
            {tool === "layout" && "Click a cell to add or remove a seat, or a row letter to fill or clear the whole row."}
            {tool === "lock" && "Held seats can't be claimed by members. Orgas can still assign people to them."}
            {tool === "rename" && "Click a seat to change its label."}
          </span>
        </div>
      )}

      {mode === "view" && (
        <p className="text-sm text-zinc-400">
          {mySeat ? `You're at ${mySeat.label}.` : "The orgas assign the group's seats after the deadline."}
        </p>
      )}

      <div className={`overflow-x-auto pb-2 ${pending ? "opacity-60" : ""}`}>
        <div
          className="grid gap-1.5"
          style={{ gridTemplateColumns: `1.5rem repeat(${cols}, minmax(3.25rem, 1fr))`, minWidth: cols * 56 + 24 }}
        >
          {Array.from({ length: rows * (cols + 1) }, (_, j) => {
            const row = Math.floor(j / (cols + 1));
            const col = (j % (cols + 1)) - 1;
            const i = `${row}:${col}`;
            if (col === -1) {
              const letter = rowLetter(row);
              return mode === "admin" && tool === "layout" ? (
                <button
                  key={i}
                  onClick={() => run(() => toggleSeatRow(lanId, row))}
                  className="h-14 rounded text-xs font-mono text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                  title={`Fill or clear row ${letter}`}
                >
                  {letter}
                </button>
              ) : (
                <div key={i} className="grid h-14 place-items-center text-xs font-mono text-zinc-600">
                  {letter}
                </div>
              );
            }
            const s = byPos.get(`${row}:${col}`);
            if (!s) {
              return mode === "admin" && tool === "layout" ? (
                <button
                  key={i}
                  onClick={() => onCell(row, col)}
                  className="h-14 rounded border border-dashed border-line hover:border-zinc-600"
                  aria-label={`Add seat at row ${row + 1}, column ${col + 1}`}
                />
              ) : (
                <div key={i} className="h-14" />
              );
            }
            const mine = s.userId === meId;
            const taken = !!s.userId;
            const cls = mine
              ? "bg-bit text-ink border-bit"
              : taken
                ? "bg-seat-taken/20 text-seat-taken border-seat-taken/40"
                : s.locked
                  ? "bg-zinc-800/50 text-zinc-500 border-zinc-700 [background-image:repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(255,255,255,.04)_4px,rgba(255,255,255,.04)_8px)]"
                  : `bg-zinc-800 text-zinc-300 border-zinc-700 ${mode === "admin" ? "hover:border-bit" : ""}`;
            return (
              <button
                key={i}
                disabled={mode === "view"}
                onClick={() => onCell(row, col, s)}
                title={`${s.label}${s.nick ? ` · ${s.nick}` : ""}${s.locked ? " · held" : ""}`}
                className={`flex h-14 flex-col items-center justify-center overflow-hidden rounded border px-1 text-center ${cls}`}
              >
                <span className="text-[10px] font-mono opacity-70">
                  {s.label}
                  {s.locked ? " 🔒" : ""}
                </span>
                <span className="w-full truncate text-xs font-medium">{s.nick ?? ""}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-zinc-500">
        <Legend cls="bg-zinc-800 border-zinc-700">Free</Legend>
        <Legend cls="bg-bit border-bit">You</Legend>
        <Legend cls="bg-seat-taken/20 border-seat-taken/40">Taken</Legend>
        <Legend cls="bg-zinc-800/50 border-zinc-700">Held</Legend>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}

function Legend({ cls, children }: { cls: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-3 w-3 rounded-sm border ${cls}`} />
      {children}
    </span>
  );
}
