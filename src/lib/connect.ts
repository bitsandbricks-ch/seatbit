import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Charge, ChargeItem, Clan } from "@/db/schema";
import { audit } from "./audit";
import { BillingError, idOf, stripeApi, stripeKeySet } from "./billing";
import { appUrl } from "./mail";
import { clanPaymentsOn } from "./payments";
import { getBoolSetting, getNumberSetting, getSetting } from "./settings";

/**
 * Online payments for clan charges through Stripe Connect.
 *
 * Each clan connects its own Stripe account (the "Standard" kind: full Stripe Dashboard, the clan
 * signs Stripe's terms and goes through Stripe's checks itself). Members pay with Checkout as a
 * direct charge on that account, so the clan is the seller, pays Stripe's fees and handles refunds
 * and disputes in its own dashboard. The instance is only the Connect platform: no money passes
 * through it, except an optional platform fee the operator can set (0 by default).
 *
 * Events on connected accounts come to their own webhook (/api/payments/stripe/webhook) with its
 * own signing secret; the Supporter webhook stays as it is.
 */

type Obj = Record<string, unknown> & { [k: string]: any }; // eslint-disable-line @typescript-eslint/no-explicit-any

const { clan, chargeItem, charge } = schema;

export const connectWebhookSecret = () => getSetting("connect.webhookSecret")?.trim() || undefined;

/** The operator turned online clan payments on and the Stripe key is there. */
export function connectEnabled() {
  return getBoolSetting("connect.enabled") && stripeKeySet();
}

/** What's still missing before it works, for the admin page. */
export function connectProblems(): string[] {
  if (!getBoolSetting("connect.enabled")) return [];
  return [!stripeKeySet() && "the Stripe secret key (Supporters tab)", !connectWebhookSecret() && "the Connect webhook signing secret"].filter(
    (x): x is string => !!x,
  );
}

/** Members of this clan can pay online right now. */
export function clanTakesOnline(c: Pick<Clan, "paymentsEnabled" | "stripeAccountId" | "stripeChargesEnabled">) {
  return clanPaymentsOn(c) && connectEnabled() && !!c.stripeAccountId && c.stripeChargesEnabled;
}

const paymentsUrl = (c: Pick<Clan, "slug">) => `${appUrl}/clans/${c.slug}/settings?tab=payments`;

/**
 * Creates the clan's Stripe account if it has none and returns the onboarding link. Stripe collects
 * everything it needs (who runs the clan, bank account) on its own pages.
 */
export async function onboardingUrl(c: Clan, actorId: string): Promise<string> {
  if (!connectEnabled()) throw new BillingError("Online payments are off");
  let account = c.stripeAccountId;
  if (!account) {
    const a = await stripeApi("POST", "/accounts", {
      // A Standard account: the clan's own Stripe account with the full dashboard; Stripe collects
      // the requirements, the clan pays the fees, and Stripe (not this instance) carries losses.
      controller: {
        stripe_dashboard: { type: "full" },
        fees: { payer: "account" },
        losses: { payments: "stripe" },
        requirement_collection: "stripe",
      },
      business_profile: { name: c.name.slice(0, 100), url: `${appUrl}/clans/${c.slug}` },
      metadata: { clanId: c.id },
    });
    account = String(a.id);
    db.update(clan).set({ stripeAccountId: account, stripeChargesEnabled: false }).where(eq(clan.id, c.id)).run();
    audit({ actorId, action: "payment.stripe_connect", clanId: c.id });
  }
  const link = await stripeApi("POST", "/account_links", {
    account,
    type: "account_onboarding",
    refresh_url: `${paymentsUrl(c)}&stripe=refresh`,
    return_url: `${paymentsUrl(c)}&stripe=return`,
  });
  return String(link.url);
}

/** Asks Stripe whether the clan's account can take payments yet and saves it. */
export async function refreshAccount(c: Clan) {
  if (!c.stripeAccountId || !stripeKeySet()) return c;
  const a = await stripeApi("GET", `/accounts/${encodeURIComponent(c.stripeAccountId)}`);
  return applyAccount(c, a);
}

function applyAccount(c: Clan, a: Obj) {
  const ok = !!a.charges_enabled;
  if (ok !== c.stripeChargesEnabled) {
    db.update(clan).set({ stripeChargesEnabled: ok }).where(eq(clan.id, c.id)).run();
    if (ok) audit({ actorId: null, action: "payment.stripe_ready", clanId: c.id });
  }
  return { ...c, stripeChargesEnabled: ok };
}

/** Unlinks the clan's Stripe account. The account itself stays the clan's; nothing is deleted at Stripe. */
export function disconnect(c: Clan, actorId: string) {
  db.update(clan).set({ stripeAccountId: null, stripeChargesEnabled: false }).where(eq(clan.id, c.id)).run();
  audit({ actorId, action: "payment.stripe_disconnect", clanId: c.id });
}

/** A link to the clan's own Stripe Dashboard (payments, refunds, payouts). */
export const dashboardUrl = (accountId: string) => `https://dashboard.stripe.com/${encodeURIComponent(accountId)}/payments`;

/** The operator's share in cents, e.g. 2% of CHF 85.00 = 170. 0 when no fee is set. */
export function platformFee(amountCents: number) {
  const pct = getNumberSetting("connect.feePercent") ?? 0;
  if (pct <= 0) return 0;
  return Math.min(amountCents - 1, Math.round((amountCents * pct) / 100));
}

