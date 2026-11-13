import type { Messages } from "../en";

export const clanForm: Messages["clanForm"] = {
  name: "Clan-Name",
  namePlaceholder: "z. B. The Dark Lizards",
  nameError: "Gib dem Clan einen Namen (mindestens 2 Zeichen).",
  description: "Beschreibung",
  join: "Wer kann beitreten?",
  joinApproval: "Alle können anfragen, ein Admin bestätigt",
  joinOpen: "Alle können direkt beitreten",
  joinInvite: "Nur mit Einladungslink",
  claims: "Können Mitglieder Gäste übernehmen?",
  claimsHint:
    "Wer beitritt, sieht Gäste mit demselben Namen oder Nick. Ein Gast, dessen Einladungs-E-Mail zur bestätigten Discord-E-Mail passt, wird immer automatisch übernommen.",
  claimsApproval: "Ja, ein Admin bestätigt jede Übernahme",
  claimsMatch: "Ja, gleicher Name oder Nick wird sofort übernommen",
  claimsOff: "Nein, nur mit dem eigenen Link des Gasts",
  names: "Wie werden Mitglieder angezeigt?",
  namesHint:
    "Gilt für Event-Seiten, die Clan-Seite, den Discord-Bot und die Lead-Ansichten. Leads sehen beim Verwalten von Events und Mitgliedern weiterhin den vollen Namen klein darunter. Ohne eigenen Nick erscheinen Leute als «Mike K.».",
  nameDisplay: { full: 'Vorname "Nick" Nachname', nameNick: 'Vorname "Nick"', nick: "Nur Nick" },
  language: "Sprache der Discord-Posts",
  languageHint: "Die Posts des Bots in den Kanälen des Clans. App, Mails und DMs bekommt jedes Mitglied in seiner eigenen Sprache.",
  languageDefault: "Standard der Instanz",
  avatar: "Avatar",
  avatarHint: "PNG, JPG, WebP oder GIF, bis 2 MB.",
  removeAvatar: "Aktuellen Avatar entfernen",
  create: "Clan erstellen",
};
