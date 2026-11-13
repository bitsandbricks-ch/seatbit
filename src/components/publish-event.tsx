"use client";
import { useState, useTransition } from "react";
import { publishLan } from "@/app/actions";
import { openSignupNow, schedulePublish, uncancelLan } from "@/app/event-actions";
import { DateTimePicker } from "./date-time-picker";
import { btnGhost, btnPrimary, btnSecondary } from "./ui";
import { useT } from "@/i18n/client";

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
  const t = useT();
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
        setError(e instanceof Error ? e.message : t("publish.failed"));
      }
    });
  const what = [
    t("publish.what.members"),
    discordChannels > 0 ? t("publish.what.discord") : "",
    t(interestCheck ? "publish.what.interest" : "publish.what.newEvent"),
  ].filter(Boolean);

  if (mode === "confirm") {
    return (
      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
        <span className="w-full text-sm text-fg sm:w-auto">
          {what.slice(0, -1).join(", ")} {t("publish.and")} {what.at(-1)}.
        </span>
        <button disabled={pending} className={btnPrimary} onClick={() => run(() => publishLan(lanId))}>
          {pending ? t("publish.publishing") : t("publish.yes")}
        </button>
        <button disabled={pending} className={btnGhost} onClick={() => setMode("idle")}>
          {t("common.cancel")}
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
          if (!at) return setError(t("publish.pickTime"));
          run(() => schedulePublish(lanId, at));
        }}
      >
        <div className="min-w-56 flex-1">
          <DateTimePicker name="publishAt" defaultTime="18:00" placeholder={t("publish.goLiveOn")} />
        </div>
        <button disabled={pending} className={btnPrimary}>
          {t("publish.schedule")}
        </button>
        <button type="button" disabled={pending} className={btnGhost} onClick={() => setMode("idle")}>
          {t("common.cancel")}
        </button>
        {error && <span className="w-full text-sm text-danger">{error}</span>}
      </form>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button className={btnPrimary} onClick={() => setMode("confirm")}>
        {t("publish.now")}
      </button>
      {scheduled ? (
        <button disabled={pending} className={btnSecondary} onClick={() => run(() => schedulePublish(lanId, null))}>
          {t("publish.unschedule")}
        </button>
      ) : (
        <button className={btnSecondary} onClick={() => setMode("schedule")}>
          {t("publish.scheduleOpen")}
        </button>
      )}
      {error && <span className="w-full text-sm text-danger">{error}</span>}
    </div>
  );
}

/** Ends the interest check. */
export function OpenSignupButton({ lanId, dateTbd }: { lanId: string; dateTbd: boolean }) {
  const t = useT();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (dateTbd) {
    return <span className="text-sm text-muted">{t("publish.setDateFirst")}</span>;
  }
  if (!confirm) {
    return (
      <button className={btnPrimary} onClick={() => setConfirm(true)}>
        {t("leadSteps.signup")}
      </button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-fg">{t("publish.openSignupConfirm")}</span>
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
        {pending ? t("publish.opening") : t("publish.yesOpen")}
      </button>
      <button disabled={pending} className={btnGhost} onClick={() => setConfirm(false)}>
        {t("common.cancel")}
      </button>
      {msg && <span className="w-full text-sm text-danger">{msg}</span>}
    </div>
  );
}

export function UndoCancelButton({ lanId }: { lanId: string }) {
  const t = useT();
  const [pending, start] = useTransition();
  return (
    <button disabled={pending} className={btnSecondary} onClick={() => start(() => uncancelLan(lanId))}>
      {t("publish.undoCancel")}
    </button>
  );
}
