"use client";
import { useState, useTransition } from "react";
import { publishLan } from "@/app/actions";
import { openSignupNow, schedulePublish, uncancelLan } from "@/app/event-actions";
import { DateTimePicker } from "./date-time-picker";
import { btnGhost, btnPrimary, btnSecondary } from "./ui";

/** Publish a draft now (with a one-step confirm) or at a set time. */
export function PublishEvent({
  lanId,
  discordChannels,
  scheduled,
  interestCheck,
}: {
  lanId: string;
  discordChannels: number;
  /** "Sat 14.11.2026, 18:00" when a publish time is set. */
  scheduled: string | null;
  interestCheck: boolean;
}) {
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<"idle" | "confirm" | "schedule">("idle");
  const [error, setError] = useState<string | null>(null);
  const run = (task: () => Promise<{ error?: string } | void>) =>
    start(async () => {
      try {
        const r = await task();
        if (r && r.error) setError(r.error);
        else {
          setError(null);
          setMode("idle");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "That didn't work");
      }
    });
  const what = [
    "Members see it right away",
    discordChannels > 0 ? "the Discord channel gets the post" : "",
    interestCheck ? "interested members are asked if they'd come" : "interested members get a “new event” message",
  ].filter(Boolean);

  if (mode === "confirm") {
    return (
      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
        <span className="w-full text-sm text-fg sm:w-auto">{what.slice(0, -1).join(", ")} and {what.at(-1)}.</span>
        <button disabled={pending} className={btnPrimary} onClick={() => run(() => publishLan(lanId))}>
          {pending ? "Publishing…" : "Yes, publish"}
        </button>
        <button disabled={pending} className={btnGhost} onClick={() => setMode("idle")}>
          Cancel
        </button>
        {error && <span className="w-full text-sm text-danger">{error}</span>}
      </div>
    );
  }
  if (mode === "schedule") {
    return (
      <form
        className="flex w-full flex-wrap items-center gap-2 sm:w-auto"
        onSubmit={(e) => {
          e.preventDefault();
          const at = String(new FormData(e.currentTarget).get("publishAt") ?? "");
          if (!at) return setError("Pick a date and time.");
          run(() => schedulePublish(lanId, at));
        }}
      >
        <div className="min-w-56 flex-1">
          <DateTimePicker name="publishAt" defaultTime="18:00" placeholder="Go live on…" />
        </div>
        <button disabled={pending} className={btnPrimary}>
          Schedule
        </button>
        <button type="button" disabled={pending} className={btnGhost} onClick={() => setMode("idle")}>
          Cancel
        </button>
        {error && <span className="w-full text-sm text-danger">{error}</span>}
      </form>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button className={btnPrimary} onClick={() => setMode("confirm")}>
        Publish now
      </button>
      {scheduled ? (
        <button disabled={pending} className={btnSecondary} onClick={() => run(() => schedulePublish(lanId, null))}>
          Don&apos;t schedule
        </button>
      ) : (
        <button className={btnSecondary} onClick={() => setMode("schedule")}>
          Schedule…
        </button>
      )}
      {error && <span className="w-full text-sm text-danger">{error}</span>}
    </div>
  );
}

/** Ends the interest check. */
export function OpenSignupButton({ lanId, dateTbd }: { lanId: string; dateTbd: boolean }) {
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (dateTbd) {
    return <span className="text-sm text-muted">Set the date in Settings to open sign-up.</span>;
  }
  if (!confirm) {
    return (
      <button className={btnPrimary} onClick={() => setConfirm(true)}>
        Open sign-up
      </button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-fg">Everyone interested (except those who said no) gets a “sign up now” message.</span>
      <button
        disabled={pending}
        className={btnPrimary}
        onClick={() =>
          start(async () => {
            const r = await openSignupNow(lanId);
            if (r.error) setMsg(r.error);
          })
        }
      >
        {pending ? "Opening…" : "Yes, open sign-up"}
      </button>
      <button disabled={pending} className={btnGhost} onClick={() => setConfirm(false)}>
        Cancel
      </button>
      {msg && <span className="w-full text-sm text-danger">{msg}</span>}
    </div>
  );
}

export function UndoCancelButton({ lanId }: { lanId: string }) {
  const [pending, start] = useTransition();
  return (
    <button disabled={pending} className={btnSecondary} onClick={() => start(() => uncancelLan(lanId))}>
      Undo cancel
    </button>
  );
}
