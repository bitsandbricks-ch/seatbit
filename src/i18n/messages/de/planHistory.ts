import type { Messages } from "../en";

export const planHistory: Messages["planHistory"] = {
  title: "Verlauf des Sitzplans",
  hint: "Jede Änderung an den Plätzen, die neueste zuerst: Neuplanungen, Umplatzierungen, Tausche und reservierte Plätze.",
  none: "Noch keine Änderungen an den Plätzen.",
  nobodyMoved: "Niemand wurde umplatziert.",
  moved: { one: "{count} umplatziert:", other: "{count} umplatziert:" },
  move: "{name} {from} → {to}",
  noSeat: "keiner",
  older: { one: "{count} ältere Änderung", other: "{count} ältere Änderungen" },
};
