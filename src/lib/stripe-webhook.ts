import "server-only";
import { type Obj, verifyStripeSignature } from "./billing";

/**
 * Shared body of the Stripe webhook routes: checks the signature, parses the event and hands it to
 * `handle`, which returns false for an event it handled before. A thrown error answers 500, so
 * Stripe retries later.
 */
export async function stripeWebhook(
  req: Request,
  opts: { secret: string | undefined; notConfigured: string; tag: string; handle: (event: Obj) => Promise<boolean> },
) {
  // Not set up: tell Stripe to stop rather than pretend it worked.
  if (!opts.secret) return new Response(opts.notConfigured, { status: 404 });
  const body = await req.text();
  if (!verifyStripeSignature(body, req.headers.get("stripe-signature"), opts.secret)) {
    return new Response("Bad signature", { status: 400 });
  }
  let event: Obj;
  try {
    event = JSON.parse(body);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }
  if (!event?.id || !event.type) return new Response("Not an event", { status: 400 });
  try {
    const fresh = await opts.handle(event);
    return Response.json({ received: true, duplicate: !fresh || undefined });
  } catch (e) {
    console.error("[%s] webhook %s (%s) failed", opts.tag, event.id, event.type, e);
    return new Response("Failed", { status: 500 });
  }
}
