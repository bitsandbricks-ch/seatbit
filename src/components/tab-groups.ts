import type { Tab } from "./tabs";

/**
 * Keeps a tab bar short: related tabs share one place in the bar, and the open group
 * switches between its parts below it (render `parts` with <Segmented fill>).
 * Every part keeps its own ?tab= id, so old links still land on the right part.
 * `tabs` are the allowed tabs; a group whose parts are all missing is left out.
 */
export function groupTabs(
  groups: string[][],
  tabs: Tab[],
  current: string,
  names: Record<string, string> = {},
): { bar: Tab[]; active: string; parts: Tab[] } {
  const byId = new Map(tabs.map((x) => [x.id, x]));
  const present = groups.map((g) => g.map((id) => byId.get(id)).filter((x): x is Tab => !!x)).filter((g) => g.length > 0);
  const bar = present.map((g): Tab => {
    if (g.length === 1) return g[0];
    // The group's place in the bar opens its first part and carries any part's "to do".
    const waiting = g.find((x) => x.badge);
    return { id: g[0].id, label: names[g[0].id] ?? g[0].label, badge: waiting?.badge, badgeTone: waiting?.badgeTone, dot: waiting?.dot };
  });
  const open = present.find((g) => g.some((x) => x.id === current)) ?? [];
  return { bar, active: open[0]?.id ?? current, parts: open.length > 1 ? open : [] };
}
