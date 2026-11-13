"use client";

import { useActionState, type ReactNode } from "react";
import type { ActionResult } from "@/app/admin/settings/actions";
import type { SettingView } from "@/lib/settings";
import { btnPrimary, btnSecondary, input, label } from "./ui";
import { useT } from "@/i18n/client";
import { fmtDate } from "@/lib/format";

type Action = (prev: ActionResult, form: FormData) => Promise<ActionResult>;

function SourceBadge({ s }: { s: SettingView }) {
  const t = useT();
  if (s.undecryptable)
    return <span className="rounded bg-danger/15 px-1.5 py-0.5 text-[11px] text-danger">{t("settingsUi.cantDecrypt")}</span>;
  const map = {
    database: [t("settingsUi.saved"), "bg-bit-soft text-bit"],
    env: [t("settingsUi.fromEnv", { env: s.env }), "bg-seat-taken/15 text-seat-taken"],
    default: [t("settingsUi.default"), "bg-raised text-muted"],
    unset: [t("adminSettings.notSet"), "bg-raised text-faint"],
  } as const;
  const [text, cls] = map[s.source];
  return <span className={`rounded px-1.5 py-0.5 text-[11px] ${cls}`}>{text}</span>;
}

function SettingField({ s }: { s: SettingView }) {
  const t = useT();
  const fb = s.fallback;
  let control: ReactNode;
  if (s.kind === "secret") {
    control = (
      <>
        <input
          name={s.key}
          id={s.key}
          type="password"
          autoComplete="new-password"
          className={input}
          placeholder={s.secretSet ? `•••••••• ${s.secretHint ?? ""} (${t("settingsUi.keep")})` : t("adminSettings.notSet")}
        />
        {s.source === "database" && (
          <label className="mt-1 flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" name={`clear:${s.key}`} className="accent-red-500" />
            {t("settingsUi.remove")}
            {s.env ? ` (${t("settingsUi.fallBack", { env: s.env })})` : ""}
          </label>
        )}
      </>
    );
  } else if (s.kind === "bool" || s.kind === "select") {
    const opts = s.kind === "bool" ? [
      { value: "true", label: t("settingsUi.on") },
      { value: "false", label: t("settingsUi.off") },
    ] : (s.options ?? []);
    const fbLabel = opts.find((o) => o.value === fb)?.label ?? (s.kind === "bool" ? t(fb === "true" ? "settingsUi.on" : "settingsUi.off") : t("settingsUi.none"));
    control = (
      <select name={s.key} id={s.key} defaultValue={s.saved ?? ""} className={input}>
        <option value="">
          {s.env ? t("settingsUi.useEnv", { env: s.env }) : t("settingsUi.useDefault")} ({fbLabel})
        </option>
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  } else {
    control = (
      <input
        name={s.key}
          id={s.key}
        type={s.kind === "number" ? "number" : "text"}
        defaultValue={s.saved ?? ""}
        placeholder={fb ?? s.placeholder ?? ""}
        autoComplete="off"
        spellCheck={false}
        className={input}
      />
    );
  }
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label className={`${label} mb-0`} htmlFor={s.key}>
          {s.label}
        </label>
        <SourceBadge s={s} />
      </div>
      {control}
      {s.help && <p className="mt-1 text-xs text-muted">{s.help}</p>}
      {s.updatedAt && (
        <p className="mt-1 text-[11px] text-faint">
          {t(s.updatedBy ? "settingsUi.changedBy" : "settingsUi.changed", {
            date: fmtDate(new Date(s.updatedAt), t.locale),
            by: s.updatedBy,
          })}
        </p>
      )}
    </div>
  );
}

export function Result({ state }: { state: ActionResult }) {
  if (!state) return null;
  return (
    <p aria-live="polite" className={`text-sm ${state.ok ? "text-bit" : "text-danger"}`}>
      {state.message}
    </p>
  );
}

/** One section of the platform settings, saved on its own. */
export function SettingsSection({ fields, action }: { fields: SettingView[]; action: Action }) {
  const t = useT();
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    // Re-mount after each save so inputs pick up the new saved values.
    <form key={state?.at ?? 0} action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((f) => (
          <SettingField key={f.key} s={f} />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending} className={btnPrimary}>
          {pending ? t("common.saving") : t("common.save")}
        </button>
        <Result state={state} />
      </div>
    </form>
  );
}

/** A button that runs a server action (test mail, bot check) and shows its result. */
export function ActionButton({ action, children }: { action: (prev: ActionResult) => Promise<ActionResult>; children: ReactNode }) {
  const t = useT();
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <button disabled={pending} className={btnSecondary}>
        {pending ? t("settingsUi.working") : children}
      </button>
      <Result state={state} />
    </form>
  );
}
