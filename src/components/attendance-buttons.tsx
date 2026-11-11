"use client";
import { useState, useTransition } from "react";
import { setMyAttendance } from "@/app/actions";
import type { AttendanceStatus } from "@/db/schema";
import { btn } from "./ui";

const options: { status: AttendanceStatus; label: string; active: string }[] = [
  { status: "going", label: "I'm going", active: "bg-bit text-ink" },
  { status: "maybe", label: "Maybe", active: "bg-amber-400 text-ink" },
  { status: "declined", label: "Can't make it", active: "bg-zinc-600 text-white" },
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
      <div className="flex flex-wrap gap-2">
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
              className={`${btn} border border-zinc-700 ${isActive ? o.active : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"}`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
