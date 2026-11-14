import type { T } from "../i18n/translate";
import { isRanked, type SeatRule } from "./seat-rules";

/** A wish as a short sentence ("Near Anna (within 4 seats)"). Pure, safe for client components. */
export function wishText(r: SeatRule, t: T, nameOf: (id: string) => string, range: number) {
  switch (r.kind) {
    case "next":
      return t("wishes.rule.next", { name: nameOf(r.userId) });
    case "near":
      return t("wishes.rule.near", { name: nameOf(r.userId), range });
    case "avoid":
      return t("wishes.avoid.rule", { name: nameOf(r.userId) });
    case "seat":
      return t("wishes.rule.seat", { seat: r.seat });
    case "row":
      return t("wishes.rule.row", { row: r.row });
    case "edge":
      return t("wishes.rule.edge");
    case "middle":
      return t("wishes.rule.middle");
  }
}

const ICON: Record<SeatRule["kind"], string> = { next: "🤝", near: "👥", avoid: "🙅", seat: "💺", row: "↔", edge: "📍", middle: "📍" };
export const wishIcon = (r: SeatRule) => ICON[r.kind];

/** Wishes as text lines for Discord and DMs: the ranked ones numbered (the order is the priority), then "not right next to". */
export function wishLines(rules: SeatRule[], t: T, nameOf: (id: string) => string, range: number) {
  let n = 0;
  return rules.map((r) => `${isRanked(r) ? `${++n}.` : "•"} ${wishIcon(r)} ${wishText(r, t, nameOf, range)}`);
}
