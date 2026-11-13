import "server-only";

/**
 * Things that happen on the instance that operators may want to hear about (e.g. in an ops
 * Discord channel). A tiny in-process bus so billing code doesn't need to know who listens.
 *
 * Payloads carry no emails or personal names: clan names and amounts only.
 */
export type PlatformEvent =
  | {
      type: "donation.received";
      /** In the currency's smallest unit (Rappen, cents). */
      amount: number;
      currency: string;
      by: "user" | "clan";
      clanName?: string;
      /** The donor agreed to show a badge. */
      public: boolean;
      /** The gift made the clan a Supporter for a year. */
      grantsSupporter: boolean;
    }
  | { type: "donation.refunded"; amount: number; currency: string }
  | { type: "supporter.started" | "supporter.renewed"; clanName: string; plan?: "year" | "month"; until: Date }
  | { type: "supporter.ended"; clanName: string };

type Handler = (e: PlatformEvent) => void | Promise<void>;

// On globalThis, so a handler registered from one bundle (instrumentation, a route) sees events of another.
const g = globalThis as unknown as { __seatbitPlatformHandlers?: Set<Handler> };
const handlers = (g.__seatbitPlatformHandlers ??= new Set());

/** Registers a listener. Returns a function that removes it again. */
export function onPlatformEvent(h: Handler) {
  handlers.add(h);
  return () => void handlers.delete(h);
}

/** Tells every listener, in the background. Never throws: a broken listener must not fail a payment. */
export function emitPlatformEvent(e: PlatformEvent) {
  for (const h of handlers) {
    Promise.resolve()
      .then(() => h(e))
      .catch((err) => console.error("[platform-events] %s handler failed", e.type, err));
  }
}
