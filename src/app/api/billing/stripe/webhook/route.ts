import { handleStripeEvent, webhookSecret } from "@/lib/billing";
import { stripeWebhook } from "@/lib/stripe-webhook";

export const dynamic = "force-dynamic";

/**
 * Stripe webhook for Supporter payments. Handles checkout.session.completed, invoice.paid and
 * customer.subscription.deleted; every other event is acknowledged and ignored. Each event is
 * applied once, however often Stripe delivers it.
 */
export function POST(req: Request) {
  return stripeWebhook(req, { secret: webhookSecret(), notConfigured: "Billing is not configured", tag: "billing", handle: handleStripeEvent });
}
