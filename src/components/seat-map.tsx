"use client";
import { useState, useTransition } from "react";
import {
  adminAssignSeat,
  pickMySeat,
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
  /** view: read only. pick: members choose their own free seat. admin: orga tools. */
  mode: "view" | "pick" | "admin";
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
    if (mode === "pick") {
      if (!s) return;
      if (s.userId === meId) return run(() => pickMySeat(lanId, null));
      if (s.locked || s.userId) return;
      return run(() => pickMySeat(lanId, s.id));
    }
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
          <span className="text-xs text-muted">
            {tool === "layout" && "Click a cell to add or remove a seat, or a row letter to fill or clear the whole row."}
            {tool === "lock" && "Held seats can't be claimed by members. Orgas can still assign people to them."}
            {tool === "rename" && "Click a seat to change its label."}
          </span>
        </div>
      )}

      {mode === "pick" && (
        <p className="text-sm text-muted">
          {mySeat
            ? `You're at ${mySeat.label}. Tap a free seat to move, or tap yours to give it up.`
            : "Tap a free seat to take it. The orgas can still move people before they publish the plan."}
        </p>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}

      {mode === "view" && (
        <p className="text-sm text-muted">
          {mySeat ? `You're at ${mySeat.label}.` : "The orgas assign the group's seats after the deadline."}
        </p>
      )}

      {/* Seats are wide enough for a whole nick (two lines if needed); on narrow screens the map scrolls sideways
          and the row letters stay pinned on the left. */}
      <div className={`-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0 ${pending ? "opacity-60" : ""}`}>
        <div
          className="grid gap-[var(--seat-gap)] [--seat-gap:0.375rem] [--seat-w:4.75rem] sm:[--seat-w:5.25rem] lg:[--seat-w:4.5rem] 2xl:[--seat-w:5rem]"
          style={{
            gridTemplateColumns: `1.25rem repeat(${cols}, minmax(var(--seat-w), 1fr))`,
            minWidth: `calc(${cols} * (var(--seat-w) + var(--seat-gap)) + 1.25rem)`,
          }}
        >
          {Array.from({ length: rows * (cols + 1) }, (_, j) => {
            const row = Math.floor(j / (cols + 1));
            const col = (j % (cols + 1)) - 1;
            const i = `${row}:${col}`;
            if (col === -1) {
              const first = seats.find((x) => x.row === row);
              const letter = first?.label.match(/^[A-Za-z]+/)?.[0] ?? rowLetter(row);
              return mode === "admin" && tool === "layout" ? (
                <button
                  key={i}
                  onClick={() => run(() => toggleSeatRow(lanId, row))}
                  className="sticky left-0 z-10 h-[4.5rem] rounded bg-surface text-xs font-mono text-muted hover:bg-raised hover:text-fg"
                  title={`Fill or clear row ${letter}`}
                >
                  {letter}
                </button>
              ) : (
                <div key={i} className="sticky left-0 z-10 grid h-[4.5rem] place-items-center bg-surface text-xs font-mono text-muted">
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
                  className="h-[4.5rem] rounded-bit border border-dashed border-line hover:border-muted/50"
                  aria-label={`Add seat at row ${row + 1}, column ${col + 1}`}
                />
              ) : (
                <div key={i} className="h-[4.5rem]" />
              );
            }
            const mine = s.userId === meId;
            const taken = !!s.userId;
            const cls = mine
              ? "bg-bit text-on-bit border-bit"
              : taken
                ? "bg-seat-taken/20 text-seat-taken border-seat-taken/40"
                : s.locked
                  ? "bg-raised/60 text-faint border-line [background-image:repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(255,255,255,.04)_4px,rgba(255,255,255,.04)_8px)]"
                  : `bg-raised text-fg/90 border-line ${mode === "admin" ? "hover:border-bit" : ""}`;
            return (
              <button
                key={i}
                disabled={mode === "view"}
                onClick={() => onCell(row, col, s)}
                title={`${s.label}${s.nick ? ` · ${s.nick}` : ""}${s.locked ? " · held" : ""}`}
                className={`flex h-[4.5rem] flex-col items-center justify-center gap-0.5 overflow-hidden rounded-bit border px-1.5 text-center transition ${cls}`}
              >
                <span className="font-mono text-[11px] leading-none opacity-75">
                  {s.label}
                  {s.locked ? " 🔒" : ""}
                </span>
                {s.nick && (
                  <span className="line-clamp-2 w-full text-xs font-semibold leading-tight [overflow-wrap:anywhere]">{s.nick}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-muted">
        <Legend cls="bg-raised border-line">Free</Legend>
        <Legend cls="bg-bit border-bit">You</Legend>
        <Legend cls="bg-seat-taken/20 border-seat-taken/40">Taken</Legend>
        <Legend cls="bg-raised/60 border-line">Held</Legend>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
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
