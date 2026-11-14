"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { seatPlanVersion } from "@/app/seat-plan-actions";

const EVERY_MS = 8_000;

/**
 * Keeps a seat page up to date: asks for the plan's fingerprint every few seconds while the
 * tab is visible and refreshes the page when it changed (someone moved, wished or was planned).
 */
export function LiveSeatRefresh({ lanId }: { lanId: string }) {
  const router = useRouter();
  const last = useRef<string | null>(null);
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const v = await seatPlanVersion(lanId);
        if (stop) return;
        if (last.current !== null && v !== last.current) router.refresh();
        last.current = v;
      } catch {
        // Offline or signed out: try again next time.
      }
    };
    void tick();
    const id = setInterval(tick, EVERY_MS);
    const onVisible = () => void tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stop = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [lanId, router]);
  return null;
}
