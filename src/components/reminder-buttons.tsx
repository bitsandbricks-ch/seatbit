"use client";
import { useState, useTransition } from "react";
import { adminSendReminder } from "@/app/actions";
import { btnSecondary } from "./ui";

export function ReminderButtons({
  lanId,
  counts,
}: {
  lanId: string;
  counts: { signup: number | null; payment: number | null; event: number };
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
          <button disabled={pending || !counts.signup} className={btnSecondary} onClick={() => send("signup", "answer", counts.signup!)}>
            Remind undecided ({counts.signup})
          </button>
        )}
        {counts.payment !== null && (
          <button disabled={pending || !counts.payment} className={btnSecondary} onClick={() => send("payment", "ticket", counts.payment!)}>
            Remind without ticket ({counts.payment})
          </button>
        )}
        <button disabled={pending || !counts.event} className={btnSecondary} onClick={() => send("event", "event", counts.event)}>
          Remind attendees ({counts.event})
        </button>
      </div>
      {msg && <p className="text-sm text-emerald-300">{msg}</p>}
    </div>
  );
}
