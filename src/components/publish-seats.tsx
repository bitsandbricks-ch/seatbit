"use client";
import { useState, useTransition } from "react";
import { publishSeats, unpublishSeats } from "@/app/actions";
import { btnGhost, btnPrimary } from "./ui";

export function PublishSeats({
  lanId,
  publishedAt,
  unseated,
}: {
  lanId: string;
  publishedAt: string | null;
  unseated: number;
}) {
  const [pending, start] = useTransition();
  const [notify, setNotify] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  if (publishedAt) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-bit">Published {publishedAt}. Members can see the seat plan.</p>
        <button disabled={pending} className={btnGhost} onClick={() => start(() => unpublishSeats(lanId))}>
          Unpublish
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-3 text-sm">
      <p className="text-zinc-400">
        Members only see the seat plan once you publish it. Until then they can send seat wishes.
        {unseated > 0 && <span className="text-warn"> {unseated} people coming still have no seat.</span>}
      </p>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="h-4 w-4 accent-bit" />
        Email everyone coming their seat
      </label>
      <button
        disabled={pending}
        className={btnPrimary}
        onClick={() =>
          start(async () => {
            const n = await publishSeats(lanId, notify);
            setMsg(notify ? `Published, ${n} email(s) sent.` : "Published.");
          })
        }
      >
        Publish seat plan
      </button>
      {msg && <p className="text-bit">{msg}</p>}
    </div>
  );
}
