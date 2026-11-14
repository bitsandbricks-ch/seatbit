import type { Messages } from "../en";

export const wishOverview: Messages["wishOverview"] = {
  title: "Platzwünsche",
  hint: "Gewichtet nach der Reihenfolge jedes Mitglieds: ein oberer Wunsch zählt mehr. Tiefste zuerst; tippe auf ein Mitglied für alle Wünsche.",
  met: "{pct} erfüllt",
  overall: "Erfüllte Wünsche gesamt",
  allMet: { one: "Bei {count} von {total} Mitgliedern sind alle Wünsche erfüllt", other: "Bei {count} von {total} Mitgliedern sind alle Wünsche erfüllt" },
  filter: "Anzeigen",
  needsLook: "Anschauen",
  everyone: "Alle",
  allGood: "Jeder Wunsch, der sich prüfen lässt, ist erfüllt.",
  metOf: "{met}/{total}",
  none: "Noch niemand hat Platzwünsche geschickt.",
  noSeat: "Noch kein Platz",
  ranked: "Wünsche von {name}, der wichtigste zuerst",
  srMet: "erfüllt:",
  srMissed: "verpasst:",
  srOpen: "noch nicht geprüft:",
};
