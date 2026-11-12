"use client";
import { useState, useTransition } from "react";
import { publishLan } from "@/app/actions";
import { btnGhost, btnPrimary } from "./ui";

/** Publish button for a draft event, with a one-step confirm that says what happens. */
export function PublishEvent({ lanId, discordChannels }: { lanId: string; discordChannels: number }) {
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!confirm) {
    return (
      <button className={btnPrimary} onClick={() => setConfirm(true)}>
        Publish event
      </button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-fg">
        {discordChannels > 0
          ? "Members see it right away and the Discord channel gets the announcement."
          : "Members see it right away and reminders start."}
      </span>
      <button
        disabled={pending}
        className={btnPrimary}
        onClick={() =>
          start(async () => {
            try {
              await publishLan(lanId);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Couldn't publish");
            }
          })
        }
      >
        {pending ? "Publishing…" : "Yes, publish"}
      </button>
      <button disabled={pending} className={btnGhost} onClick={() => setConfirm(false)}>
        Cancel
      </button>
      {error && <span className="w-full text-sm text-danger">{error}</span>}
    </div>
  );
}
