"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Wait this long after a change before refreshing, so a few quick changes cause one refresh. */
const DEBOUNCE_MS = 400;
/** Only when the live stream can't be opened at all: refresh on a timer instead. */
const FALLBACK_MS = 30_000;

const TEXT_INPUTS = new Set(["text", "search", "email", "url", "tel", "number", "password", "date", "time", "datetime-local"]);

/** Typing, choosing in a dropdown, dragging or a dialog open: a refresh now would get in the way. */
function busy(dragging: boolean) {
  if (dragging || document.querySelector("dialog[open]")) return true;
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable || el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
  return el.tagName === "INPUT" && TEXT_INPUTS.has((el as HTMLInputElement).type);
}

/**
 * Keeps an event page up to date: listens to /api/live/<event> and re-renders the page when
 * someone else changed something (answers, tickets, seats, wishes, games, food, costs, travel).
 * Waits while you type or the tab is in the background, then catches up.
 */
export function LiveRefresh({ lanId }: { lanId: string }) {
  const router = useRouter();
  useEffect(() => {
    let pending = false;
    let dragging = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let fallback: ReturnType<typeof setInterval> | undefined;
    let hadError = false;

    const flush = () => {
      timer = undefined;
      if (!pending) return;
      if (document.visibilityState !== "visible") return; // onVisible picks it up
      if (busy(dragging)) {
        timer = setTimeout(flush, 1_000);
        return;
      }
      pending = false;
      router.refresh();
    };
    const changed = () => {
      pending = true;
      if (!timer) timer = setTimeout(flush, DEBOUNCE_MS);
    };

    const es = new EventSource(`/api/live/${encodeURIComponent(lanId)}`);
    es.onmessage = changed;
    es.onopen = () => {
      // Back after a dropped connection (deploy, network): changes may have been missed.
      if (hadError) changed();
      hadError = false;
    };
    es.onerror = () => {
      hadError = true;
      // CLOSED means the browser gave up (not allowed, server busy): poll slowly instead.
      if (es.readyState === EventSource.CLOSED && !fallback) {
        fallback = setInterval(() => document.visibilityState === "visible" && changed(), FALLBACK_MS);
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible" && pending && !timer) timer = setTimeout(flush, DEBOUNCE_MS);
    };
    const down = () => (dragging = true);
    const up = () => (dragging = false);
    document.addEventListener("visibilitychange", onVisible);
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("pointerup", up, true);
    document.addEventListener("pointercancel", up, true);
    return () => {
      es.close();
      clearTimeout(timer);
      clearInterval(fallback);
      document.removeEventListener("visibilitychange", onVisible);
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("pointerup", up, true);
      document.removeEventListener("pointercancel", up, true);
    };
  }, [lanId, router]);
  return null;
}
