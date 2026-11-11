"use client";

import { useActionState, useRef, useState } from "react";
import type { ActionResult } from "@/app/admin/settings/actions";
import { PREVIEW_VARS, fill } from "@/lib/mail-fill";
import { ActionButton, Result } from "./settings-section";
import { btnPrimary, input, label } from "./ui";

type Tpl = {
  id: string;
  title: string;
  when: string;
  vars: Record<string, string>;
  subject: string;
  body: string;
  defaultSubject: string;
  defaultBody: string;
  edited: boolean;
};

/** Edits one mail template, with a live preview filled with example values. */
export function MailTemplateEditor({
  t,
  save,
  reset,
  test,
}: {
  t: Tpl;
  save: (prev: ActionResult, form: FormData) => Promise<ActionResult>;
  reset: (prev: ActionResult) => Promise<ActionResult>;
  test: (prev: ActionResult) => Promise<ActionResult>;
}) {
  const [state, formAction, pending] = useActionState(save, undefined);
  const [subject, setSubject] = useState(t.subject);
  const [body, setBody] = useState(t.body);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  // Pick up the saved text after a save or reset.
  const [savedText, setSavedText] = useState(t.subject + "\0" + t.body);
  if (savedText !== t.subject + "\0" + t.body) {
    setSavedText(t.subject + "\0" + t.body);
    setSubject(t.subject);
    setBody(t.body);
  }
  const vars = Object.fromEntries(Object.keys(t.vars).map((k) => [k, PREVIEW_VARS[k] ?? k]));

  const insert = (name: string) => {
    const el = bodyRef.current;
    const tag = `{${name}}`;
    if (!el) return setBody((b) => b + tag);
    const { selectionStart: a, selectionEnd: b } = el;
    setBody(body.slice(0, a) + tag + body.slice(b));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(a + tag.length, a + tag.length);
    });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{t.when}</p>
      <form action={formAction} className="space-y-3">
        <label className="block">
          <span className={label}>Subject</span>
          <input name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} className={input} maxLength={300} />
        </label>
        <label className="block">
          <span className={label}>Text</span>
          <textarea
            ref={bodyRef}
            name="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={Math.min(16, Math.max(6, body.split("\n").length + 1))}
            className={`${input} font-mono text-sm`}
            maxLength={8000}
          />
        </label>
        <div>
          <span className="mb-1 block text-xs text-faint">
            Placeholders (tap to insert). A line is left out when all its placeholders are empty.
          </span>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(t.vars).map(([k, help]) => (
              <button
                type="button"
                key={k}
                title={help}
                onClick={() => insert(k)}
                className="rounded bg-raised px-1.5 py-0.5 font-mono text-xs text-fg/90 hover:bg-raised/60"
              >
                {`{${k}}`}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button disabled={pending} className={btnPrimary}>
            {pending ? "Saving…" : "Save"}
          </button>
          <Result state={state} />
        </div>
      </form>

      <div className="rounded-md border border-line bg-raised/30 p-3">
        <p className="mb-1 text-[11px] uppercase tracking-wide text-faint">Preview</p>
        <p className="text-sm font-medium">{fill(subject, vars).replace(/\n+/g, " ")}</p>
        <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-sm text-fg/90">{fill(body, vars)}</pre>
      </div>

      <div className="flex flex-wrap gap-3">
        <ActionButton action={test}>Send me a test</ActionButton>
        {(t.edited || subject !== t.defaultSubject || body !== t.defaultBody) && (
          <ActionButton action={reset}>Reset to default</ActionButton>
        )}
      </div>
    </div>
  );
}
