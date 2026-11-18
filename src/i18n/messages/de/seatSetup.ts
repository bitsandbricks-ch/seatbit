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
  effort: "Wie gründlich der Planer sucht",
  efforts: { quick: "Schnell", extended: "Erweitert", thorough: "Gründlich" },
  effortHints: {
    quick: "Eine Suche, etwa so schnell wie das automatische Neuplanen.",
    extended: "Mehrere Suchen von verschiedenen Startpunkten, behält den besten Plan. Dauert höchstens ein paar Sekunden.",
    thorough:
      "Sucht im Hintergrund bis zu {minutes} Min. weiter (hört auf, sobald alle Wünsche erfüllt sind) und speichert den besten Plan unten als neue Variante. Die aktuellen Plätze bleiben, wie sie sind.",
  },
  startSearch: "Gründliche Suche starten",
  searchStarted: "Sucht im Hintergrund. Das Ergebnis erscheint als «{name}» unter Sitzplan-Varianten.",
  searching: "Suche läuft, spätestens um {time} fertig.",
  auto: "Automatisch neu planen, wenn sich Wünsche ändern",
  autoHint: "Jede Änderung an Platzwünschen plant alle nicht reservierten Plätze neu. Offene Sitzplan-Seiten aktualisieren sich selbst.",
  autoPaused: { final: "Pausiert: Der Plan ist final.", picking: "Pausiert, solange Mitglieder ihren Platz selbst wählen." },
  autoOnSaved: "Automatische Neuplanung ist an. Plätze neu geplant.",
  autoOffSaved: "Automatische Neuplanung ist aus.",
  status:
    "{unseated} kommen ohne Platz · {free} freie Plätze. Die Planung folgt den Platzwünschen jedes Mitglieds in dessen Reihenfolge und setzt Leute mit Ticket zuerst.",
};
