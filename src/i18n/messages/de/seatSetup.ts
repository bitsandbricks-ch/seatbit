import type { Messages } from "../en";

export const seatSetup: Messages["seatSetup"] = {
  label: "Plätze, die das Event uns gegeben hat",
  placeholder: "z. B. F1-F20  oder  F1-F10, G1-G10",
  saved: "{count} Plätze gespeichert.",
  save: "Plätze speichern",
  hint: "Jeder Buchstabe wird eine Reihe. Bestehende Zuteilungen bleiben für Plätze, die in der Liste bleiben.",
  assigned: { one: "{count} Platz zugeteilt.", other: "{count} Plätze zugeteilt." },
  fill: "Freie Plätze füllen",
  replanConfirm: "Alle nicht gehaltenen Plätze neu planen? Die aktuellen Zuteilungen ändern sich.",
  planned: { one: "{count} Platz neu geplant.", other: "{count} Plätze neu geplant." },
  replan: "Alle neu planen",
  status:
    "{unseated} kommen ohne Platz · {free} freie Plätze. Die Planung folgt den Platzwünschen (neben, nicht neben, Rand/Mitte, Wunschplatz) und setzt Leute mit Ticket zuerst.",
};
