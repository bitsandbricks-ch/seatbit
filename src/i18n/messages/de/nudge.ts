import type { Messages } from "../en";

export const nudge: Messages["nudge"] = {
  going: "Komme",
  maybe: "Unsicher",
  declined: "Komme nicht",
  yes: "Ja",
  maybeShort: "Vielleicht",
  no: "Nein",
  answerBy: "Bitte antworte bis {date}.",
  decideBy: "Bitte entscheide dich bis {date}.",
  buyBy: "Bitte kauf es bis {date}.",
  interest: "{lan}: Würdest du kommen?",
  interestText:
    "die Leads schauen, wer an {lan} kommen würde. Es ist nicht verbindlich, es hilft ihnen nur beim Entscheiden. Ja, vielleicht oder nein?",
  answer: "{lan}: Kommst du?",
  answerText: "die Leads warten noch auf deine Antwort für {lan}. Kommst du, bist du unsicher oder kommst du nicht?",
  unsure: "{lan}: noch unsicher?",
  unsureText:
    "du hast gesagt, du bist dir bei {lan} unsicher. Weisst du es schon? Die Leads brauchen ein Ja oder Nein, um Tickets und Plätze zu planen.",
  ticket: "{lan}: hol dir dein Ticket",
  ticketText: "du kommst an {lan}, hast aber noch kein Ticket.",
  buyHere: "Kauf es hier: {url}.",
  tickIt: "Hake dann «Ich habe mein Ticket» in Seatbit ab.",
  buyTicket: "Ticket kaufen",
  nick: "{lan}: Wie ist dein Nick?",
  nickText: "bitte trag den Nick ein, den du auf dem Sitzplan für {lan} willst.",
  seat: "{lan}: wähl deinen Platz",
  seatText: "du kannst deinen Platz für {lan} selbst wählen, bis die Leads den Plan festlegen. Nimm einen freien im Tab Plätze.",
};
