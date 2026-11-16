"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Tabs, type Tab } from "./tabs";
import { Segmented } from "./ui";

/** A tab in the bar. With `parts`, it groups several panels behind a small switch (e.g. Trip: travel, packing, ...). */
export type ClientTab = Tab & {
  parts?: { id: string; label: string; dot?: boolean; server?: boolean }[];
  /** Opens with a normal page load, e.g. when reading its data is logged and must only happen on purpose. */
  server?: boolean;
};

/**
 * Tabs that switch on the client: every panel is rendered by the server at once, a tap only shows another one, so
 * switching is instant (no server round trip, no loading screen). The URL still follows (?tab=<id>), so reloads,
 * bookmarks, the back button and links from mails land on the right panel. Any link on the page to ?tab=<id> of the
 * same page switches the same way, e.g. the guide's buttons or the overview's list.
 *
 * Usage: <ClientTabs tabs={...} initial={tab} base={path}> ...<TabPanel id="seats">...</TabPanel>... </ClientTabs>.
 * Anything in between that isn't a TabPanel shows on every tab.
 */
export function ClientTabs({
  tabs,
  initial,
  base,
  label,
  partsLabel,
  children,
}: {
  tabs: ClientTab[];
  /** The panel from the URL when the page loaded. */
  initial: string;
  /** The page's path, e.g. /lans/123; the first tab lives there without ?tab=. */
  base: string;
  label?: string;
  /** Accessible name of a group's switch. */
  partsLabel?: string;
  children: ReactNode;
}) {
  const [active, setActive] = useState(initial);
  // A server render with another ?tab= (e.g. the router following our pushState) brings its panel; follow it.
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setActive(initial);
  }

  const first = tabs[0]?.id;
  const ids = new Set(tabs.flatMap((t) => (t.parts ? t.parts.filter((p) => !p.server).map((p) => p.id) : t.server ? [] : [t.id])));
  const hrefFor = (id: string) => (id === first ? base : `${base}?tab=${id}`);

  useEffect(() => {
    const groups = new Map(tabs.flatMap((t) => (t.parts?.length ? [[t.id, t.parts[0].id] as const] : [])));
    const show = (id: string, push: boolean) => {
      const leaf = groups.get(id) ?? id;
      setActive(leaf);
      if (push) window.history.pushState(null, "", leaf === first ? base : `${base}?tab=${leaf}`);
    };
    // Capture phase, before Next's <Link> handles the click: same page, known panel, plain left click.
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || a.target === "_blank") return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname !== base || url.hash) return;
      // Other params (a pager, a filter) need the server, so those links navigate normally.
      if ([...url.searchParams.keys()].some((k) => k !== "tab")) return;
      const id = url.searchParams.get("tab") ?? first;
      if (!id || (!ids.has(id) && !groups.has(id))) return;
      e.preventDefault();
      show(id, true);
    };
    const onPop = () => {
      const id = new URL(window.location.href).searchParams.get("tab") ?? first;
      if (id && (ids.has(id) || groups.has(id))) show(id, false);
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPop);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPop);
    };
    // ids/groups derive from tabs; re-binding on every render is cheap but pointless.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, first, JSON.stringify(tabs.map((t) => [t.id, t.parts?.map((p) => p.id)]))]);

  const group = tabs.find((t) => t.parts?.some((p) => p.id === active));
  return (
    <>
      <Tabs
        tabs={tabs}
        active={group?.id ?? active}
        hrefFor={(id) => {
          const t = tabs.find((x) => x.id === id);
          return hrefFor(t?.parts?.[0]?.id ?? id);
        }}
        label={label}
      />
      {group?.parts && (
        <Segmented
          label={partsLabel}
          value={active}
          fill
          options={group.parts.map((p) => ({ id: p.id, href: hrefFor(p.id), label: p.label, dot: p.dot }))}
        />
      )}
      <Active.Provider value={active}>{children}</Active.Provider>
    </>
  );
}

const Active = createContext<string | null>(null);

/** One tab's content. Several panels may share an id; they show and hide together. */
export function TabPanel({ id, children }: { id: string; children: ReactNode }) {
  const active = useContext(Active);
  return (
    <div hidden={active !== id} className="space-y-4 sm:space-y-6">
      {children}
    </div>
  );
}
