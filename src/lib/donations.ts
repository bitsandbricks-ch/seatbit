import "server-only";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Clan } from "@/db/schema";
import { audit } from "./audit";
import { BillingError, type Obj, annualPrice, billingEnabled, config, extendSupport, idOf, stripe } from "./billing";
import { appUrl } from "./mail";
import { emitPlatformEvent } from "./platform-events";
import { getBoolSetting, getSetting } from "./settings";

/**
 * One-off donations to the instance, next to the Supporter subscription.
 *
 * Uses the same Stripe account, key and webhook as Supporter payments, but needs no prices: the
 * amount is chosen on /donate and sent as inline price data, so Checkout shows whatever methods the
 * operator enabled (card, TWINT for CHF, wallets). Only paid donations are stored.
 */

/** Bounds for a custom amount, in whole currency units. */
export const DONATION_MIN = 1;
export const DONATION_MAX = 10_000;
/** How long a donation shows the Donor badge. */
const BADGE_MS = 365 * 86400_000;
const YEAR_MS = 365 * 86400_000;

export function donationsEnabled() {
  return getBoolSetting("billing.donationsEnabled") && !!config().secretKey;
}

/** What's still missing before donations work, for the admin page. */
export function donationProblems(): string[] {
  if (!getBoolSetting("billing.donationsEnabled")) return [];
  const c = config();
  return [!c.secretKey && "the Stripe secret key", !c.webhookSecret && "the webhook signing secret"].filter((x): x is string => !!x);
}

export function donationOptions() {
  const amounts = (getSetting("billing.donationAmounts") ?? "")
    .split(",")
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isInteger(n) && n >= DONATION_MIN && n <= DONATION_MAX);
  const currency = (getSetting("billing.donationCurrency") ?? "CHF").trim().toUpperCase() || "CHF";
  return { amounts: amounts.length ? amounts : [10, 20, 50], currency };
}

/** Whether a gift of this size makes a clan a Supporter for a year (at least the annual price). */
export async function coversSupporterYear(amount: number, currency: string) {
  if (!billingEnabled()) return false;
  const p = await annualPrice();
  return !!p && p.currency === currency.toUpperCase() && amount >= p.amount;
}

/** The annual Supporter price in the donation currency, for the hint on /donate. Null when it doesn't apply. */
export async function supporterYearAmount() {
  if (!billingEnabled()) return null;
  const p = await annualPrice();
  return p && p.currency === donationOptions().currency ? p : null;
}

// ---------- Checkout ----------

export async function donationCheckoutUrl(opts: {
  user: { id: string; email: string };
  clan: Pick<Clan, "id"> | null;
  /** Whole currency units. */
  amount: number;
  showBadge: boolean;
  productName: string;
  locale: string;
}): Promise<string> {
  if (!donationsEnabled()) throw new BillingError("Donations are off");
  if (!Number.isFinite(opts.amount) || opts.amount < DONATION_MIN || opts.amount > DONATION_MAX) {
    throw new BillingError("Amount out of range");
  }
  const { currency } = donationOptions();
  const metadata = {
    kind: "donation",
    userId: opts.user.id,
    clanId: opts.clan?.id ?? "",
    showBadge: opts.showBadge ? "1" : "0",
  };
  const session = await stripe("POST", "/checkout/sessions", {
    mode: "payment",
    submit_type: "donate",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: currency.toLowerCase(),
          unit_amount: Math.round(opts.amount * 100),
          product_data: { name: opts.productName },
        },
      },
    ],
    client_reference_id: opts.user.id,
    customer_email: opts.user.email,
    metadata,
    payment_intent_data: { metadata },
    locale: opts.locale,
    success_url: `${appUrl}/donate/thanks?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/donate`,
  });
  if (!session.url) throw new BillingError("Stripe didn't return a checkout page");
  return session.url;
}


/**
 * Stores a paid donation Checkout once (from the webhook or the thank-you page, whichever comes
 * first). Ignores sessions that aren't donations or aren't paid yet.
 */
export async function onDonationPaid(s: Obj) {
  if (s.metadata?.kind !== "donation" || s.payment_status !== "paid") return;
  const userId: string | null = s.metadata.userId || null;
  const clanId: string | null = s.metadata.clanId || null;
  // The account or clan may be gone by now; the money still arrived.
  const user = userId ? db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.id, userId)).get() : undefined;
  const clan = clanId ? db.select().from(schema.clan).where(eq(schema.clan.id, clanId)).get() : undefined;
  const amount = Number(s.amount_total);
  const currency = String(s.currency ?? "").toUpperCase();
  if (!Number.isFinite(amount) || !currency) {
    console.warn("[billing] donation %s without an amount", s.id);
    return;
  }
  const showBadge = s.metadata.showBadge !== "0";
  const res = db
    .insert(schema.donation)
    .values({
      stripeSessionId: s.id,
      paymentIntentId: idOf(s.payment_intent) ?? null,
      userId: user?.id ?? null,
      clanId: clan?.id ?? null,
      amount,
      currency,
      showBadge,
    })
    .onConflictDoNothing()
    .run();
  if (res.changes === 0) return; // stored before

  audit({ actorId: user?.id ?? null, action: "platform.donation", clanId: clan?.id ?? null, data: { amount, currency } });
  const grants = !!clan && (await coversSupporterYear(amount, currency));
  if (clan && grants) {
    const base = clan.supporterUntil && clan.supporterUntil.getTime() > Date.now() ? clan.supporterUntil.getTime() : Date.now();
    extendSupport(clan, new Date(base + YEAR_MS), {}, { donation: true });
  }
  emitPlatformEvent({
    type: "donation.received",
    amount,
    currency,
    by: clan ? "clan" : "user",
    clanName: clan?.name,
    public: showBadge,
    grantsSupporter: grants,
  });
}

