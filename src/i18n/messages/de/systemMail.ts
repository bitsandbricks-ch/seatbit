import type { Messages } from "../en";

export const systemMail: Messages["systemMail"] = {
  adminTitle: "Feste Mails",
  adminHint: "System-Mails mit festem Text, in jeder Sprache. Sie nutzen dasselbe Layout wie die Vorlagen oben, lassen sich hier aber nicht bearbeiten.",
  fact: { server: "SMTP-Server", instance: "Instanz" },
  smtpTest: {
    title: "Testmail",
    when: "Ein Plattform-Admin drückt «Testmail senden» in den E-Mail-Einstellungen.",
    subject: "Seatbit-Testmail",
    body: "Das ist eine Testmail aus den Seatbit-Plattform-Einstellungen von {url}. Wenn du sie lesen kannst, funktioniert E-Mail.",
    button: "E-Mail-Einstellungen öffnen",
    note: "Du bekommst diese Mail, weil du «Testmail senden» gedrückt hast.",
  },
  passwordReset: {
    title: "Passwort zurücksetzen",
    when: "Jemand verlangt ein neues Passwort (nur mit E-Mail-Login).",
    subject: "Setze dein Seatbit-Passwort zurück",
    body: "Jemand möchte das Passwort deines Seatbit-Kontos zurücksetzen. Wähle mit dem Knopf unten ein neues. Der Link gilt nur kurze Zeit.",
    button: "Neues Passwort wählen",
    note: "Wenn du das nicht warst, ignoriere diese Mail. Dein Passwort bleibt gleich.",
  },
  notice: {
    title: "Benachrichtigungen",
    when: "Alles andere, was Seatbit dir mailt: Beitrittsanfragen, Rollenwechsel, Platztausch, Event-Änderungen, Upgrade-Hinweise für Plattform-Admins und mehr. Der Text ist die Benachrichtigung, der Knopf öffnet die Seite, um die es geht.",
    exampleSubject: "Anna möchte The dark lizzards gizzards wizzards beitreten",
    exampleBody: "Anna möchte The dark lizzards gizzards wizzards beitreten. Nimm die Anfrage auf der Mitgliederseite des Clans an oder lehne sie ab.",
  },
};
