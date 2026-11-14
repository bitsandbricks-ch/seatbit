/**
 * Live updates: tells open pages that something on an event changed, so they re-render.
 *
 * Seatbit runs as one process (SQLite), so an in-memory bus sees every change: website,
 * Discord commands, webhooks and background jobs. Pages listen through /api/live (Server-Sent
 * Events) and call router.refresh(); only "this event changed" goes over the wire, never data.
 */

type Listener = () => void;

/** A burst of writes (a re-plan, a save that touches a few tables) sends one message. */
export const SETTLE_MS = 250;

type Bus = { listeners: Map<string, Set<Listener>>; pending: Map<string, ReturnType<typeof setTimeout>> };

// On globalThis: route handlers and server actions can end up in separate module
// instances, and dev reloads modules, but they must share one bus.
const g = globalThis as typeof globalThis & { __seatbitLive?: Bus };
const bus: Bus = (g.__seatbitLive ??= { listeners: new Map(), pending: new Map() });

const topicOfLan = (lanId: string) => `lan:${lanId}`;

function publish(topic: string) {
  if (!bus.listeners.has(topic) || bus.pending.has(topic)) return;
  bus.pending.set(
    topic,
    setTimeout(() => {
      bus.pending.delete(topic);
      for (const fn of bus.listeners.get(topic) ?? []) {
        try {
          fn();
        } catch {
          // A closed stream must not stop the others.
        }
      }
    }, SETTLE_MS),
  );
}

/** Something on this event changed: open event and Manage pages refresh. */
export function lanChanged(lanId: string | null | undefined) {
  if (lanId) publish(topicOfLan(lanId));
}

/** Listen to one event's changes; returns the unsubscribe function. */
export function onLanChange(lanId: string, fn: Listener): () => void {
  const topic = topicOfLan(lanId);
  let set = bus.listeners.get(topic);
  if (!set) bus.listeners.set(topic, (set = new Set()));
  set.add(fn);
  return () => {
    set.delete(fn);
    if (set.size === 0 && bus.listeners.get(topic) === set) bus.listeners.delete(topic);
  };
}

/** Open live connections, for /api/metrics. */
export function liveConnections() {
  let n = 0;
  for (const set of bus.listeners.values()) n += set.size;
  return n;
}
