import type { Messages } from "../en";

export const wishOverview: Messages["wishOverview"] = {
  title: "Platzwünsche",
  hint: "Wie gut der aktuelle Sitzplan die Wünsche aller erfüllt. Jedes Mitglied ordnet seine Wünsche, darum zählt ein oberer Wunsch mehr als einer weiter unten. Tiefste Werte zuerst.",
  met: "{pct} erfüllt",
  overall: "Erfüllte Wünsche gesamt",
  allMet: { one: "Bei {count} von {total} Mitgliedern sind alle Wünsche erfüllt", other: "Bei {count} von {total} Mitgliedern sind alle Wünsche erfüllt" },
  open: { one: "{count} Wunsch lässt sich noch nicht prüfen (kein Platz)", other: "{count} Wünsche lassen sich noch nicht prüfen (kein Platz)" },
  none: "Noch niemand hat Platzwünsche geschickt.",
  seat: "Platz {seat}",
  noSeat: "Noch kein Platz",
  notYet: "Noch nicht geprüft",
  ranked: "Wünsche von {name}, der wichtigste zuerst",
  srMet: "erfüllt:",
  srMissed: "verpasst:",
  srOpen: "noch nicht geprüft:",
};
