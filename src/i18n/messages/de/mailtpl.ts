import type { Messages } from "../en";

export const mailtpl: Messages["mailtpl"] = {
  guestInvite: { title: "Gast-Einladung", when: "Ein Lead fügt einen Gast mit E-Mail-Adresse hinzu oder drückt «Einladung senden»." },
  reminderSignup: { title: "Erinnerung: Kommst du?", when: "Vor der Antwortfrist, an Mitglieder, die nicht oder mit «unsicher» geantwortet haben." },
  reminderPayment: { title: "Erinnerung: Kauf dein Ticket", when: "Vor der Ticketfrist, an alle, die kommen und noch kein Ticket gemeldet haben." },
  reminderEvent: { title: "Erinnerung: Event startet bald", when: "Am Tag vor dem Event, an alle, die kommen." },
  seatsPublished: { title: "Sitzplan fixiert", when: "Ein Lead fixiert den Sitzplan und hakt «Allen, die kommen, ihren Platz mitteilen» an." },
  waitlistPromoted: { title: "Von der Warteliste nachgerückt", when: "Ein Platz wird frei und jemand von der Warteliste rückt nach." },
  eventPublished: { title: "Neues Event", when: "Ein Lead veröffentlicht ein Event (oder es geht zur geplanten Zeit live), an Mitglieder, die sich für diese Art Event interessieren." },
  interestCheck: { title: "Interessenabfrage", when: "Ein Lead veröffentlicht ein Event, das mit einer Interessenabfrage startet." },
  signupOpen: { title: "Anmeldung offen", when: "Ein Lead beendet die Interessenabfrage und öffnet die Anmeldung." },
  eventCancelled: { title: "Event abgesagt", when: "Ein Lead sagt ein Event ab, an alle, die geantwortet haben." },
  eventNews: { title: "News von den Leads", when: "Ein Lead postet News zu einem Event, an alle, die kommen, unsicher sind oder auf der Warteliste stehen." },
};
