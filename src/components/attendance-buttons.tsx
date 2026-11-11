"use client";
import { useState, useTransition } from "react";
import { setMyAttendance } from "@/app/actions";
import type { AttendanceStatus } from "@/db/schema";
import { btn } from "./ui";

const options: { status: AttendanceStatus; label: string; active: string }[] = [
  { status: "going", label: "I'm coming", active: "border-bit bg-bit text-on-bit hover:bg-bit-hover" },
  { status: "maybe", label: "Unsure", active: "border-warn bg-warn text-on-bit" },
  { status: "declined", label: "Not coming", active: "border-danger/50 bg-danger/15 text-danger" },
];

export function AttendanceButtons({
  lanId,
  current,
  disabled,
}: {
  lanId: string;
  current: AttendanceStatus | null;
  disabled: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2" aria-busy={pending}>
        {options.map((o) => {
          const isActive = current === o.status || (o.status === "going" && current === "waitlist");
          return (
            <button
              key={o.status}
              disabled={disabled || pending}
              onClick={() =>
                start(async () => {
                  setError(null);
                  try {
                    await setMyAttendance(lanId, o.status);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Failed");
                  }
                })
              }
              aria-pressed={isActive}
              className={`${btn} min-h-11 whitespace-nowrap border px-1 ${isActive ? o.active : "border-line bg-raised text-fg hover:bg-line"} ${pending ? "opacity-70" : ""}`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
