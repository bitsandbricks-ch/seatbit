import { verifyStripeSignature } from "@/lib/billing";
import { connectWebhookSecret, handleConnectEvent } from "@/lib/connect";

export const dynamic = "force-dynamic";

/**
 * Stripe Connect webhook for clan payments: events on the clans' own Stripe accounts
 * (checkout.session.completed, checkout.session.async_payment_succeeded, charge.refunded,
 * account.updated, account.application.deauthorized). Each event is applied once.
 */
export async function POST(req: Request) {
  const secret = connectWebhookSecret();
  if (!secret) return new Response("Online clan payments are not configured", { status: 404 });
  const body = await req.text();
  if (!verifyStripeSignature(body, req.headers.get("stripe-signature"), secret)) {
    return new Response("Bad signature", { status: 400 });
  }
  let event: { id?: string; type?: string };
  try {
    event = JSON.parse(body);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }
  if (!event.id || !event.type) return new Response("Not an event", { status: 400 });
  try {
    const fresh = await handleConnectEvent(event);
    return Response.json({ received: true, duplicate: !fresh || undefined });
  } catch (e) {
    console.error("[connect] webhook %s (%s) failed", event.id, event.type, e);
    return new Response("Failed", { status: 500 });
  }
}
