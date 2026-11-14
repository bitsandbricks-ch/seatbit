import type { Messages } from "../en";

export const wishLead: Messages["wishLead"] = {
  title: "Wünsche für jemanden ändern",
  intro: "Wähl ein Mitglied, um seine Platzwünsche zu ändern, z. B. wenn es sie dir persönlich gesagt hat.",
  pick: "Mitglied",
  choose: "Mitglied wählen…",
  open: "Bearbeiten",
  editing: "Platzwünsche von {name}",
  editingHint: "Änderungen werden sofort gespeichert. {name} bekommt eine Minute nach deiner letzten Änderung eine Discord-DM mit den neuen Wünschen (ausser DMs sind ausgeschaltet).",
  done: "Fertig",
  edit: "Wünsche ändern",
  saved: "Gespeichert. {name} bekommt eine DM.",
  nearRange: "«Nahe» heisst innerhalb von",
  nearRangeUnit: "Plätzen",
  nearRangeHint: "Für Wünsche «Nahe bei jemandem». «Direkt neben» heisst immer der Platz daneben.",
  nearRangeSaved: "Gespeichert: nahe heisst innerhalb von {range} Plätzen.",
  dm: {
    subject: "Ein Lead hat deine Platzwünsche für {lan} geändert",
    text: "{lead} hat deine Platzwünsche für {lan} geändert. Sie sind jetzt:\n\n{wishes}\n\nDu kannst sie auf der Event-Seite ändern, bis der Sitzplan fixiert ist.",
    none: "Keine Wünsche: jeder Platz ist recht.",
    note: "Notiz: {note}",
  },
};
