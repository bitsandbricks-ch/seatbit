// Money helpers without database imports, so client components can use them too.

/** "CHF 12.50" from 1250 cents. Whole amounts keep the ".00": these are bills, not price tags. */
export const fmtAmount = (cents: number, currency: string) => `${currency} ${(cents / 100).toFixed(2)}`;

/** "12.50", "12,5", "12" -> cents. Empty -> null. Bad input -> NaN (the form rejects it). */
export function parseAmount(v: string): number | null {
  const s = v.trim().replace(/['’\s]/g, "").replace(",", ".");
  if (!s) return null;
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(s)) return NaN;
  return Math.round(Number(s) * 100);
}

/**
 * A total split over n people in whole cents. The cents that don't divide go to the first people,
 * so the parts always add up to the total (100 over 3 = 34, 33, 33).
 */
export function splitCents(total: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(total / n);
  const rest = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rest ? 1 : 0));
}
