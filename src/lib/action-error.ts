// Shared by server and client: how a server action's error text reaches the browser.
//
// In production Next.js replaces the message of an error thrown in a server action with a
// generic text and keeps only its `digest`. A digest the error already has is kept, so
// `err()` (src/i18n/server.ts) puts the translated text there behind this prefix.
export const MESSAGE_DIGEST = "seatbit-msg:";

/** The text to show for an error from a server action, or null when it has none fit for people. */
export function actionErrorText(e: unknown): string | null {
  if (!e || typeof e !== "object") return null;
  const digest = (e as { digest?: unknown }).digest;
  if (typeof digest === "string" && digest.startsWith(MESSAGE_DIGEST)) return digest.slice(MESSAGE_DIGEST.length);
  // Development keeps the real message; production errors without our digest are not for people.
  if (process.env.NODE_ENV !== "production" && e instanceof Error && e.message) return e.message;
  return null;
}
