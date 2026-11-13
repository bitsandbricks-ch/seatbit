import crypto from "node:crypto";
import { runDueReminders } from "@/lib/reminders";
import { runJob } from "@/lib/jobs";
import { getSetting } from "@/lib/settings";

/**
 * Trigger due reminders from an external scheduler:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://your-host/api/cron/reminders
 * The secret is set in the admin platform settings or the CRON_SECRET env var.
 */
export async function GET(req: Request) {
  const secret = getSetting("cron.secret");
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  // Byte lengths, not string lengths: timingSafeEqual throws on buffers of different size.
  const ok = !!secret && given.length === expected.length && crypto.timingSafeEqual(given, expected);
  if (!ok) return new Response("Unauthorized", { status: 401 });
  // Errors reach onRequestError (ops channel); the job state shows on the Health page.
  const sent = await runJob("reminders", () => runDueReminders());
  return Response.json({ ok: true, sent });
}
