import type { Messages } from "../en";

export const recap: Messages["recap"] = {
  title: "Das war {name}",
  came: { one: "{count} Person war dabei", other: "{count} Personen waren dabei" },
  yourSeat: "Du sassest auf {seat}.",
  played: "Meistgewünschte Spiele:",
  teams: { one: "{count} Turnier-Team", other: "{count} Turnier-Teams" },
  settled: "✓ Alle geteilten Kosten sind beglichen.",
  open: { one: "{count} Zahlung zwischen Mitgliedern ist noch offen.", other: "{count} Zahlungen zwischen Mitgliedern sind noch offen." },
  youOwe: { one: "Du hast noch {count} Zahlung offen →", other: "Du hast noch {count} Zahlungen offen →" },
  planNext: "Nächste planen",
};
