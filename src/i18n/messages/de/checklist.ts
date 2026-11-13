import type { Messages } from "../en";

export const checklist: Messages["checklist"] = {
  title: "Deine Checkliste",
  allSet: "Alles erledigt",
  optional: "optional",
  going: {
    title: "Sag, dass du kommst",
    done: "Du bist dabei.",
    waitlistAt: "Du bist #{place} auf der Warteliste.",
    waitlist: "Du bist auf der Warteliste.",
    deadline: "Antworte vor der Frist.",
    todo: "Gib den Leads Bescheid.",
  },
  nick: { title: "Gib deinen Nickname an", done: "Nick ist gesetzt.", todo: "Gib den Nick an, der auf dem Sitzplan stehen soll." },
  ticket: {
    title: "Kauf dein Ticket",
    done: "Du hast dein Ticket.",
    todo: "Kauf es beim Event und hak es dann hier ab.",
    waitlist: "Warte mit dem Kauf, bis du von der Warteliste nachrückst.",
  },
  pick: {
    title: "Wähl deinen Platz",
    picked: "Platz {seat} gewählt",
    final: "Du sitzt auf {seat}.",
    took: "Du hast {seat} genommen. Im Tab Plätze kannst du noch wechseln.",
    closed: "Selbst wählen ist geschlossen. Die Leads teilen dich ein.",
    take: "Nimm dir im Tab Plätze einen freien Platz.",
    none: "Keine freien Plätze mehr. Die Leads teilen dich ein.",
    ticketFirst: "Hak zuerst ab, dass du dein Ticket hast, und nimm dir dann im Tab Plätze einen freien Platz.",
  },
  wishes: {
    title: "Platzwünsche senden",
    final: "Gesendet. Der Plan ist jetzt definitiv.",
    sent: "Gesendet. Du kannst sie ändern, bis die Leads den Plan definitiv machen.",
    todo: "Optional: neben wem du sitzen möchtest, im Tab Plätze.",
  },
  seat: {
    title: "Leads bestätigen deinen Platz",
    final: "Platz {seat}, definitiv.",
    booked: "Auf der Event-Seite gebucht.",
    leadsBook: "Die Leads buchen ihn auf der Event-Seite.",
    finalNone: "Der Plan ist definitiv, aber du hast noch keinen Platz. Ein Lead meldet sich bei dir.",
    check: "Die Leads prüfen {seat} und machen den Sitzplan definitiv.",
    afterPick: "Sobald du einen Platz gewählt hast, prüfen die Leads den Plan und machen ihn definitiv.",
    assign: "Die Leads verteilen die Plätze nach der Frist und machen den Plan definitiv.",
  },
  games: {
    title: "Installier die Games",
    done: "Alles installiert.",
    todo: "{left} von {count} noch zu installieren. Hak sie im Tab Games ab.",
  },
  checkin: { title: "Am Event einchecken", done: "Du bist da.", todo: "Tippe auf «Ich bin da», wenn du ankommst." },
};
