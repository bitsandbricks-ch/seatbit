/** Links to a member's profile on an event's own site, built from a pattern and their LAN ID. Client-safe. */

export const PROFILE_URL_HINT = "e.g. https://example.com/user/?id={id}";

/** A pattern must be an http(s) URL that contains {id}. */
export function validProfileUrl(pattern: string) {
  if (!pattern.includes("{id}")) return false;
  try {
    return /^https?:$/.test(new URL(pattern.replaceAll("{id}", "1")).protocol);
  } catch {
    return false;
  }
}

/** The event's own pattern, else its LAN type's. */
export const profilePattern = (l: { profileUrl: string }, type?: { profileUrl: string } | null) =>
  l.profileUrl || type?.profileUrl || "";

/** Full link for this ID, or null without a usable pattern or ID. */
export function profileLink(pattern: string | null | undefined, id: string | null | undefined) {
  const v = id?.trim();
  if (!pattern || !v || !validProfileUrl(pattern)) return null;
  return pattern.replaceAll("{id}", encodeURIComponent(v));
}
