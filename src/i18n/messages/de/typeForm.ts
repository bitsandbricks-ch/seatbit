import type { Messages } from "../en";

export const typeForm: Messages["typeForm"] = {
  namePlaceholder: "z. B. Lock & Load",
  location: "Üblicher Ort",
  profileHint:
    "Optional. Das Profil eines Mitglieds auf der Event-Seite, mit {id} dort, wo die LAN-ID hinkommt. Seatbit verlinkt das Profil jeder teilnehmenden Person.",
  price: "Üblicher Ticketpreis",
  spots: "Übliche Plätze der Gruppe",
  seats: "Übliche Plätze",
  seatsHint: "z. B. F1-F20. Wird in jedes neue Event dieses Typs kopiert.",
  length: "Übliche Dauer (Stunden)",
  lengthHint: "Füllt das Ende aus, wenn du den Beginn setzt, z. B. Fr 18:00 bis So 16:00 = 46.",
  answerDays: "Antworten bis (Tage vorher)",
  answerDaysHint: "Füllt die Antwortfrist aus dem Beginn aus. Leer = keine Frist.",
  discordHint: "Wo der Bot diese Events, ihre Erinnerungen und News postet. Ein Thread oder Kanal hält den verknüpften Kanal aufgeräumt.",
  mode: { channel: "Im verknüpften Kanal", thread: "Thread pro Event", event_channel: "Kanal pro Event" },
  save: "Typ speichern",
  add: "Typ hinzufügen",
};
