import "server-only";
/**
 * Connects the platform events (payments, donations) to the ops channel. Registered once
 * from instrumentation.ts; kept apart from ops.ts, which scripts import without "server-only".
 */
import { onPlatformEvent, type PlatformEvent } from "./platform-events";
import { opsT, postOps, type OpsMessage } from "./ops";
import { fmtDay } from "./format";
import type { T } from "@/i18n/translate";

const money = (cents: number, currency: string) => `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;

function paymentMessage(e: PlatformEvent, t: T): OpsMessage {
  switch (e.type) {
    case "donation.received":
      return {
        title: t("ops.donation", { amount: money(e.amount, e.currency) }),
        fields: [
          { name: t("ops.from"), value: e.by === "clan" ? (e.clanName ?? t("ops.aClan")) : t("ops.aPerson") },
          { name: t("ops.badge"), value: t(e.public ? "settingsUi.on" : "settingsUi.off") },
          ...(e.grantsSupporter ? [{ name: t("ops.supporter"), value: t("ops.supporterYear") }] : []),
        ],
      };
    case "donation.refunded":
      return { title: t("ops.refund", { amount: money(e.amount, e.currency) }) };
    case "supporter.started":
    case "supporter.renewed":
      return {
        title: t(e.type === "supporter.started" ? "ops.supporterStarted" : "ops.supporterRenewed", { clan: e.clanName }),
        fields: [
          ...(e.plan ? [{ name: t("ops.plan"), value: t(e.plan === "month" ? "adminSettings.monthly" : "adminSettings.yearly") }] : []),
          { name: t("ops.until"), value: fmtDay(e.until) },
        ],
      };
    case "supporter.ended":
      return { title: t("ops.supporterEnded", { clan: e.clanName }) };
  }
}

const g = globalThis as unknown as { __seatbitOpsHooks?: boolean };

export function registerOpsHooks() {
  if (g.__seatbitOpsHooks) return;
  g.__seatbitOpsHooks = true;
  onPlatformEvent((e) => postOps("payment", paymentMessage(e, opsT())));
}
