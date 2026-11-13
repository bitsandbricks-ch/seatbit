import crypto from "node:crypto";
import { collect, render } from "@/lib/metrics";
import { getSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

/**
 * Prometheus metrics:
 *   curl -H "Authorization: Bearer $METRICS_TOKEN" https://your-host/api/metrics
 * Off (404) until a metrics token is set in the platform settings or the METRICS_TOKEN env var.
 */
export function GET(req: Request) {
  const token = getSetting("metrics.token");
  if (!token) return new Response("Not found", { status: 404 });
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${token}`);
  // Byte lengths, not string lengths: timingSafeEqual throws on buffers of different size.
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    return new Response("Unauthorized", { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="metrics"' } });
  }
  return new Response(render(collect()), {
    headers: { "Content-Type": "text/plain; version=0.0.4; charset=utf-8", "Cache-Control": "no-store" },
  });
}
