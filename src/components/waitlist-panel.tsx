"use client";
import Link from "next/link";
import { useTransition } from "react";
import { adminMoveUp, adminReorderWaitlist, setWaitlistAuto } from "@/app/actions";
import { Avatar } from "./avatar";
import { Segmented, btnGhost, btnSecondary } from "./ui";
import type { AvatarData } from "@/lib/avatars";

export type WaitlistEntry = {
  userId: string;
  name: string;
  avatar?: AvatarData;
  /** "since Sat 14.11.2026, 18:00" */
  since: string;
  ticket: "confirmed" | "reported" | null;
};

/** Orga view of the waitlist: the line in order, move people up or reorder, and how free spots are filled. */
export function WaitlistPanel({
  lanId,
  entries,
  free,
  auto,
  profileBase = null,
}: {
  lanId: string;
  entries: WaitlistEntry[];
  /** Free spots in the group's block; null = no limit. */
  free: number | null;
  auto: boolean;
  profileBase?: string | null;
}) {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>) => start(async () => void (await fn()));

  return (
    <div className={`space-y-4 ${pending ? "opacity-70" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="When a spot opens"
          value={auto ? ("auto" as const) : ("manual" as const)}
          onChange={(v) => run(() => setWaitlistAuto(lanId, v === "auto"))}
          options={[
            { id: "auto", label: "Next in line moves up" },
            { id: "manual", label: "Orgas pick" },
          ]}
        />
        <p className="text-sm text-muted">
          {free == null ? "No limit set" : free === 0 ? "No free spot" : `${free} free spot${free === 1 ? "" : "s"}`}
        </p>
      </div>
      <p className="text-sm text-muted">
        {auto
          ? "When someone stops coming, the first person in line moves to coming and gets an email and a Discord DM."
          : "When someone stops coming, the orgas get a notice and move someone up by hand. Handy when you want to ask first who still has time."}
      </p>

      {entries.length === 0 ? (
        <p className="py-2 text-sm text-muted">Nobody is waiting.</p>
      ) : (
        <ol className="divide-y divide-line overflow-hidden rounded-card border border-line">
          {entries.map((e, i) => (
            <li key={e.userId} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:flex-nowrap">
              <span className="w-6 shrink-0 text-center font-mono text-sm font-semibold text-muted">{i + 1}</span>
              <Avatar data={e.avatar} size={28} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {profileBase ? (
                    <Link href={`${profileBase}${e.userId}`} className="hover:text-bit hover:underline">
                      {e.name}
                    </Link>
                  ) : (
                    e.name
                  )}
                </p>
                <p className="truncate text-xs text-muted">
                  waiting {e.since}
                  {e.ticket === "confirmed" && " · ticket confirmed"}
                  {e.ticket === "reported" && " · ticket reported"}
                </p>
              </div>
              <div className="ml-9 flex shrink-0 items-center gap-1 sm:ml-0">
                <button
                  type="button"
                  className={`${btnGhost} !px-2`}
                  disabled={pending || i === 0}
                  onClick={() => run(() => adminReorderWaitlist(lanId, e.userId, -1))}
                  aria-label={`Move ${e.name} one place up`}
                  title="One place up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className={`${btnGhost} !px-2`}
                  disabled={pending || i === entries.length - 1}
                  onClick={() => run(() => adminReorderWaitlist(lanId, e.userId, 1))}
                  aria-label={`Move ${e.name} one place down`}
                  title="One place down"
                >
                  ↓
                </button>
                <button
                  type="button"
                  className={`${btnSecondary} !py-1.5 text-sm`}
                  disabled={pending}
                  onClick={() =>
                    (free !== 0 || confirm(`The group is full. Move ${e.name} to coming anyway (over the limit)?`)) &&
                    run(() => adminMoveUp(lanId, e.userId))
                  }
                >
                  Move to coming
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
