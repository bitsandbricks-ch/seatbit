import type { Messages } from "../en";

export const whatsapp: Messages["whatsapp"] = {
  spotsTaken: "({going}/{capacity} Plätze vergeben)",
  going: "({count} kommen)",
  nobody: "noch niemand",
  whoIsIn: "Bisher dabei",
  goingSoFar: "Bisher dabei",
  sayIfComing: "Sag, ob du kommst: {link}",
  announcement: "Ankündigung",
  answerReminder: "Erinnerung: Antworten",
  answerText: {
    one: "bitte sagt bis {date}, ob ihr kommt. {count} von uns hat noch nicht geantwortet.",
    other: "bitte sagt bis {date}, ob ihr kommt. {count} von uns haben noch nicht geantwortet.",
  },
  ticketReminder: "Erinnerung: Ticket",
  ticketText: "kauft euer Ticket bis {date} und hakt es in Seatbit ab. Noch {count} offen.",
  startsSoon: "Bald geht's los",
  starts: "beginnt {date}.",
  startsAt: "beginnt {date} in {location}.",
  details: "Details und dein Platz: {link}",
};
