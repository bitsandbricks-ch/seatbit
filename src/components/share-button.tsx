"use client";
import { useEffect, useState } from "react";

const TEXT = {
  share: "Share",
  shareLabel: "Share this event",
  copied: "Link copied",
  copyFailed: "Couldn't copy. Copy the address from the browser bar.",
};

/**
 * Shares a link: the phone's share sheet (WhatsApp, Discord, ...) on touch devices,
 * otherwise copies it and says so in a small toast.
 */
export function ShareButton({ url, title, text }: { url: string; title: string; text: string }) {
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  async function share() {
    // Desktop browsers have navigator.share too, but their sheet is clumsy there; copying is what people expect.
    const touch = window.matchMedia("(pointer: coarse)").matches;
    if (touch && typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    setToast((await copy(url)) ? TEXT.copied : TEXT.copyFailed);
  }

  return (
    <>
      {/* Same frame and height as the View / Manage switch next to it. */}
      <div className="inline-flex rounded-lg border border-line bg-raised p-1">
        <button
          type="button"
          onClick={share}
          aria-label={TEXT.shareLabel}
          title={TEXT.shareLabel}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-md px-3.5 text-sm font-medium text-muted transition hover:bg-surface hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bit"
        >
          <ShareIcon />
          <span>{TEXT.share}</span>
        </button>
      </div>
      <div
        role="status"
        aria-live="polite"
        className={`pointer-events-none fixed inset-x-4 bottom-4 z-50 mx-auto w-fit max-w-[calc(100%-2rem)] rounded-md border border-line bg-raised px-4 py-2.5 text-sm text-fg shadow-lg transition sm:bottom-6 ${
          toast ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
        }`}
      >
        {toast && (
          <span className="inline-flex items-center gap-2">
            {toast === TEXT.copied && <span aria-hidden className="text-bit">✓</span>}
            {toast}
          </span>
        )}
      </div>
    </>
  );
}

async function copy(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    // No clipboard API (plain http, older browsers): the old selection trick.
    const el = document.createElement("textarea");
    el.value = value;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    el.remove();
    return ok;
  }
}

function ShareIcon() {
  return (
    <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
      <path d="M16 6l-4-4-4 4" />
      <path d="M12 2v13" />
    </svg>
  );
}
