import { handleStripeEvent, verifyStripeSignature, webhookSecret } from "@/lib/billing";

export const dynamic = "force-dynamic";

/**
 * Stripe webhook for Supporter payments. Handles checkout.session.completed, invoice.paid and
 * customer.subscription.deleted; every other event is acknowledged and ignored. Each event is
 * applied once, however often Stripe delivers it.
 */
export async function POST(req: Request) {
  const secret = webhookSecret();
  // Billing not set up: tell Stripe to stop rather than pretend it worked.
  if (!secret) return new Response("Billing is not configured", { status: 404 });
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
    const fresh = await handleStripeEvent(event);
    return Response.json({ received: true, duplicate: !fresh || undefined });
  } catch (e) {
    console.error("[billing] webhook %s (%s) failed", event.id, event.type, e);
    // 500 makes Stripe retry later.
    return new Response("Failed", { status: 500 });
  }
}
