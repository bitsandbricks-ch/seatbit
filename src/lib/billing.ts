import "server-only";
import crypto from "node:crypto";
import { asc, eq, gt } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Clan } from "@/db/schema";
import { audit } from "./audit";
import { appUrl } from "./mail";
import { getBoolSetting, getSetting } from "./settings";
import { emitPlatformEvent } from "./platform-events";
import { onDonationPaid, onDonationRefunded } from "./donations";

/**
 * Voluntary "Supporter" payments for hosted instances.
 *
 * Seatbit is free with every feature; a clan can choose to support the instance with a yearly
 * (or monthly) Stripe subscription and gets a badge and a thank-you, nothing else. Off unless the
 * operator turns it on and adds Stripe keys, so self-hosters never see any of it.
 *
 * We talk to the Stripe REST API directly (a handful of calls) instead of pulling in the SDK, with
 * the API version pinned so the payloads keep their shape. Card, TWINT, Apple Pay and Google Pay are
 * whatever the operator turns on in the Stripe Dashboard: Checkout offers the enabled methods that fit
 * the price's currency.
 */

const STRIPE_API = "https://api.stripe.com/v1";
/** First version where TWINT works for subscriptions in Checkout. */
const STRIPE_VERSION = "2026-05-27.dahlia";
/** Renewals can land a little after the period ends; don't flicker the badge meanwhile. */
const GRACE_MS = 3 * 86400_000;

export type SupportPlan = "year" | "month";

export function config() {
  const v = (k: string) => getSetting(k)?.trim() || undefined;
  return {
    enabled: getBoolSetting("billing.enabled"),
    secretKey: v("billing.stripeSecretKey"),
    webhookSecret: v("billing.webhookSecret"),
    prices: { year: v("billing.priceAnnual"), month: v("billing.priceMonthly") } as Record<SupportPlan, string | undefined>,
  };
}

/** True when clans can become Supporters: switched on, with a key and at least the annual price. */
export function billingEnabled() {
  const c = config();
  return c.enabled && !!c.secretKey && !!c.prices.year;
}

/** What's still missing before billing works, for the admin page. */
export function billingProblems(): string[] {
  const c = config();
  if (!c.enabled) return [];
  return [
    !c.secretKey && "the Stripe secret key",
    !c.webhookSecret && "the webhook signing secret",
    !c.prices.year && "the annual price ID",
  ].filter((x): x is string => !!x);
}

/** Whether the clan shows as a Supporter. Always false while billing is off. */
export function isSupporter(c: Pick<Clan, "supporterUntil">) {
  return billingEnabled() && !!c.supporterUntil && c.supporterUntil.getTime() + GRACE_MS > Date.now();
}

/** Clans that are Supporters right now, for the platform admin. */
export function supporterClans() {
  return db
    .select({ name: schema.clan.name, slug: schema.clan.slug, until: schema.clan.supporterUntil, plan: schema.clan.supporterPlan })
    .from(schema.clan)
    .where(gt(schema.clan.supporterUntil, new Date(Date.now() - GRACE_MS)))
    .orderBy(asc(schema.clan.name))
    .all();
}

export function availablePlans(): SupportPlan[] {
  const c = config();
  return (["year", "month"] as const).filter((p) => !!c.prices[p]);
}

// ---------- Stripe REST ----------

interface Params {
  [key: string]: string | number | boolean | undefined | null | Params | Params[];
}

