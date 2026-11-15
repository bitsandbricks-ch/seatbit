"use client";
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { useT } from "@/i18n/client";
import { btnDanger, btnPrimary, btnSecondary } from "./ui";

// Built-in confirm dialog instead of the browser's confirm(): same look in every browser and
// theme, translated buttons, and a clear danger colour for things that can't be undone.
// Like toast.tsx it is one module-level store, so any client code can
//   if (!(await ask({ title: "Remove Anna?", confirm: "Remove", danger: true }))) return;
// and the one <DialogHost /> in the root layout shows it.

export type AskOptions = {
  /** The question, e.g. "Remove Anna from the clan?". */
  title: string;
  /** Optional detail below the question: what happens, who gets notified. */
  body?: ReactNode;
  /** Label of the confirm button; defaults to "OK". Name the action ("Delete", "Send"). */
  confirm?: string;
  /** Red confirm button for deletes and removals. */
  danger?: boolean;
};

type Pending = AskOptions & { id: number; resolve: (ok: boolean) => void };

let queue: Pending[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Opens the confirm dialog; resolves true when the person confirms, false on cancel or Escape. */
export function ask(options: AskOptions | string): Promise<boolean> {
  const o = typeof options === "string" ? { title: options } : options;
  // Without the host (e.g. a test page that left out the layout) fall back to the browser.
  if (!hostMounted) return Promise.resolve(window.confirm(o.title));
  return new Promise((resolve) => {
    queue = [...queue, { ...o, id: nextId++, resolve }];
    emit();
  });
}

function settle(id: number, ok: boolean) {
  const p = queue.find((x) => x.id === id);
  if (!p) return;
  queue = queue.filter((x) => x !== p);
  emit();
  p.resolve(ok);
}

let hostMounted = false;
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = () => queue;
const serverSnapshot = (): Pending[] => [];

/** Renders the open confirm dialog. Mounted once in the root layout. */
export function DialogHost() {
  const t = useT();
  const items = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const current = items[0];
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    hostMounted = true;
    return () => {
      hostMounted = false;
    };
  }, []);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (current && !d.open) d.showModal();
    if (!current && d.open) d.close();
  }, [current]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="ask-title"
      aria-describedby={current?.body ? "ask-body" : undefined}
      // Escape fires "cancel"; keep the element open until the store closes it.
      onCancel={(e) => {
        e.preventDefault();
        if (current) settle(current.id, false);
      }}
      // A click on the backdrop (outside the panel) cancels, like most app dialogs.
      onClick={(e) => {
        if (e.target === e.currentTarget && current) settle(current.id, false);
      }}
      className="m-0 mt-auto w-full max-w-none rounded-t-card border border-line bg-surface p-0 text-fg shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-[2px] sm:m-auto sm:max-w-md sm:rounded-card"
    >
      {current && (
        <form
          method="dialog"
          className="space-y-4 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6"
          onSubmit={(e) => {
            e.preventDefault();
            settle(current.id, true);
          }}
        >
          <h2 id="ask-title" className="text-base font-semibold leading-snug">
            {current.title}
          </h2>
          {current.body && (
            <div id="ask-body" className="text-sm text-muted">
              {current.body}
            </div>
          )}
          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <button type="button" className={btnSecondary} onClick={() => settle(current.id, false)}>
              {t("dialog.cancel")}
            </button>
            {/* autoFocus on confirm only when it is harmless; a delete starts on Cancel. */}
            <button type="submit" className={current.danger ? btnDanger : btnPrimary} autoFocus={!current.danger}>
              {current.confirm ?? t("dialog.ok")}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}
