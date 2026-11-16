/** Moving an event's start in the form: how the other dates follow ("YYYY-MM-DDTHH:MM", local time). */

const pad = (n: number) => String(n).padStart(2, "0");
export const toLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const fromLocal = (v: string) => (v ? new Date(v) : null);
const valid = (d: Date | null): d is Date => !!d && !isNaN(d.getTime());

/** The end keeps the event's length: moved by exactly as much as the start. "" when there's nothing to move. */
export function shiftExact(value: string, prevStart: string, nextStart: string) {
  const d = fromLocal(value);
  const prev = fromLocal(prevStart);
  const next = fromLocal(nextStart);
  if (!valid(d) || !valid(prev) || !valid(next)) return "";
  return toLocal(new Date(d.getTime() + next.getTime() - prev.getTime()));
}

/**
 * Deadlines move by the same number of days but keep their own time, so "answer by 23:59" stays at
 * 23:59 when the start moves from 18:00 to 10:00. "" when there's nothing to move.
 */
export function shiftDays(value: string, prevStart: string, nextStart: string) {
  const d = fromLocal(value);
  const prev = fromLocal(prevStart);
  const next = fromLocal(nextStart);
  if (!valid(d) || !valid(prev) || !valid(next)) return "";
  const day = (x: Date) => Date.UTC(x.getFullYear(), x.getMonth(), x.getDate());
  const days = Math.round((day(next) - day(prev)) / 86_400_000);
  const moved = new Date(d);
  moved.setDate(moved.getDate() + days);
  return toLocal(moved);
}
