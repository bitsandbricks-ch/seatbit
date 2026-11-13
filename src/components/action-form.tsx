"use client";
import { useActionState, useCallback, type ComponentProps, type FocusEvent, type FormEvent } from "react";
import { unstable_rethrow } from "next/navigation";
import { useT } from "@/i18n/client";
import { actionErrorText } from "@/lib/action-error";
import { toast } from "./toast";

// One way for every server action to report back: a toast when it worked, a toast with the
// reason when it didn't. Three entry points for the three ways actions are called:
//   <ActionForm action={...}>        a plain form (also from server components)
//   useToastAction(action, initial)  instead of useActionState
//   const run = useRunAction(); run(() => action(...))   buttons, transitions
//
// `success` is the note for a good result: leave it out for "Saved.", pass your own text,
// a function of the result, or false for no toast (when the page change says enough).

export type Success<R = unknown> = string | false | ((result: R) => string | false | undefined);

/** `{ error }` and `{ ok: false, message }` results are failures; their text is for people. */
function failure(r: unknown): string | null {
  if (!r || typeof r !== "object") return null;
  const o = r as { error?: unknown; ok?: unknown; message?: unknown };
  if (typeof o.error === "string" && o.error) return o.error;
  if (o.ok === false && typeof o.message === "string" && o.message) return o.message;
  return null;
}

/** Results like `{ ok: true, message }` bring their own success text. */
function ownMessage(r: unknown): string | null {
  if (!r || typeof r !== "object") return null;
  const o = r as { ok?: unknown; message?: unknown };
  return o.ok === true && typeof o.message === "string" && o.message ? o.message : null;
}

const isRedirect = (e: unknown) =>
  !!e && typeof e === "object" && String((e as { digest?: unknown }).digest ?? "").startsWith("NEXT_REDIRECT");

function useNotify() {
  const t = useT();
  const done = useCallback(
    <R,>(r: R, success: Success<R> | undefined) => {
      const bad = failure(r);
      if (bad) return void toast.error(bad);
      const text = typeof success === "function" ? success(r) : success;
      if (text === false) return;
      toast.success(text ?? ownMessage(r) ?? t("toast.saved"));
    },
    [t],
  );
  const failed = useCallback(
    (e: unknown, success: Success | undefined) => {
      // A redirect at the end of an action (create, delete, join) means it worked.
      if (isRedirect(e) && typeof success !== "function" && success !== false) toast.success(success ?? t("toast.saved"));
      unstable_rethrow(e);
      console.error(e);
      toast.error(actionErrorText(e) ?? t("toast.failed"));
    },
    [t],
  );
  return { done, failed };
}

/** Runs a server action from a click or transition and toasts the outcome. Resolves to true when it worked. */
export function useRunAction() {
  const { done, failed } = useNotify();
  return useCallback(
    async <R,>(fn: () => Promise<R>, success?: Success<R>): Promise<boolean> => {
      try {
        const r = await fn();
        done(r, success);
        return !failure(r);
      } catch (e) {
        failed(e, success as Success);
        return false;
      }
    },
    [done, failed],
  );
}

/** useActionState that toasts the outcome. A thrown error keeps the previous state instead of breaking the page. */
export function useToastAction<S, P = FormData>(action: (state: Awaited<S>, payload: P) => Promise<S>, initial: Awaited<S>, success?: Success<Awaited<S>>) {
  const { done, failed } = useNotify();
  return useActionState<S, P>(async (prev: Awaited<S>, payload: P) => {
    try {
      const r = await action(prev, payload);
      done(r as Awaited<S>, success);
      return r;
    } catch (e) {
      failed(e, success as Success);
      return prev;
    }
  }, initial);
}

const isToggle = (el: Element) =>
  el instanceof HTMLSelectElement || (el instanceof HTMLInputElement && ["checkbox", "radio", "file"].includes(el.type));
const isText = (el: Element) =>
  el instanceof HTMLTextAreaElement ||
  (el instanceof HTMLInputElement && ["text", "search", "email", "url", "tel", "number"].includes(el.type));

/**
 * Auto-save for a form: spread on the <form>. "toggles" saves when a checkbox, radio, select or
 * file changes (the form keeps its Save button for its text); "all" also saves a text field when
 * it loses focus with a new value (Enter submits as usual), so the form needs no Save button.
 * The toast says whether it worked.
 */
export function autoSave(mode: "toggles" | "all") {
  return {
    onChange: (e: FormEvent<HTMLFormElement>) => {
      if (isToggle(e.target as Element)) e.currentTarget.requestSubmit();
    },
    onBlur:
      mode === "all"
        ? (e: FocusEvent<HTMLFormElement>) => {
            const el = e.target as unknown as HTMLInputElement | HTMLTextAreaElement;
            if (isText(el) && el.value !== el.defaultValue) e.currentTarget.requestSubmit();
          }
        : undefined,
  };
}

/**
 * A form that runs a server action and toasts the outcome. Usable from server components.
 * `done` picks the success note ("Saved." by default); false for none, e.g. when the action
 * leaves for another site or page that speaks for itself. `success` is a text of your own.
 */
export function ActionForm({
  action,
  done = "saved",
  success,
  auto,
  ...props
}: Omit<ComponentProps<"form">, "action"> & {
  action: (form: FormData) => Promise<unknown>;
  done?: "saved" | "deleted" | "removed" | false;
  success?: string;
  /** Save without a button, see autoSave(). */
  auto?: "toggles" | "all";
}) {
  const t = useT();
  const run = useRunAction();
  const text = success ?? (done && t(`toast.${done}`));
  return <form {...props} {...(auto ? autoSave(auto) : {})} action={(form) => run(() => action(form), text).then(() => undefined)} />;
}
