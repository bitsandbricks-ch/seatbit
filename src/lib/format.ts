export function fmtDate(d: Date | null | undefined) {
  if (!d) return "—";
  return d.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtDay(d: Date) {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
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

/** "Mon 21 Dec 2026" */
export function fmtWeekday(d: Date) {
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

/** "Mon 21 Dec, 18:00 – Wed 23 Dec 2026, 16:00": the year once when both ends share it. */
export function fmtRange(start: Date, end: Date) {
  const time = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const day = (d: Date, year: boolean) =>
    d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}) });
  const sameYear = start.getFullYear() === end.getFullYear();
  return `${day(start, !sameYear)}, ${time(start)} – ${day(end, true)}, ${time(end)}`;
}
