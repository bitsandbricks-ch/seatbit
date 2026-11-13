import type { Messages } from "../en";

export const missing: Messages["missing"] = {
  none: "Niemandem fehlt etwas. Alle haben geantwortet, ein Ticket und einen Platz.",
  intro:
    "Wer der Gruppe noch etwas schuldet, Schritt für Schritt. Ein Stupser geht als Discord-DM raus (wenn DMs an sind) und als Mail (wenn E-Mail-Erinnerungen an sind). Jede Person bekommt pro Schritt höchstens alle {hours} Stunden einen Stupser.",
  steps: "Schritte",
  leadTodo: "Lead-Aufgabe",
  dmMail: "DM + Mail",
  dm: "Discord-DM",
  mailOnly: "Nur Mail",
  cantReach: "Nicht erreichbar",
  nudgedAgo: "angestupst {when}",
  nudged: "{count} angestupst",
  skipped: "{count} kürzlich angestupst",
  unreachable: "{count} nicht erreichbar",
  nudgeAll: "Alle {count} anstupsen",
  allNudged: "Alle angestupst",
  nudgedShort: "Angestupst",
  nudgeName: "{name} anstupsen",
  nudge: "Anstupsen",
};
