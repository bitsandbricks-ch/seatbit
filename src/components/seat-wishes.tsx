"use client";
import { useState, useTransition } from "react";
import { setMySeatWishes } from "@/app/actions";
import { btnPrimary, input } from "./ui";

type Wishes = { near: string[]; avoid: string[]; position: "any" | "edge" | "middle"; seat: string; note: string };

export function SeatWishes({
  lanId,
  people,
  seatLabels,
  initial,
}: {
  lanId: string;
  people: { id: string; nick: string }[];
  seatLabels: string[];
  initial: Wishes;
}) {
  const [w, setW] = useState<Wishes>(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const toggle = (key: "near" | "avoid", id: string) =>
    setW((cur) => {
      const other = key === "near" ? "avoid" : "near";
      const has = cur[key].includes(id);
      return {
        ...cur,
        [key]: has ? cur[key].filter((x) => x !== id) : [...cur[key], id],
        [other]: cur[other].filter((x) => x !== id),
      };
    });

  return (
    <div className="space-y-4 text-sm">
      {people.length > 0 && (
        <div>
          <p className="mb-2 text-fg/90">Who do you want to sit with, and who not right next to?</p>
          <ul className="max-h-64 space-y-1 overflow-y-auto pr-1">
            {people.map((p) => {
              const near = w.near.includes(p.id);
              const avoid = w.avoid.includes(p.id);
              return (
                <li key={p.id} className="flex items-center justify-between gap-2 rounded-md bg-raised/60 px-3 py-1.5">
                  <span className="truncate">{p.nick}</span>
                  <span className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => toggle("near", p.id)}
                      aria-pressed={near}
                      className={`min-h-8 rounded-full px-3 py-1 text-xs font-medium transition ${near ? "bg-bit text-on-bit" : "bg-line/60 text-fg/90 hover:bg-line"}`}
                    >
                      Near
                    </button>
                    <button
                      type="button"
                      onClick={() => toggle("avoid", p.id)}
                      aria-pressed={avoid}
                      className={`min-h-8 rounded-full px-3 py-1 text-xs font-medium transition ${avoid ? "bg-danger text-on-bit" : "bg-line/60 text-fg/90 hover:bg-line"}`}
                    >
                      Not next to
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <fieldset>
        <legend className="mb-2 text-fg/90">Where in the row?</legend>
        <div className="flex gap-2">
          {(
            [
              ["any", "Don't mind"],
              ["edge", "At the edge"],
              ["middle", "In the middle"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setW({ ...w, position: v })}
              aria-pressed={w.position === v}
              className={`flex-1 rounded-md border px-2 py-2 text-xs ${w.position === v ? "border-bit text-bit" : "border-line text-fg/90"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-fg/90">Preferred seat</span>
          <select value={w.seat} onChange={(e) => setW({ ...w, seat: e.target.value })} className={input}>
            <option value="">Any</option>
            {seatLabels.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="col-span-2 block">
          <span className="mb-1 block text-fg/90">Anything else for the orgas?</span>
          <input
            value={w.note}
            onChange={(e) => setW({ ...w, note: e.target.value })}
            maxLength={300}
            placeholder="e.g. need a power socket for a second PC"
            className={input}
          />
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button
          disabled={pending}
          className={btnPrimary}
          onClick={() =>
            start(async () => {
              try {
                await setMySeatWishes(lanId, w);
                setMsg({ ok: true, text: "Saved. The orgas will try to make it work." });
              } catch (e) {
                setMsg({ ok: false, text: e instanceof Error ? e.message : "Failed" });
              }
            })
          }
        >
          Save wishes
        </button>
        {msg && <span className={msg.ok ? "text-bit" : "text-danger"}>{msg.text}</span>}
      </div>
    </div>
  );
}
