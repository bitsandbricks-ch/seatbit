"use client";
import { useState, useTransition } from "react";
import { adminSendReminder } from "@/app/actions";
import { btnSecondary } from "./ui";

export function ReminderButtons({
  lanId,
  counts,
  draft = false,
}: {
  lanId: string;
  counts: { signup: number | null; payment: number | null; event: number };
  /** Drafts send nothing, so the buttons wait for publishing. */
  draft?: boolean;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const send = (kind: "signup" | "payment" | "event", what: string, n: number) => {
    if (!confirm(`Send ${what} reminder to ${n} member(s) now?`)) return;
    start(async () => {
      const sent = await adminSendReminder(lanId, kind);
      setMsg(`Sent ${sent} ${what} reminder(s).`);
    });
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {counts.signup !== null && (
          <button disabled={draft || pending || !counts.signup} className={btnSecondary} onClick={() => send("signup", "answer", counts.signup!)}>
            Remind undecided ({counts.signup})
          </button>
        )}
        {counts.payment !== null && (
          <button disabled={draft || pending || !counts.payment} className={btnSecondary} onClick={() => send("payment", "ticket", counts.payment!)}>
            Remind without ticket ({counts.payment})
          </button>
        )}
        <button disabled={draft || pending || !counts.event} className={btnSecondary} onClick={() => send("event", "event", counts.event)}>
          Remind attendees ({counts.event})
        </button>
      </div>
      {draft && <p className="text-sm text-muted">Reminders start once you publish the event.</p>}
      {msg && <p className="text-sm text-bit">{msg}</p>}
    </div>
  );
}