/** Stripe wants form encoding with brackets for nesting: line_items[0][price]=… */
function encode(params: Params, prefix = "", out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((item, i) => encode(item, `${key}[${i}]`, out));
    else if (typeof v === "object") encode(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

export class BillingError extends Error {}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Obj = Record<string, any>;

export async function stripe(method: "GET" | "POST" | "DELETE", path: string, params?: Params, timeoutMs = 10_000): Promise<Obj> {
  const key = config().secretKey;
  if (!key) throw new BillingError("Stripe isn't set up");
  const body = params && method !== "GET" ? encode(params) : undefined;
  const qs = params && method === "GET" ? `?${encode(params)}` : "";
  const res = await fetch(`${STRIPE_API}${path}${qs}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Stripe-Version": STRIPE_VERSION,
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body,
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as Obj;
  if (!res.ok) {
    // Stripe's message, not the key or the request, so it's safe to log.
    const msg = json?.error?.message ?? `HTTP ${res.status}`;
    console.error("[billing] %s %s failed: %s", method, path, msg);
    throw new BillingError(msg);
  }
  return json;
}

// ---------- Prices (for the button labels) ----------

type PriceInfo = { label: string; amount: number; currency: string } | null;
const g = globalThis as unknown as { __seatbitPrices?: Map<string, { at: number; info: PriceInfo }> };
const priceCache = (g.__seatbitPrices ??= new Map());

/** "CHF 30 / year", from Stripe and cached for an hour. Null when Stripe can't be reached. */
export async function priceLabel(plan: SupportPlan): Promise<string | null> {
  return (await priceInfo(plan))?.label ?? null;
}

/** Amount and currency of the annual price, e.g. to see whether a donation covers a year. */
export async function annualPrice() {
  const p = await priceInfo("year");
  return p ? { amount: p.amount, currency: p.currency } : null;
}

async function priceInfo(plan: SupportPlan): Promise<PriceInfo> {
  const id = config().prices[plan];
  if (!id) return null;
  const hit = priceCache.get(id);
  // Failures are retried after five minutes, successes after an hour.
  if (hit && Date.now() - hit.at < (hit.info ? 3600_000 : 300_000)) return hit.info;
  let info: PriceInfo = null;
  try {
    const p = await stripe("GET", `/prices/${encodeURIComponent(id)}`, undefined, 3_000);
    if (typeof p.unit_amount === "number" && p.currency) {
      const amount = p.unit_amount % 100 === 0 ? String(p.unit_amount / 100) : (p.unit_amount / 100).toFixed(2);
      // The interval ("/ year") is added in the reader's language.
      info = { label: `${String(p.currency).toUpperCase()} ${amount}`, amount: p.unit_amount, currency: String(p.currency).toUpperCase() };
    }
  } catch {
    // Labels fall back to "Yearly" / "Monthly".
  }
  priceCache.set(id, { at: Date.now(), info });
  return info;
}

// ---------- Checkout and portal ----------

const settingsUrl = (c: Pick<Clan, "slug">) => `${appUrl}/clans/${c.slug}/settings`;

/** Starts Stripe Checkout for a clan and returns the URL to send the admin to. */
export async function checkoutUrl(c: Clan, plan: SupportPlan, payer: { email: string }): Promise<string> {
  if (!billingEnabled()) throw new BillingError("Supporter payments are off");
  const price = config().prices[plan];
  if (!price) throw new BillingError("This option isn't available");
  const session = await stripe("POST", "/checkout/sessions", {
    mode: "subscription",
    line_items: [{ price, quantity: 1 }],
    client_reference_id: c.id,
    metadata: { clanId: c.id },
    // Copied to the subscription, so its invoices and its end find the clan as well.
    subscription_data: { metadata: { clanId: c.id } },
    ...(c.stripeCustomerId ? { customer: c.stripeCustomerId } : { customer_email: payer.email }),
    success_url: `${settingsUrl(c)}?support=thanks`,
    cancel_url: settingsUrl(c),
  });
  if (!session.url) throw new BillingError("Stripe didn't return a checkout page");
  return session.url;
}

/** Stripe's customer portal, to change the payment method, see receipts or cancel. */
export async function portalUrl(c: Clan): Promise<string> {
  if (!c.stripeCustomerId) throw new BillingError("This clan has no Stripe customer yet");
  const s = await stripe("POST", "/billing_portal/sessions", { customer: c.stripeCustomerId, return_url: settingsUrl(c) });
  return s.url;
}

/** Ends a clan's subscription right away, e.g. when the clan is deleted. Never throws. */
export async function cancelSupport(c: Pick<Clan, "id" | "stripeSubscriptionId">) {
  if (!c.stripeSubscriptionId || !config().secretKey) return;
  try {
    await stripe("DELETE", `/subscriptions/${encodeURIComponent(c.stripeSubscriptionId)}`);
  } catch (e) {
    console.error("[billing] couldn't cancel the subscription of clan %s", c.id, e);
  }
}

// ---------- Webhook ----------

/**
 * Checks the Stripe-Signature header: HMAC-SHA256 of "<timestamp>.<body>" with the endpoint secret,
 * at most five minutes old (replays of older deliveries are refused).
 */
export function verifyStripeSignature(body: string, header: string | null, secret: string, now = Date.now()) {
  if (!header) return false;
  const parts = header.split(",").map((p) => p.trim().split("=") as [string, string]);
  const t = Number(parts.find(([k]) => k === "t")?.[1]);
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!Number.isFinite(t) || !sigs.length || Math.abs(now / 1000 - t) > 300) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${body}`, "utf8").digest();
  return sigs.some((s) => {
    const got = Buffer.from(s, "hex");
    return got.length === expected.length && crypto.timingSafeEqual(got, expected);
  });
}

export function webhookSecret() {
  return config().webhookSecret;
}

/** Handles one verified webhook event. Returns false when it was handled before (Stripe retried). */
export async function handleStripeEvent(event: Obj): Promise<boolean> {
  const seen = db.select({ id: schema.billingEvent.id }).from(schema.billingEvent).where(eq(schema.billingEvent.id, event.id)).get();
  if (seen) return false;
  const o = event.data?.object ?? {};
  switch (event.type) {
    case "checkout.session.completed":
      if (o.mode === "payment") await onDonationPaid(o);
      else await onCheckoutCompleted(o);
      break;
    case "checkout.session.async_payment_succeeded":
      // Delayed payment methods: the donation is only paid now.
      if (o.mode === "payment") await onDonationPaid(o);
      break;
    case "charge.refunded":
      onDonationRefunded(o);
      break;
    case "invoice.paid":
      await onInvoicePaid(o);
      break;
    case "customer.subscription.deleted":
      onSubscriptionDeleted(o);
      break;
    default:
      return true; // not ours, nothing to remember
  }
  // Only after it worked: a failed event answers 500, and Stripe sends it again.
  db.insert(schema.billingEvent).values({ id: event.id, type: event.type }).onConflictDoNothing().run();
  return true;
}

const idOf = (x: unknown): string | undefined => (typeof x === "string" ? x : (x as Obj | null)?.id);

function findClan(clanId: string | undefined, subscriptionId: string | undefined) {
  if (subscriptionId) {
    const c = db.select().from(schema.clan).where(eq(schema.clan.stripeSubscriptionId, subscriptionId)).get();
    if (c) return c;
  }
  return clanId ? db.select().from(schema.clan).where(eq(schema.clan.id, clanId)).get() : undefined;
}

/** End of the current period and the interval, from a subscription (both the old and the per-item shape). */
function subscriptionPeriod(sub: Obj): { end?: Date; plan?: SupportPlan } {
  const item = sub.items?.data?.[0];
  const end = item?.current_period_end ?? sub.current_period_end;
  const interval = item?.price?.recurring?.interval ?? item?.plan?.interval;
  return {
    end: typeof end === "number" ? new Date(end * 1000) : undefined,
    plan: interval === "year" || interval === "month" ? interval : undefined,
  };
}

export function extendSupport(c: Clan, until: Date | undefined, set: Partial<Clan>, extra: { donation?: boolean } = {}) {
  const prev = c.supporterUntil;
  const supporterUntil = until && (!prev || until > prev) ? until : prev;
  db.update(schema.clan).set({ ...set, supporterUntil }).where(eq(schema.clan.id, c.id)).run();
  if (supporterUntil && (!prev || supporterUntil > prev)) {
    audit({
      actorId: null,
      action: "clan.supporter",
      clanId: c.id,
      data: { until: supporterUntil.getTime(), plan: set.supporterPlan ?? c.supporterPlan ?? undefined, renewed: !!prev, donation: extra.donation },
    });
    const renewed = !!prev && prev.getTime() + GRACE_MS > Date.now();
    emitPlatformEvent({
      type: renewed ? "supporter.renewed" : "supporter.started",
      clanName: c.name,
      plan: set.supporterPlan ?? c.supporterPlan ?? undefined,
      until: supporterUntil,
    });
  }
}

async function onCheckoutCompleted(s: Obj) {
  if (s.mode !== "subscription") return;
  const subId = idOf(s.subscription);
  const c = findClan(s.client_reference_id ?? s.metadata?.clanId, subId);
  if (!c) {
    console.warn("[billing] checkout %s for an unknown clan", s.id);
    return;
  }
  let period: ReturnType<typeof subscriptionPeriod> = {};
  let active = false;
  if (subId) {
    const sub = await stripe("GET", `/subscriptions/${encodeURIComponent(subId)}`);
    period = subscriptionPeriod(sub);
    active = sub.status === "active" || sub.status === "trialing";
  }
  // With a delayed payment method the subscription isn't active yet: invoice.paid extends it later.
  extendSupport(c, active ? period.end : undefined, {
    stripeCustomerId: idOf(s.customer) ?? c.stripeCustomerId,
    stripeSubscriptionId: subId ?? c.stripeSubscriptionId,
    supporterPlan: period.plan ?? c.supporterPlan,
  });
}

async function onInvoicePaid(inv: Obj) {
  const details = inv.parent?.subscription_details;
  const subId = idOf(details?.subscription ?? inv.subscription);
  if (!subId) return; // a one-off invoice, not ours
  const c = findClan(details?.metadata?.clanId ?? inv.subscription_details?.metadata?.clanId, subId);
  if (!c) {
    console.warn("[billing] paid invoice %s for an unknown clan", inv.id);
    return;
  }
  const lines: Obj[] = inv.lines?.data ?? [];
  const ends = lines.map((l) => l.period?.end).filter((x): x is number => typeof x === "number");
  let end = ends.length ? new Date(Math.max(...ends) * 1000) : undefined;
  let plan: SupportPlan | undefined;
  // Older API versions put the price on the line; newer ones only its id, so then ask the subscription.
  const interval = lines[0]?.price?.recurring?.interval;
  if (interval === "year" || interval === "month") plan = interval;
  if (!end || !plan) {
    const p = subscriptionPeriod(await stripe("GET", `/subscriptions/${encodeURIComponent(subId)}`));
    end ??= p.end;
    plan ??= p.plan;
  }
  extendSupport(c, end, {
    stripeCustomerId: idOf(inv.customer) ?? c.stripeCustomerId,
    stripeSubscriptionId: subId,
    supporterPlan: plan ?? c.supporterPlan,
  });
}

function onSubscriptionDeleted(sub: Obj) {
  const c = findClan(sub.metadata?.clanId, sub.id);
  // Only the clan's current subscription; an old one ending changes nothing.
  if (!c || (c.stripeSubscriptionId && c.stripeSubscriptionId !== sub.id)) return;
  const ended = typeof sub.ended_at === "number" ? new Date(sub.ended_at * 1000) : new Date();
  // Cancelled at the end of the period: the badge stays until then. Cancelled now (e.g. refunded): it goes now.
  const until = c.supporterUntil && c.supporterUntil < ended ? c.supporterUntil : ended;
  db.update(schema.clan).set({ stripeSubscriptionId: null, supporterUntil: until }).where(eq(schema.clan.id, c.id)).run();
  audit({ actorId: null, action: "clan.supporter_end", clanId: c.id });
  emitPlatformEvent({ type: "supporter.ended", clanName: c.name });
}
