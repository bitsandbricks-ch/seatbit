"use client";
import { useState, useTransition } from "react";
import { adminRemindToBook, setMySeatBooked } from "@/app/lan-extras-actions";
import { btnSecondary } from "./ui";
import { useT } from "@/i18n/client";

/** "I booked it on the event's seat plan" checkbox, with a link to that plan. */
export function BookedToggle({ lanId, booked, planUrl }: { lanId: string; booked: boolean; planUrl: string }) {
  const t = useT();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <a href={planUrl} target="_blank" rel="noreferrer" className="inline-flex text-sm text-bit hover:underline">
        {t("eventUi.openPlan")} <span aria-hidden>↗</span>
      </a>
      <label className="flex items-center gap-3 rounded-md border border-line bg-raised px-3 py-2.5 text-sm">
        <input
          type="checkbox"
          key={String(booked)}
          defaultChecked={booked}
          disabled={pending}
          onChange={(e) => {
            const v = e.target.checked;
            start(async () => {
              setError(null);
              try {
                await setMySeatBooked(lanId, v);
              } catch (err) {
                setError(err instanceof Error ? err.message : t("eventUi.failed"));
              }
            });
          }}
          className="h-5 w-5 accent-bit"
        />
        <span>{t("eventUi.booked")}</span>
      </label>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}

/** Lead button: DM/mail everyone who hasn't booked their seat on the event site yet. */
export function RemindToBookButton({ lanId, open }: { lanId: string; open: number }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        disabled={pending || open === 0}
        className={btnSecondary}
        onClick={() =>
          start(async () => {
            const n = await adminRemindToBook(lanId);
            setMsg(`Reminded ${n} member(s).`);
          })
        }
      >
        Remind {open} who haven&apos;t booked
      </button>
      {msg && <span className="text-sm text-bit">{msg}</span>}
    </div>
  );
}
