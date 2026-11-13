"use client";
import { useEffect, useRef } from "react";

/**
 * On narrow screens the tab bar scrolls sideways. Keeps the active tab in view,
 * so a tab far to the right (opened by a link) doesn't look unselected.
 */
export function TabScroll({ active }: { active: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const nav = ref.current?.closest("nav");
    const on = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !on) return;
    const left = on.offsetLeft - nav.offsetLeft;
    if (left < nav.scrollLeft || left + on.offsetWidth > nav.scrollLeft + nav.clientWidth) {
      nav.scrollTo({ left: left - 16, behavior: "instant" });
    }
  }, [active]);
  return <span ref={ref} hidden />;
}
