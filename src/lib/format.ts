// Dates are shown Swiss style with a 24h clock: "Sat 14.11.2026, 18:00" ("Sa 14.11.2026, 18:00"
// in German). Built by hand so the browser/server locale can never switch it to AM/PM or
// month-first. Every formatter takes the language last; it defaults to English.
import type { Locale } from "@/i18n/config";

const WD: Record<Locale, string[]> = {
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  de: ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"],
};
const p2 = (n: number) => String(n).padStart(2, "0");
const dmy = (d: Date) => `${p2(d.getDate())}.${p2(d.getMonth() + 1)}.${d.getFullYear()}`;
const hm = (d: Date) => `${p2(d.getHours())}:${p2(d.getMinutes())}`;
const wd = (d: Date, loc: Locale) => (WD[loc] ?? WD.en)[d.getDay()];

/** "Sat 14.11.2026, 18:00" */
export function fmtDate(d: Date | null | undefined, loc: Locale = "en") {
  if (!d) return "—";
  return `${wd(d, loc)} ${dmy(d)}, ${hm(d)}`;
}

/** "14.11.2026" */
export function fmtDay(d: Date) {
  return dmy(d);
}

/** "14:00" */
export function fmtTime(d: Date) {
  return hm(d);
}

/** Value for <input type="datetime-local">, in server-local time. */
export function toInputValue(d: Date | null | undefined) {
  if (!d) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** "in 3 days", "2 hours ago" ("in 3 Tagen", "vor 2 Stunden") */
export function relative(d: Date, now = new Date(), loc: Locale = "en") {
  const diff = d.getTime() - now.getTime();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(loc, { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86400000],
    ["hour", 3600000],
    ["minute", 60000],
  ];
  for (const [unit, ms] of units) {
    if (abs >= ms || unit === "minute") return rtf.format(Math.round(diff / ms), unit);
  }
  return "";
}

/** "Sat 14.11.2026" */
export function fmtWeekday(d: Date, loc: Locale = "en") {
  return `${wd(d, loc)} ${dmy(d)}`;
}

/** "Fri 11.12., 18:00 – Sun 13.12.2026, 16:00": the year once when both ends share it. */
export function fmtRange(start: Date, end: Date, loc: Locale = "en") {
  const sameYear = start.getFullYear() === end.getFullYear();
  const startDay = sameYear ? `${p2(start.getDate())}.${p2(start.getMonth() + 1)}.` : dmy(start);
  return `${wd(start, loc)} ${startDay}, ${hm(start)} – ${wd(end, loc)} ${dmy(end)}, ${hm(end)}`;
}

type When = { startsAt: Date; endsAt: Date; dateTbd?: boolean; dateHint?: string };
const OPEN = {
  en: { hint: (h: string) => `Date not set (${h})`, none: "Date not set yet", short: "Date open" },
  de: { hint: (h: string) => `Datum offen (${h})`, none: "Datum noch offen", short: "Datum offen" },
} satisfies Record<Locale, unknown>;
const tbd = (l: When, loc: Locale) => (l.dateHint ? OPEN[loc].hint(l.dateHint) : OPEN[loc].none);

/** The event's dates as a range, or "Date not set (spring 2027)" while the date is open. */
export const lanRange = (l: When, loc: Locale = "en") => (l.dateTbd ? tbd(l, loc) : fmtRange(l.startsAt, l.endsAt, loc));
/** "14.11.2026", or the date hint while the date is open. */
export const lanDay = (l: When, loc: Locale = "en") => (l.dateTbd ? l.dateHint || OPEN[loc].short : fmtDay(l.startsAt));
/** "Sat 14.11.2026", or the open-date text. */
export const lanWeekday = (l: When, loc: Locale = "en") => (l.dateTbd ? tbd(l, loc) : fmtWeekday(l.startsAt, loc));
/** "Sat 14.11.2026, 18:00", or the open-date text. */
export const lanStart = (l: When, loc: Locale = "en") => (l.dateTbd ? tbd(l, loc) : fmtDate(l.startsAt, loc));

/** "512 KB", "1.4 MB", "2.1 GB" (binary units, one decimal from MB up). */
export function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}
