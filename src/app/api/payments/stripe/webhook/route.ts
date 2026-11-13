import { connectWebhookSecret, handleConnectEvent } from "@/lib/connect";
import { stripeWebhook } from "@/lib/stripe-webhook";

export const dynamic = "force-dynamic";

/**
 * Stripe Connect webhook for clan payments: events on the clans' own Stripe accounts
 * (checkout.session.completed, checkout.session.async_payment_succeeded, charge.refunded,
 * account.updated, account.application.deauthorized). Each event is applied once.
 */
export function POST(req: Request) {
  return stripeWebhook(req, {
    secret: connectWebhookSecret(),
    notConfigured: "Online clan payments are not configured",
    tag: "connect",
    handle: handleConnectEvent,
  });
}
