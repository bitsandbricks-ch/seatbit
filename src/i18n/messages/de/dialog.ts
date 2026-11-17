import type { Messages } from "../en";

export const dialog: Messages["dialog"] = {
  ok: "OK",
  cancel: "Abbrechen",
  delete: "Löschen",
  remove: "Entfernen",
  send: "Senden",
  post: "Posten",
  continue: "Weiter",
  cantUndo: "Das lässt sich nicht rückgängig machen.",
  deleteLanQ: "{name} löschen?",
  deleteLanBody: "Antworten, Tickets, Plätze, Mitfahrten und alles andere dieses Events gehen mit. Das lässt sich nicht rückgängig machen.",
  deleteClanQ: "Den Clan {name} löschen?",
  deleteTypeQ: "Den LAN-Typ {name} löschen?",
  deleteChargeQ: "Die Forderung {name} löschen?",
  leaveClanQ: "{name} verlassen?",
  leaveClanBody: "Du siehst die Events des Clans nicht mehr, und deine Antworten zu seinen kommenden Events werden zurückgezogen, mit deinen Fahrten und den Platzwünschen, die dich nennen (Antworten mit Ticket oder Zahlung bleiben, damit die Leads das regeln). Um zurückzukommen, fragst du wieder an.",
  unlinkChannelQ: "#{name} trennen?",
  unlinkChannelBody: "Seatbit postet dort nicht mehr. Du kannst ihn mit /seatbit in Discord wieder verbinden.",
};
