import type { Messages } from "../en";

export const wishOverview: Messages["wishOverview"] = {
  title: "Platzwünsche",
  hint: "Gewichtet nach der Reihenfolge jedes Mitglieds: ein oberer Wunsch zählt mehr. Tiefste zuerst.",
  met: "{pct} erfüllt",
  overall: "Erfüllte Wünsche gesamt",
  allMet: { one: "Bei {count} von {total} Mitgliedern sind alle Wünsche erfüllt", other: "Bei {count} von {total} Mitgliedern sind alle Wünsche erfüllt" },
  open: { one: "{count} Wunsch lässt sich noch nicht prüfen (kein Platz)", other: "{count} Wünsche lassen sich noch nicht prüfen (kein Platz)" },
  none: "Noch niemand hat Platzwünsche geschickt.",
  noSeat: "Noch kein Platz",
  ranked: "Wünsche von {name}, der wichtigste zuerst",
  srMet: "erfüllt:",
  srMissed: "verpasst:",
  srOpen: "noch nicht geprüft:",
};
