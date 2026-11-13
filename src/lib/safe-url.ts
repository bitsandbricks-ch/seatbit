/** Checks for links and redirect targets that come from users. Client-safe. */
import { z } from "zod";

/**
 * A same-site path to send someone back to after signing in, or `fallback`.
 * Rejects absolute URLs and the forms browsers read as one: "//host", "/\host",
 * and control characters (a tab or newline inside "/\t/host" is dropped by the URL parser).
 */
export function safeNext(raw: unknown, fallback = "/"): string {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.length > 2000) return fallback;
  if (/[\\\u0000-\u001f\u007f]/.test(raw) || raw.startsWith("//")) return fallback;
  try {
    // Resolving against a dummy origin must stay on it.
    const u = new URL(raw, "http://seatbit.invalid");
    return u.origin === "http://seatbit.invalid" ? raw : fallback;
  } catch {
    return fallback;
  }
}

/** True for absolute http(s) URLs: no javascript:, data: or other schemes in links people click. */
export function isHttpUrl(v: string) {
  try {
    return /^https?:$/.test(new URL(v).protocol);
  } catch {
    return false;
  }
}

/** Optional link field in forms: empty, or an http(s) URL up to `max` characters. */
export const optionalHttpUrl = (max = 500) =>
  z.union([z.literal(""), z.url().max(max).refine(isHttpUrl, "use a link starting with https://")]);

/** A stored link for an href: only http(s), so older data saved before the checks can't run script. */
export const httpHref = (v: string | null | undefined) => (v && isHttpUrl(v) ? v : undefined);
