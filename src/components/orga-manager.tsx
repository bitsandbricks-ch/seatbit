"use client";
import { useState, useTransition } from "react";
import { addOrga, removeOrga } from "@/app/actions";
import { btnGhost, btnSecondary, input } from "./ui";

export function OrgaManager({
  lanId,
  orgas,
  candidates,
}: {
  lanId: string;
  orgas: { id: string; name: string }[];
  candidates: { id: string; name: string }[];
}) {
  const [pending, start] = useTransition();
  const [pick, setPick] = useState("");
  return (
    <div className={`space-y-3 ${pending ? "opacity-70" : ""}`}>
      <ul className="flex flex-wrap gap-2">
        {orgas.length === 0 && <li className="text-sm text-muted">No orgas yet.</li>}
        {orgas.map((o) => (
          <li key={o.id} className="flex items-center gap-1 rounded-full bg-raised py-0.5 pl-3 pr-1 text-sm">
            {o.name}
            <button
              aria-label={`Remove ${o.name} as orga`}
              className={`${btnGhost} !rounded-full !px-2 !py-0 text-muted`}
              onClick={() => start(() => removeOrga(lanId, o.id))}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      {candidates.length > 0 && (
        <div className="flex gap-2">
          <select value={pick} onChange={(e) => setPick(e.target.value)} className={`${input} !w-auto`}>
            <option value="">Add an orga…</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            disabled={!pick}
            className={btnSecondary}
            onClick={() =>
              start(async () => {
                await addOrga(lanId, pick);
                setPick("");
              })
            }
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}
