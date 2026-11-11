import { runDueReminders } from "@/lib/reminders";

/**
 * Trigger due reminders from an external scheduler:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://your-host/api/cron/reminders
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const sent = await runDueReminders();
  return Response.json({ ok: true, sent });
}
