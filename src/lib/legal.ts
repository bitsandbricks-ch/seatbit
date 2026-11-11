/**
 * Operator details shown on /terms and /privacy.
 *
 * TODO(operator): replace the bracketed placeholders before publishing the
 * pages (e.g. as the Discord app's Terms of Service / Privacy Policy URLs).
 * Each value can also be set with the LEGAL_* environment variable next to it.
 */
export const legal = {
  /** Person or company that runs this Seatbit instance. */
  operatorName: process.env.LEGAL_OPERATOR_NAME ?? "[Operator name]",
  /** Postal address (street, postcode, town, country). */
  operatorAddress: process.env.LEGAL_OPERATOR_ADDRESS ?? "[Street and number, postcode town, Switzerland]",
  /** Contact email for questions and privacy requests. */
  contactEmail: process.env.LEGAL_CONTACT_EMAIL ?? "[privacy@example.ch]",
  /** Where the server and database run. */
  hostingLocation: process.env.LEGAL_HOSTING_LOCATION ?? "Switzerland",
  /** Courts for disputes (seat of the operator). */
  jurisdiction: process.env.LEGAL_JURISDICTION ?? "[town], Switzerland",
  /** Date of the current version of both documents. */
  lastUpdated: "11 November 2026",
};
