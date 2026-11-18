import type { Messages } from "../en";

export const wishLead: Messages["wishLead"] = {
  title: "Wünsche für jemanden ändern",
  intro: "Wähl ein Mitglied, um seine Platzwünsche zu ändern, z. B. wenn es sie dir persönlich gesagt hat.",
  pick: "Mitglied",
  choose: "Mitglied wählen…",
  open: "Bearbeiten",
  editing: "Platzwünsche von {name}",
  editingHint: "Änderungen werden sofort gespeichert. Bei Wünschen, die du hinzufügst, sieht {name}, dass sie von dir sind.",
  done: "Fertig",
  edit: "Wünsche ändern",
  saved: "Gespeichert. {name} bekommt eine DM.",
  savedNoDm: "Gespeichert.",
  nearRange: "«Nahe» heisst innerhalb von",
  nearRangeUnit: "Plätzen",
  nearRangeHint: "Für Wünsche «Nahe bei jemandem». «Direkt neben» heisst immer der Platz daneben.",
  nearRangeSaved: "Gespeichert: nahe heisst innerhalb von {range} Plätzen.",
  dm: {
    subject: "Ein Organisator hat deine Platzwünsche für {lan} geändert",
    text: "{lead} hat deine Platzwünsche für {lan} geändert. Sie sind jetzt:\n\n{wishes}\n\nDu kannst sie auf der Event-Seite ändern, bis der Sitzplan definitiv ist.",
    none: "Keine Wünsche: jeder Platz ist recht.",
    note: "Notiz: {note}",
    toggle: "{name} per Discord-DM informieren",
    toggleHint: "Schickt die Wünsche, wie sie am Ende sind, eine Minute nach deiner letzten Änderung (ausser DMs sind ausgeschaltet). Aus: keine Nachricht.",
  },
};
