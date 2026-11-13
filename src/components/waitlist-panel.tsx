"use client";
import Link from "next/link";
import { useTransition } from "react";
import { adminMoveUp, adminReorderWaitlist, setWaitlistAuto } from "@/app/actions";
import { Avatar } from "./avatar";
import { Segmented, btnGhost, btnSecondary } from "./ui";
import type { AvatarData } from "@/lib/avatars";
import { useT } from "@/i18n/client";

export type WaitlistEntry = {
  userId: string;
  /** As the clan's name display asks; `full` is Name "Nick" Surname, shown small when it differs. */
  name: string;
  full: string;
  avatar?: AvatarData;
  /** "since Sat 14.11.2026, 18:00" */
  since: string;
  ticket: "confirmed" | "reported" | null;
};

/** Lead view of the waitlist: the line in order, move people up or reorder, and how free spots are filled. */
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
  const t = useT();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>) => start(async () => void (await fn()));

  return (
    <div className={`space-y-4 ${pending ? "opacity-70" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label={t("waitlistPanel.whenOpens")}
          value={auto ? ("auto" as const) : ("manual" as const)}
          onChange={(v) => run(() => setWaitlistAuto(lanId, v === "auto"))}
          options={[
            { id: "auto", label: t("waitlistPanel.auto") },
            { id: "manual", label: t("waitlistPanel.manual") },
          ]}
        />
        <p className="text-sm text-muted">
          {free == null ? t("waitlistPanel.noLimit") : free === 0 ? t("waitlistPanel.noFree") : t("waitlistPanel.free", { count: free })}
        </p>
      </div>
      <p className="text-sm text-muted">
        {auto ? t("waitlistPanel.autoHint") : t("waitlistPanel.manualHint")}
      </p>

      {entries.length === 0 ? (
        <p className="py-2 text-sm text-muted">{t("waitlistPanel.nobody")}</p>
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
                  {e.full !== e.name && `${e.full} · `}
                  {t("waitlistPanel.waiting", { since: e.since })}
                  {e.ticket === "confirmed" && ` · ${t("waitlistPanel.ticketConfirmed")}`}
                  {e.ticket === "reported" && ` · ${t("waitlistPanel.ticketReported")}`}
                </p>
              </div>
              <div className="ml-9 flex shrink-0 items-center gap-1 sm:ml-0">
                <button
                  type="button"
                  className={`${btnGhost} !px-2`}
                  disabled={pending || i === 0}
                  onClick={() => run(() => adminReorderWaitlist(lanId, e.userId, -1))}
                  aria-label={t("waitlistPanel.upName", { name: e.name })}
                  title={t("waitlistPanel.up")}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className={`${btnGhost} !px-2`}
                  disabled={pending || i === entries.length - 1}
                  onClick={() => run(() => adminReorderWaitlist(lanId, e.userId, 1))}
                  aria-label={t("waitlistPanel.downName", { name: e.name })}
                  title={t("waitlistPanel.down")}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className={`${btnSecondary} !py-1.5 text-sm`}
                  disabled={pending}
                  onClick={() =>
                    (free !== 0 || confirm(t("waitlistPanel.overLimit", { name: e.name }))) &&
                    run(() => adminMoveUp(lanId, e.userId))
                  }
                >
                  {t("waitlistPanel.moveUp")}
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
