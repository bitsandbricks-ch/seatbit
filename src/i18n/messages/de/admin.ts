import type { Messages } from "../en";

export const admin: Messages["admin"] = {
  tabs: { label: "Admin-Bereiche", overview: "Übersicht", settings: "Einstellungen" },
  backups: "Backups",
  usage: "Nutzung",
  backupFailed: "Das letzte Datenbank-Backup ist fehlgeschlagen. Siehe {link}.",
  subtitle: "Alle Clans, Events und Nutzer auf diesem Seatbit. Clan-Admins verwalten ihren eigenen Clan.",
  legalMissing: "Trag unter {link} ein, wer diese Instanz betreibt (Name und Kontakt-E-Mail). Nutzungsbedingungen und Datenschutzerklärung zeigen diese Angaben.",
  legalLink: "Plattform-Einstellungen → Betreiber & Rechtliches",
  clans: "Clans",
  users: "Nutzer",
  guests: { one: "{count} Gast", other: "{count} Gäste" },
  deleted: "{count} gelöscht",
  noClans: "Noch keine Clans.",
  settings: "Einstellungen",
  noLans: "Noch keine LANs. Clan-Admins fügen sie auf ihrer Clan-Seite hinzu.",
  past: "vergangen",
  noClan: "Kein Clan",
  going: "{n} kommen",
  noTicket: "{count} ohne Ticket",
  guestNoLogin: "Gast, noch kein Login",
};
