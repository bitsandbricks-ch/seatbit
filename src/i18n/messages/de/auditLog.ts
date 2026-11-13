import type { Messages } from "../en";

export const auditLog: Messages["auditLog"] = {
  kind: "Art der Änderung",
  all: "Alle",
  group: {
    events: "Events",
    attendance: "Antworten & Tickets",
    seats: "Plätze",
    members: "Mitglieder & Rollen",
    guests: "Gäste",
    settings: "Einstellungen",
    payments: "Zahlungen",
  },
  allEvents: "Alle Events",
  allClans: "Alle Clans",
  platformOnly: "Nur Plattform",
  show: "Zeigen",
  empty: "Noch nichts protokolliert",
  emptyHint: "Änderungen von Leads und Admins erscheinen hier: Platzwechsel, geänderte Antworten, Rollen, Gäste, Veröffentlichen und Absagen.",
  deletedMember: "Gelöschtes Mitglied",
  deletedClan: "gelöschter Clan",
  platform: "Plattform",
  newer: "Neuer",
  older: "Älter",
};
