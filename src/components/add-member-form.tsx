"use client";
import { useMemo, useState, useTransition } from "react";
import { btnSecondary, input } from "./ui";

export function AddMemberForm({
  clanId,
  users,
  action,
}: {
  clanId: string;
  users: { id: string; name: string; email: string }[];
  action: (clanId: string, userId: string) => Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const hits = useMemo(
    () =>
      q.trim().length < 2
        ? []
        : users.filter((u) => u.name.toLowerCase().includes(q.toLowerCase())).slice(0, 8),
    [q, users],
  );
  return (
    <div className="space-y-2">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search Seatbit users by name or nick"
        className={input}
      />
      {hits.length > 0 && (
        <ul className="space-y-1">
          {hits.map((u) => (
            <li key={u.id} className="flex items-center justify-between gap-2 rounded-md bg-zinc-800/50 px-3 py-1.5">
              <span className="min-w-0 truncate text-sm">
                {u.name} <span className="text-zinc-500">{u.email}</span>
              </span>
              <button
                disabled={pending}
                className={`${btnSecondary} !py-1 text-xs`}
                onClick={() => start(() => action(clanId, u.id))}
              >
                Add
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.trim().length >= 2 && hits.length === 0 && <p className="text-sm text-zinc-500">No user found.</p>}
    </div>
  );
}
