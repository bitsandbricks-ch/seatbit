"use client";
import { useState, useTransition } from "react";
import { publishLan } from "@/app/actions";
import { openSignupNow, schedulePublish, scheduleSignup, uncancelLan } from "@/app/event-actions";
import { ask } from "./dialog";
import { DateTimePicker } from "./date-time-picker";
import { btnGhost, btnPrimary, btnSecondary } from "./ui";
import { useT } from "@/i18n/client";
import { useRunAction } from "./action-form";
import { toast } from "./toast";

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
  const runAction = useRunAction();
  const run = (task: () => Promise<{ error?: string } | void>) =>
    start(async () => {
      if (await runAction(task)) setMode("idle");
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
          if (!at) return toast.error(t("publish.pickTime"));
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
    </div>
  );
}

/** Ends the interest check now (after a confirm) or at a set time. */
export function OpenSignup({
  lanId,
  dateTbd,
  scheduled,
  published,
}: {
  lanId: string;
  dateTbd: boolean;
  /** "Sat 14.11.2026, 18:00" when an opening time is set. */
  scheduled: string | null;
  published: boolean;
}) {
  const t = useT();
  const [pending, start] = useTransition();
  const [scheduling, setScheduling] = useState(false);
  const runAction = useRunAction();
  const run = (task: () => Promise<{ error?: string } | void>) =>
    start(async () => {
      if (await runAction(task)) setScheduling(false);
    });
  if (dateTbd) {
    return <span className="text-sm text-muted">{t("publish.setDateFirst")}</span>;
  }
  if (scheduling) {
    return (
      <form
        className="flex w-full flex-wrap items-center gap-2 sm:w-auto"
        onSubmit={(e) => {
          e.preventDefault();
          const at = String(new FormData(e.currentTarget).get("signupOpensAt") ?? "");
          if (!at) return toast.error(t("publish.pickTime"));
          run(() => scheduleSignup(lanId, at));
        }}
      >
        <div className="min-w-56 flex-1">
          <DateTimePicker name="signupOpensAt" defaultTime="18:00" placeholder={t("publish.openOn")} />
        </div>
        <button disabled={pending} className={btnPrimary}>
          {t("publish.schedule")}
        </button>
        <button type="button" disabled={pending} className={btnGhost} onClick={() => setScheduling(false)}>
          {t("common.cancel")}
        </button>
      </form>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        disabled={pending}
        className={btnPrimary}
        onClick={async () => {
          const ok = await ask({
            title: t("publish.openSignupQ"),
            body: published ? t("publish.openSignupConfirm") : t("publish.openSignupDraft"),
            confirm: t("publish.yesOpen"),
          });
          if (ok) run(() => openSignupNow(lanId));
        }}
      >
        {pending ? t("publish.opening") : t("leadSteps.signup")}
      </button>
      {scheduled ? (
        <button disabled={pending} className={btnSecondary} onClick={() => run(() => scheduleSignup(lanId, null))}>
          {t("publish.unscheduleSignup")}
        </button>
      ) : (
        <button className={btnSecondary} onClick={() => setScheduling(true)}>
          {t("publish.scheduleOpen")}
        </button>
      )}
    </div>
  );
}

export function UndoCancelButton({ lanId }: { lanId: string }) {
  const t = useT();
  const [pending, start] = useTransition();
  const run = useRunAction();
  return (
    <button disabled={pending} className={btnSecondary} onClick={() => start(async () => void (await run(() => uncancelLan(lanId))))}>
      {t("publish.undoCancel")}
    </button>
  );
}
