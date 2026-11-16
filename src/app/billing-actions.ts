"use server";

import { redirect } from "next/navigation";
import { clanCan, getClan } from "@/lib/clans";
import { checkoutUrl, portalUrl, type SupportPlan } from "@/lib/billing";
import { DONATION_MAX, DONATION_MIN, donationCheckoutUrl } from "@/lib/donations";
import { getLegal } from "@/lib/legal";
import { requireClanPermission, requireUser } from "@/lib/session";
import { getT } from "@/i18n/server";

/** Sends a clan admin to Stripe Checkout to become a Supporter. */
export async function startSupport(clanId: string, plan: SupportPlan) {
  const me = await requireClanPermission(clanId, "settings");
  const c = getClan(clanId);
  if (!c) throw new Error("Clan not found");
  let url: string;
  try {
    url = await checkoutUrl(c, plan === "month" ? "month" : "year", { email: me.email });
  } catch {
    redirect(`/clans/${c.slug}/settings?support=error`);
  }
  redirect(url);
}

/** Stripe's customer portal: payment method, receipts, cancel. */
export async function manageSupport(clanId: string) {
  await requireClanPermission(clanId, "settings");
  const c = getClan(clanId);
  if (!c) throw new Error("Clan not found");
  let url: string;
  try {
    url = await portalUrl(c);
  } catch {
    redirect(`/clans/${c.slug}/settings?support=error`);
  }
  redirect(url);
}

/** Sends a signed-in person to Stripe Checkout for a one-off donation (for themselves or a clan they manage). */
export async function startDonation(formData: FormData) {
  const me = await requireUser({ next: "/donate" });
  // A typed amount wins over the picked button.
  const custom = String(formData.get("custom") ?? "").trim();
  const raw = (custom || String(formData.get("amount") ?? "")).replace(",", ".").trim();
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount < DONATION_MIN || amount > DONATION_MAX || Math.round(amount * 100) !== amount * 100) {
    redirect("/donate?donate=amount");
  }
  const clanId = String(formData.get("for") || "");
  // Only for a clan the person may manage: the gift shows on the clan and can make it a Supporter.
  const clan = clanId ? getClan(clanId) : null;
  if (clanId && (!clan || !clanCan(me, clanId, "settings"))) redirect("/donate?donate=error");
  const t = await getT();
  const operator = getLegal().operatorName;
  let url: string;
  try {
    url = await donationCheckoutUrl({
      user: me,
      clan: clan ?? null,
      amount,
      showBadge: formData.get("badge") === "on",
      productName: clan ? t("donate.productClan", { clan: clan.name }) : operator ? t("donate.productOperator", { operator }) : t("donate.product"),
      locale: t.locale,
    });
  } catch {
    redirect("/donate?donate=error");
  }
  redirect(url);
}
