/**
 * Operator details shown on /terms and /privacy.
 * Each value can be overridden with the LEGAL_* environment variable next to it.
 */
export const legal = {
  /** Person or company that runs this Seatbit instance. */
  operatorName: process.env.LEGAL_OPERATOR_NAME ?? "Mike Keller",
  /** Postal address (street, postcode, town, country). */
  operatorAddress: process.env.LEGAL_OPERATOR_ADDRESS ?? "Grossfeld 17, 6423 Seewen, Switzerland",
  /** Contact email for questions and privacy requests. */
  contactEmail: process.env.LEGAL_CONTACT_EMAIL ?? "mike@cheller.dev",
  /** Where the server and database run. */
  hostingLocation: process.env.LEGAL_HOSTING_LOCATION ?? "Switzerland",
  /** Date of the current version of both documents. */
  lastUpdated: "11 November 2026",
};
