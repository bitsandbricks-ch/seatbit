"use client";

import { useActionState, useRef, useState } from "react";
import type { ActionResult } from "@/app/admin/settings/actions";
import { type FactRow, type TemplateParts, buildMail, factLabel, previewVars } from "@/lib/mail-fill";
import { useT } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { ActionButton, Result } from "./settings-section";
import { btnPrimary, input, label } from "./ui";

type Tpl = {
  id: string;
  when: string;
  vars: Record<string, string>;
  facts: FactRow[];
  current: TemplateParts;
  defaults: TemplateParts;
  edited: boolean;
  locale: Locale;
};

type Field = keyof TemplateParts;
const same = (a: TemplateParts, b: TemplateParts) =>
  a.subject === b.subject && a.body === b.body && a.button === b.button && a.note === b.note;

/**
 * Edits one mail template: subject, text, button label and note. The facts box and
 * layout are fixed; the preview renders the real HTML mail with example values.
 */
export function MailTemplateEditor({
  t,
  appUrl,
  save,
  reset,
  test,
}: {
  t: Tpl;
  appUrl: string;
  save: (prev: ActionResult, form: FormData) => Promise<ActionResult>;
  reset: (prev: ActionResult) => Promise<ActionResult>;
  test: (prev: ActionResult) => Promise<ActionResult>;
}) {
  const tr = useT();
  const [state, formAction, pending] = useActionState(save, undefined);
  const [parts, setParts] = useState(t.current);
  // Pick up the saved text after a save or reset.
  const [saved, setSaved] = useState(t.current);
  if (!same(saved, t.current)) {
    setSaved(t.current);
    setParts(t.current);
  }
  const refs = useRef<Partial<Record<Field, HTMLInputElement | HTMLTextAreaElement | null>>>({});
  const [focus, setFocus] = useState<Field>("body");
  const set = (f: Field, v: string) => setParts((p) => ({ ...p, [f]: v }));

  const insert = (name: string) => {
    const el = refs.current[focus];
    const tag = `{${name}}`;
    const value = parts[focus];
    const a = el?.selectionStart ?? value.length;
    const b = el?.selectionEnd ?? value.length;
    set(focus, value.slice(0, a) + tag + value.slice(b));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(a + tag.length, a + tag.length);
    });
  };

  const examples = previewVars(t.locale);
  const vars = Object.fromEntries(Object.keys(t.vars).map((k) => [k, examples[k] ?? k]));
  const preview = buildMail(parts, t.facts, vars, { appUrl, locale: t.locale });

  const line = (f: Field, l: string, hint?: string) => (
    <label className="block">
      <span className={label}>{l}</span>
      <input
        ref={(el) => {
          refs.current[f] = el;
        }}
        name={f}
        value={parts[f]}
        onChange={(e) => set(f, e.target.value)}
        onFocus={() => setFocus(f)}
        className={input}
        maxLength={300}
      />
      {hint && <span className="mt-1 block text-xs text-faint">{hint}</span>}
    </label>
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{t.when}</p>
      <div className="grid gap-5 lg:grid-cols-2">
        <form action={formAction} className="space-y-3">
          {line("subject", tr("templateEditor.subject"))}
          <label className="block">
            <span className={label}>{tr("templateEditor.text")}</span>
            <textarea
              ref={(el) => {
                refs.current.body = el;
              }}
              name="body"
              value={parts.body}
              onChange={(e) => set("body", e.target.value)}
              onFocus={() => setFocus("body")}
              rows={Math.min(14, Math.max(5, parts.body.split("\n").length + 2))}
              className={`${input} text-sm`}
              maxLength={8000}
            />
            <span className="mt-1 block text-xs text-faint">{tr("templateEditor.textHint", { greeting: "{firstName}" })}</span>
          </label>
          {line("button", tr("templateEditor.button"), tr("templateEditor.buttonHint"))}
          {line("note", tr("templateEditor.note"), tr("templateEditor.noteHint"))}
          <div>
            <span className="mb-1 block text-xs text-faint">
              {tr("templateEditor.placeholders", { field: tr(`templateEditor.field.${focus}`) })}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(t.vars).map(([k, help]) => (
                <button
                  type="button"
                  key={k}
                  title={help}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insert(k)}
                  className="rounded bg-raised px-1.5 py-0.5 font-mono text-xs text-fg/90 hover:bg-raised/60"
                >
                  {`{${k}}`}
                </button>
              ))}
            </div>
          </div>
          {t.facts.length > 0 && (
            <p className="text-xs text-faint">
              {tr("templateEditor.facts", { list: t.facts.map(([l]) => factLabel(l, tr.locale)).join(", ") })}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button disabled={pending} className={btnPrimary}>
              {pending ? tr("common.saving") : tr("common.save")}
            </button>
            <Result state={state} />
          </div>
        </form>

        <div className="min-w-0">
          <p className="mb-1 text-[11px] uppercase tracking-wide text-faint">{tr("templateEditor.preview")}</p>
          <p className="mb-2 truncate text-sm font-medium">{preview.subject}</p>
          <iframe
            title={tr("templateEditor.previewOf", { id: t.id })}
            srcDoc={preview.html}
            sandbox=""
            className="h-[560px] w-full rounded-md border border-line bg-white"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <ActionButton action={test}>{tr("templateEditor.test")}</ActionButton>
        {(t.edited || !same(parts, t.defaults)) && <ActionButton action={reset}>{tr("templateEditor.reset")}</ActionButton>}
      </div>
    </div>
  );
}
