"use server";

import { redirect } from "next/navigation";
import { getClan } from "@/lib/clans";
import { checkoutUrl, portalUrl, type SupportPlan } from "@/lib/billing";
import { requireClanManager } from "@/lib/session";

/** Sends a clan admin to Stripe Checkout to become a Supporter. */
export async function startSupport(clanId: string, plan: SupportPlan) {
  const me = await requireClanManager(clanId);
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
  await requireClanManager(clanId);
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
