"use client";

import { useActionState, type ReactNode } from "react";
import type { ActionResult } from "@/app/admin/settings/actions";
import type { SettingView } from "@/lib/settings";
import { btnPrimary, btnSecondary, input, label } from "./ui";

type Action = (prev: ActionResult, form: FormData) => Promise<ActionResult>;

function SourceBadge({ s }: { s: SettingView }) {
  if (s.undecryptable)
    return <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[11px] text-red-300">can&apos;t decrypt, re-enter</span>;
  const map = {
    database: ["Saved here", "bg-bit-soft text-bit"],
    env: [`From ${s.env}`, "bg-sky-500/15 text-sky-300"],
    default: ["Default", "bg-zinc-800 text-zinc-400"],
    unset: ["Not set", "bg-zinc-800 text-zinc-500"],
  } as const;
  const [text, cls] = map[s.source];
  return <span className={`rounded px-1.5 py-0.5 text-[11px] ${cls}`}>{text}</span>;
}

function SettingField({ s }: { s: SettingView }) {
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
          placeholder={s.secretSet ? `•••••••• ${s.secretHint ?? ""} (leave empty to keep)` : "Not set"}
        />
        {s.source === "database" && (
          <label className="mt-1 flex items-center gap-2 text-xs text-zinc-400">
            <input type="checkbox" name={`clear:${s.key}`} className="accent-red-500" />
            Remove saved value{s.env ? ` (fall back to ${s.env})` : ""}
          </label>
        )}
      </>
    );
  } else if (s.kind === "bool" || s.kind === "select") {
    const opts = s.kind === "bool" ? [
      { value: "true", label: "On" },
      { value: "false", label: "Off" },
    ] : (s.options ?? []);
    const fbLabel = opts.find((o) => o.value === fb)?.label ?? (s.kind === "bool" ? (fb === "true" ? "On" : "Off") : "none");
    control = (
      <select name={s.key} id={s.key} defaultValue={s.saved ?? ""} className={input}>
        <option value="">
          {s.env ? `Use ${s.env} / default` : "Use default"} ({fbLabel})
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
      {s.help && <p className="mt-1 text-xs text-zinc-500">{s.help}</p>}
      {s.updatedAt && (
        <p className="mt-1 text-[11px] text-zinc-600">
          Changed {new Date(s.updatedAt).toLocaleString("de-CH")}
          {s.updatedBy ? ` by ${s.updatedBy}` : ""}
        </p>
      )}
    </div>
  );
}

export function Result({ state }: { state: ActionResult }) {
  if (!state) return null;
  return (
    <p aria-live="polite" className={`text-sm ${state.ok ? "text-bit" : "text-red-400"}`}>
      {state.message}
    </p>
  );
}

/** One section of the platform settings, saved on its own. */
export function SettingsSection({ fields, action }: { fields: SettingView[]; action: Action }) {
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
          {pending ? "Saving…" : "Save"}
        </button>
        <Result state={state} />
      </div>
    </form>
  );
}

/** A button that runs a server action (test mail, bot check) and shows its result. */
export function ActionButton({ action, children }: { action: (prev: ActionResult) => Promise<ActionResult>; children: ReactNode }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <button disabled={pending} className={btnSecondary}>
        {pending ? "Working…" : children}
      </button>
      <Result state={state} />
    </form>
  );
}
