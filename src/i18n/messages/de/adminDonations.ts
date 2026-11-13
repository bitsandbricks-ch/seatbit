import type { Messages } from "../en";

export const adminDonations: Messages["adminDonations"] = {
  title: "Spenden",
  subtitle: "Einmalige Spenden über Stripe, neueste zuerst. Rückerstattungen kommen von Stripe.",
  settings: "Zahlungseinstellungen",
  off: "Spenden sind aus. Schalte sie unter Plattform-Einstellungen → Supporter ein.",
  total: "Insgesamt",
  thisYear: { one: "{amount} dieses Jahr · {count} Spende", other: "{amount} dieses Jahr · {count} Spenden" },
  none: "Noch keine Spenden",
  refunded: "Zurückerstattet",
  noBadge: "Ohne Abzeichen",
  newer: "Neuere",
  older: "Ältere",
  page: "Seite {page} von {pages}",
};
