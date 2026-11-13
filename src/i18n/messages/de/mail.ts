import type { Messages } from "../en";

export const mail: Messages["mail"] = {
  hi: "Hallo {name},",
  hiAnon: "Hallo,",
  buttonFallback: "Falls der Knopf nicht funktioniert, öffne diesen Link:",
  sentFor: "Gesendet an dich für {header} auf Seatbit.",
  settings: "E-Mail-Einstellungen",
  privacy: "Datenschutz",
  terms: "Nutzungsbedingungen",
  sentWith: "Gesendet mit",
  textFooter: "Gesendet mit Seatbit. E-Mail-Einstellungen: {settings}\nDatenschutz: {privacy}\nNutzungsbedingungen: {terms}",
  seatInfo: "Du sitzt auf {seat}.",
  seatInfoBook: "Du sitzt auf {seat}. Die Leads buchen ihn für dich auf der Event-Seite.",
  yourClan: "deinem Clan",
  seatInfoNone: "Du hast noch keinen Platz, ein Lead meldet sich bei dir.",
};
