/** Placeholder filling for mail templates. No server imports, so the admin editor can preview in the browser. */

/**
 * Fills in {placeholders}. Unknown placeholders stay as written, so a typo is visible.
 * Lines whose placeholders all came out empty are dropped.
 */
export function fill(text: string, vars: Record<string, string | null | undefined>) {
  const lines = text.split("\n").flatMap((line) => {
    const names = [...line.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((n) => n in vars);
    if (names.length && names.every((n) => !vars[n]?.trim())) return [];
    return [line.replace(/\{(\w+)\}/g, (m, n: string) => (n in vars ? (vars[n] ?? "") : m))];
  });
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Example values for the admin preview. */
export const PREVIEW_VARS: Record<string, string> = {
  firstName: "Anna",
  lan: "Lock&Load 2027",
  start: "12 Mar 2027, 18:00",
  location: "Forum Fribourg",
  link: "https://seatbit.ch/lans/…",
  deadline: "1 Feb 2027, 23:59",
  price: "CHF 65",
  ticketUrl: "https://lal.gg/tickets",
  seat: "F7",
  seatInfo: "You're sitting at F7.",
  clan: "The dark lizzards gizzards wizzards",
  inviter: "Mike",
  events: "Lock&Load 2027 (12 Mar 2027)",
};
