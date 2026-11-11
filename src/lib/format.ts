// Dates are shown Swiss style with a 24h clock: "Sat 14.11.2026, 18:00". Built by hand so the
// browser/server locale can never switch it to AM/PM or month-first.
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const p2 = (n: number) => String(n).padStart(2, "0");
const dmy = (d: Date) => `${p2(d.getDate())}.${p2(d.getMonth() + 1)}.${d.getFullYear()}`;
const hm = (d: Date) => `${p2(d.getHours())}:${p2(d.getMinutes())}`;

/** "Sat 14.11.2026, 18:00" */
export function fmtDate(d: Date | null | undefined) {
  if (!d) return "—";
  return `${WD[d.getDay()]} ${dmy(d)}, ${hm(d)}`;
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

/** "in 3 days", "2 hours ago" */
export function relative(d: Date, now = new Date()) {
  const diff = d.getTime() - now.getTime();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
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
export function fmtWeekday(d: Date) {
  return `${WD[d.getDay()]} ${dmy(d)}`;
}

/** "Fri 11.12., 18:00 – Sun 13.12.2026, 16:00": the year once when both ends share it. */
export function fmtRange(start: Date, end: Date) {
  const sameYear = start.getFullYear() === end.getFullYear();
  const startDay = sameYear ? `${p2(start.getDate())}.${p2(start.getMonth() + 1)}.` : dmy(start);
  return `${WD[start.getDay()]} ${startDay}, ${hm(start)} – ${WD[end.getDay()]} ${dmy(end)}, ${hm(end)}`;
}