/** Stripe Checkout for one line, on the clan's account. Returns the URL to send the member to. */
export async function lineCheckoutUrl(c: Clan, ch: Charge, it: ChargeItem, payer: { email: string; isGuest: boolean }) {
  if (!clanTakesOnline(c)) throw new BillingError("This clan doesn't take online payments");
  const fee = platformFee(it.amountCents);
  const back = `${appUrl}/clans/${c.slug}?tab=payments`;
  const s = await stripeApi(
    "POST",
    "/checkout/sessions",
    {
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: ch.currency.toLowerCase(),
            unit_amount: it.amountCents,
            product_data: { name: `${ch.title} (${c.name})`.slice(0, 250) },
          },
        },
      ],
      client_reference_id: it.id,
      metadata: { chargeItemId: it.id, clanId: c.id },
      payment_intent_data: {
        metadata: { chargeItemId: it.id, clanId: c.id },
        ...(fee > 0 ? { application_fee_amount: fee } : {}),
      },
      ...(payer.isGuest ? {} : { customer_email: payer.email }),
      success_url: `${back}&paid=thanks`,
      cancel_url: back,
    },
    { account: c.stripeAccountId! },
  );
  if (!s.url) throw new BillingError("Stripe didn't return a checkout page");
  return String(s.url);
}

// ---------- Webhook (events on connected accounts) ----------

/** Handles one verified Connect event. Returns false when it was handled before. */
export async function handleConnectEvent(event: Obj): Promise<boolean> {
  const seen = db.select({ id: schema.billingEvent.id }).from(schema.billingEvent).where(eq(schema.billingEvent.id, event.id)).get();
  if (seen) return false;
  const o: Obj = event.data?.object ?? {};
  const account: string | undefined = event.account;
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      // TWINT and cards are paid at once; delayed methods arrive with async_payment_succeeded.
      if (o.mode === "payment" && o.payment_status === "paid") markPaidOnline(o, account);
      break;
    case "charge.refunded":
      if (o.refunded) markRefunded(o, account);
      break;
    case "account.updated": {
      const c = account ? db.select().from(clan).where(eq(clan.stripeAccountId, account)).get() : undefined;
      if (c) applyAccount(c, o);
      break;
    }
    case "account.application.deauthorized": {
      // The clan removed this platform from its Stripe account.
      const c = account ? db.select().from(clan).where(eq(clan.stripeAccountId, account)).get() : undefined;
      if (c) {
        db.update(clan).set({ stripeAccountId: null, stripeChargesEnabled: false }).where(eq(clan.id, c.id)).run();
        audit({ actorId: null, action: "payment.stripe_disconnect", clanId: c.id });
      }
      break;
    }
    default:
      return true;
  }
  db.insert(schema.billingEvent).values({ id: event.id, type: event.type }).onConflictDoNothing().run();
  return true;
}

/** The line the event is about, only if it belongs to the clan of the account that sent it. */
function lineFor(itemId: unknown, account: string | undefined) {
  if (typeof itemId !== "string" || !account) return undefined;
  const row = db
    .select({ it: chargeItem, ch: charge, c: clan })
    .from(chargeItem)
    .innerJoin(charge, eq(charge.id, chargeItem.chargeId))
    .innerJoin(clan, eq(clan.id, charge.clanId))
    .where(eq(chargeItem.id, itemId))
    .get();
  return row && row.c.stripeAccountId === account ? row : undefined;
}

function markPaidOnline(s: Obj, account: string | undefined) {
  const row = lineFor(s.metadata?.chargeItemId ?? s.client_reference_id, account);
  if (!row) {
    console.warn("[connect] paid checkout %s for an unknown line", s.id);
    return;
  }
  // Paid twice (two tabs)? The line stays paid; the clan refunds the second one in its dashboard.
  if (row.it.status === "paid" && row.it.paidVia === "stripe") return;
  const pi = idOf(s.payment_intent);
  db.update(chargeItem)
    .set({ status: "paid", paidVia: "stripe", paidAt: new Date(), markedBy: null, stripePaymentId: pi ?? null })
    .where(eq(chargeItem.id, row.it.id))
    .run();
  audit({
    actorId: null,
    action: "payment.mark",
    clanId: row.c.id,
    lanId: row.ch.lanId,
    targetUserId: row.it.userId,
    data: { title: row.ch.title, status: "paid", via: "stripe", from: row.it.status },
  });
}

function markRefunded(ch: Obj, account: string | undefined) {
  const pi = idOf(ch.payment_intent);
  if (!pi) return;
  const it = db.select().from(chargeItem).where(eq(chargeItem.stripePaymentId, pi)).get();
  const row = it && lineFor(it.id, account);
  if (!row || row.it.status !== "paid") return;
  // Fully refunded: they owe it again, unless a lead waives it.
  db.update(chargeItem).set({ status: "open", paidVia: null, paidAt: null, stripePaymentId: null }).where(eq(chargeItem.id, row.it.id)).run();
  audit({
    actorId: null,
    action: "payment.refund",
    clanId: row.c.id,
    lanId: row.ch.lanId,
    targetUserId: row.it.userId,
    data: { title: row.ch.title },
  });
}
