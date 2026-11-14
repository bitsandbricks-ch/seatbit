import { liveConnections, onLanChange } from "@/lib/live";
import { canViewLan, getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Comment lines keep proxies and ingresses from closing an idle stream (many cut at 60 s). */
const HEARTBEAT_MS = 25_000;
/** A safety cap, far above what one instance sees; the browser falls back to polling. */
const MAX_CONNECTIONS = 2_000;

/**
 * Server-Sent Events for one event: sends "changed" whenever something on it changed, so the
 * open page can refresh itself. No data goes over the stream; the refreshed page brings its
 * own, with the usual permission checks.
 */
export async function GET(req: Request, { params }: RouteContext<"/api/live/[lanId]">) {
  const { lanId } = await params;
  const me = await getCurrentUser();
  if (!me || !canViewLan(me, lanId)) return new Response("Not found", { status: 404 });
  if (liveConnections() >= MAX_CONNECTIONS) return new Response("Busy", { status: 503 });

  const enc = new TextEncoder();
  let stop = () => {};
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (text: string) => {
        try {
          controller.enqueue(enc.encode(text));
        } catch {
          stop();
        }
      };
      // Reconnect after 5 s when the connection drops (restart, deploy, network).
      send("retry: 5000\n\n");
      const off = onLanChange(lanId, () => send("data: changed\n\n"));
      const beat = setInterval(() => send(": ping\n\n"), HEARTBEAT_MS);
      beat.unref?.();
      stop = () => {
        off();
        clearInterval(beat);
      };
      req.signal?.addEventListener("abort", () => {
        stop();
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      });
    },
    cancel() {
      stop();
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      // no-transform keeps the built-in gzip from buffering the stream.
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // nginx (ingress-nginx) would otherwise buffer it.
      "X-Accel-Buffering": "no",
    },
  });
}
