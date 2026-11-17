import { shownError } from "./action-error";
import type { T } from "@/i18n/translate";

/**
 * Parses a seat list like "F1-F20" or "F1-F10, G1-G10, H3" into rows of labels.
 * Each letter prefix becomes one row, in the order given.
 */
export function parseSeatSpec(spec: string, t: T): string[][] {
  const rows = new Map<string, string[]>();
  for (const raw of spec.split(/[\s,;]+/).filter(Boolean)) {
    const range = raw.match(/^([A-Za-z]*)(\d+)-(?:([A-Za-z]*))?(\d+)$/);
    const single = raw.match(/^([A-Za-z]*)(\d+)$/);
    let prefix: string, from: number, to: number;
    if (range && (!range[3] || range[3].toUpperCase() === range[1].toUpperCase())) {
      [prefix, from, to] = [range[1].toUpperCase(), Number(range[2]), Number(range[4])];
    } else if (single) {
      [prefix, from, to] = [single[1].toUpperCase(), Number(single[2]), Number(single[2])];
    } else {
      throw shownError(t("errors.seatParse", { raw }));
    }
    if (!prefix) throw shownError(t("errors.seatRow", { raw }));
    if (to < from) [from, to] = [to, from];
    if (to - from > 200) throw shownError(t("errors.seatTooMany", { raw }));
    const row = rows.get(prefix) ?? [];
    for (let n = from; n <= to; n++) {
      const label = `${prefix}${n}`;
      if (!row.includes(label)) row.push(label);
    }
    rows.set(prefix, row);
  }
  return [...rows.values()];
}
