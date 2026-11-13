import type { T } from "../i18n/translate";
import { fmtDate, fmtRange, fmtTime } from "./format";
import { getSetting } from "./settings";

export type Maintenance = { message: string; startsAt?: Date; endsAt?: Date; state: "planned" | "now" };

/** "2026-11-14T18:00" (server-local time, as the date picker saves it) to a Date. */
const at = (v: string | undefined) => {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

/** The maintenance banner to show right now, or null (no message, or the end has passed). */
export function currentMaintenance(now = new Date()): Maintenance | null {
  const message = getSetting("maintenance.message")?.trim();
  if (!message) return null;
  const startsAt = at(getSetting("maintenance.startsAt"));
  const endsAt = at(getSetting("maintenance.endsAt"));
  if (endsAt && endsAt <= now) return null;
  return { message, startsAt, endsAt, state: startsAt && startsAt > now ? "planned" : "now" };
}

/** "Sat 14.11.2026, 22:00 – 23:00" on one day, else the usual range. */
const range = (a: Date, b: Date, t: T) =>
  a.toDateString() === b.toDateString() ? `${fmtDate(a, t.locale)} – ${fmtTime(b)}` : fmtRange(a, b, t.locale);

/** One line on when, e.g. "Planned maintenance Sat 14.11.2026, 18:00 – 20:00:" (banner and Discord post). */
export function maintenanceTitle(m: Maintenance, t: T) {
  if (m.state === "planned")
    return m.endsAt
      ? t("maintenance.plannedRange", { range: range(m.startsAt!, m.endsAt, t) })
      : t("maintenance.plannedFrom", { start: fmtDate(m.startsAt, t.locale) });
  return m.endsAt ? t("maintenance.nowUntil", { end: fmtDate(m.endsAt, t.locale) }) : t("maintenance.now");
}
