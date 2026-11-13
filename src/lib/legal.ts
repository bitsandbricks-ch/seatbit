import { getSetting } from "./settings";

/**
 * Who runs this Seatbit instance, for the Terms of Service and Privacy Policy.
 *
 * Every self-hosted instance has its own operator, so nothing here has a
 * built-in value: admins fill it in under Admin → Platform settings →
 * Operator & legal, or set the LEGAL_* environment variables. Until then the
 * legal pages say that the details are missing.
 */
export function getLegal() {
  const v = (key: string) => getSetting(key)?.trim() || undefined;
  const operatorName = v("legal.operatorName");
  const contactEmail = v("legal.contactEmail");
  return {
    operatorName,
    operatorAddress: v("legal.operatorAddress"),
    contactEmail,
    hostingLocation: v("legal.hostingLocation"),
    governingLaw: v("legal.governingLaw"),
    /** The operator's own documents; when set, /terms and /privacy redirect there. */
    termsUrl: v("legal.termsUrl"),
    privacyUrl: v("legal.privacyUrl"),
    /** Where users get the source code of this instance (footer "Source" link). */
    sourceUrl: v("legal.sourceUrl") ?? "https://github.com/bitsandbricks-ch/seatbit",
    /** Whether the operator has filled in the minimum: who they are and how to reach them. */
    complete: !!(operatorName && contactEmail),
  };
}

export type Legal = ReturnType<typeof getLegal>;

/** Date of the current version of the built-in Terms of Service and Privacy Policy texts. */
export const LEGAL_LAST_UPDATED = new Date(2026, 10, 13);