/** A full refund in Stripe marks the donation refunded (no badge, not in the totals). */
export function onDonationRefunded(charge: Obj) {
  const pi = idOf(charge.payment_intent);
  if (!pi || !charge.refunded) return; // partial refunds keep the donation
  const d = db.select().from(schema.donation).where(eq(schema.donation.paymentIntentId, pi)).get();
  if (!d || d.refundedAt) return;
  db.update(schema.donation).set({ refundedAt: new Date() }).where(eq(schema.donation.id, d.id)).run();
  audit({ actorId: null, action: "platform.donation_refund", clanId: d.clanId, data: { amount: d.amount, currency: d.currency } });
  emitPlatformEvent({ type: "donation.refunded", amount: d.amount, currency: d.currency });
}

/**
 * For the thank-you page: looks the Checkout up at Stripe, stores it when paid (the webhook may
 * not have arrived yet) and returns what to show. Only the person who started it gets an answer.
 */
export async function confirmDonation(sessionId: string, userId: string) {
  if (!/^cs_\w+$/.test(sessionId)) return null;
  let s: Obj;
  try {
    s = await stripe("GET", `/checkout/sessions/${encodeURIComponent(sessionId)}`);
  } catch {
    return null;
  }
  if (s.metadata?.kind !== "donation" || s.metadata.userId !== userId) return null;
  if (s.payment_status === "paid") await onDonationPaid(s);
  const clanId: string | undefined = s.metadata.clanId || undefined;
  const clan = clanId ? db.select().from(schema.clan).where(eq(schema.clan.id, clanId)).get() : undefined;
  return {
    paid: s.payment_status === "paid",
    amount: Number(s.amount_total),
    currency: String(s.currency ?? "").toUpperCase(),
    clan: clan ? { name: clan.name, slug: clan.slug } : null,
    grantsSupporter: s.payment_status === "paid" && !!clan && (await coversSupporterYear(Number(s.amount_total), String(s.currency ?? ""))),
  };
}

// ---------- Badges and lists ----------

const badgeWhere = () =>
  and(eq(schema.donation.showBadge, true), isNull(schema.donation.refundedAt), gt(schema.donation.createdAt, new Date(Date.now() - BADGE_MS)));

/** A person who donated for themselves in the last year and agreed to show it. */
export function isDonor(userId: string) {
  if (!donationsEnabled()) return false;
  return !!db
    .select({ id: schema.donation.id })
    .from(schema.donation)
    .where(and(eq(schema.donation.userId, userId), isNull(schema.donation.clanId), badgeWhere()))
    .get();
}

/** A clan someone donated for in the last year. */
export function isDonorClan(clanId: string) {
  if (!donationsEnabled()) return false;
  return !!db
    .select({ id: schema.donation.id })
    .from(schema.donation)
    .where(and(eq(schema.donation.clanId, clanId), badgeWhere()))
    .get();
}

/** A person's own donations, newest first (profile export). */
export function myDonations(userId: string) {
  return db.select().from(schema.donation).where(eq(schema.donation.userId, userId)).orderBy(desc(schema.donation.createdAt)).all();
}

export const DONATIONS_PAGE = 50;

/** For the platform admin: one page of donations with donor and clan, and totals per currency. */
export function adminDonations(page = 0) {
  const rows = db
    .select({ d: schema.donation, clanName: schema.clan.name, clanSlug: schema.clan.slug })
    .from(schema.donation)
    .leftJoin(schema.clan, eq(schema.clan.id, schema.donation.clanId))
    .orderBy(desc(schema.donation.createdAt))
    .limit(DONATIONS_PAGE)
    .offset(page * DONATIONS_PAGE)
    .all();
  const yearStart = new Date(new Date().getFullYear(), 0, 1);
  const totals = db
    .select({
      currency: schema.donation.currency,
      count: sql<number>`count(*)`,
      total: sql<number>`sum(${schema.donation.amount})`,
      thisYear: sql<number>`sum(case when ${schema.donation.createdAt} >= ${yearStart.getTime()} then ${schema.donation.amount} else 0 end)`,
    })
    .from(schema.donation)
    .where(isNull(schema.donation.refundedAt))
    .groupBy(schema.donation.currency)
    .all();
  const count = db.select({ n: sql<number>`count(*)` }).from(schema.donation).get()?.n ?? 0;
  return { rows, totals, count };
}
