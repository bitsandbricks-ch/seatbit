"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { useT } from "@/i18n/client";

// A panel for details and actions next to a list: slides in from the right on desktop, a
// bottom sheet on phones. Used with an intercepted route (`@panel/(.)members/[id]`), so the
// list stays where it was, the URL can be shared, and Back closes the panel. Opening the same
// URL directly shows the full page instead.

export function SidePanel({
  title,
  children,
  fullHref,
  onClose,
}: {
  /** Heading of the panel (name, title). */
  title: ReactNode;
  children: ReactNode;
  /** "Open as page" link, for people who want the whole page. */
  fullHref?: string;
  /** Defaults to going back, which also undoes the URL change. */
  onClose?: () => void;
}) {
  const t = useT();
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const close = onClose ?? (() => router.back());

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby="side-panel-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      className="side-panel m-0 mt-auto h-[88dvh] max-h-none w-full max-w-none overflow-hidden rounded-t-card border border-line bg-bg p-0 text-fg shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-[2px] sm:ml-auto sm:mt-0 sm:h-dvh sm:w-[30rem] sm:rounded-none sm:border-y-0 sm:border-r-0 lg:w-[34rem]"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
          <h2 id="side-panel-title" className="min-w-0 truncate text-base font-semibold">
            {title}
          </h2>
          <div className="flex shrink-0 items-center gap-1">
            {fullHref && (
              // A plain link: a full load shows the page, not the panel again.
              <a href={fullHref} className="rounded-md px-2 py-1.5 text-sm text-muted hover:bg-raised hover:text-fg">
                {t("sidePanel.openPage")}
              </a>
            )}
            <button
              type="button"
              onClick={close}
              aria-label={t("sidePanel.close")}
              className="grid size-9 place-items-center rounded-md text-muted hover:bg-raised hover:text-fg"
            >
              <svg viewBox="0 0 20 20" className="size-5" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M5 5l10 10M15 5L5 15" />
              </svg>
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-5">
          {children}
        </div>
      </div>
    </dialog>
  );
}

