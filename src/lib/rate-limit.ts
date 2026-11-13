import "server-only";

/**
 * Small in-memory limiter for actions that send mails or Discord messages, so one account can't
 * use Seatbit to spam people. Seatbit runs as one process (SQLite), so memory is enough; a restart
 * forgets the counts, which is fine for this purpose.
 */
const g = globalThis as unknown as { __seatbitRate?: Map<string, number[]> };
const hits = (g.__seatbitRate ??= new Map());

/** Limits per kind of action: at most `max` within `windowMs`, per account. */
export const LIMITS = {
  /** Mails and DMs a lead triggers by hand: news, reminders, nudges, guest invites, payment reminders. */
  send: { max: 30, windowMs: 60 * 60 * 1000 },
  /** New clans per account. */
  clan: { max: 5, windowMs: 24 * 60 * 60 * 1000 },
  /** Test DMs from the profile. */
  test: { max: 5, windowMs: 10 * 60 * 1000 },
} as const;

/** Counts one use; true when the account is over the limit (the use isn't counted then). */
export function overLimit(kind: keyof typeof LIMITS, userId: string, now = Date.now()) {
  const { max, windowMs } = LIMITS[kind];
  const key = `${kind}:${userId}`;
  const recent = (hits.get(key) ?? []).filter((t: number) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  // Keep the map from growing forever.
  if (hits.size > 10_000) for (const [k, v] of hits) if (!v.some((t: number) => now - t < windowMs)) hits.delete(k);
  return false;
}

/** For server actions: throws a translated "slow down" error when over the limit. */
export async function enforceLimit(kind: keyof typeof LIMITS, userId: string) {
  if (!overLimit(kind, userId)) return;
  const { err } = await import("@/i18n/server");
  throw await err("errors.tooMany");
}
