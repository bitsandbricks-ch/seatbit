import type { Messages } from "../en";

export const missingSteps: Messages["missingSteps"] = {
  title: {
    interest: "Keine Antwort auf die Interessensabfrage",
    answer: "Noch keine Antwort",
    unsure: "Noch unsicher",
    ticket: "Noch kein Ticket",
    nick: "Kein Nick",
    seat: "Hat noch keinen Platz gewählt",
    confirm: "Ticket zu bestätigen",
    assign: "Kein Platz zugeteilt",
    book: "Platz nicht auf der Event-Seite gebucht",
  },
  hint: {
    interest: "Haben nicht gesagt, ob sie kommen würden. Der Stupser fragt ja, vielleicht oder nein (mit Knöpfen in der DM).",
    answer: "Clan-Mitglieder, die gar nicht geantwortet haben. Der Stupser fragt: komme, unsicher oder komme nicht.",
    unsure: "Haben unsicher gesagt. Der Stupser fragt, ob sie es schon wissen.",
    ticket: "Kommen, haben aber nicht abgehakt, dass sie ein Ticket haben. Der Stupser verlinkt den Ticketshop und die Frist.",
    nick: "Kommen ohne Nick für den Sitzplan.",
    seat: "Selbstwahl ist an und sie haben ein Ticket, aber noch keinen Platz.",
    book: "Haben einen festen Platz, aber noch kein Lead hat ihn auf dem Sitzplan des Events als gebucht abgehakt.",
    confirm: "Sagen, sie hätten ein Ticket gekauft. Prüf es und bestätige es.",
    assign: "Kommen, aber ohne Platz im Block der Gruppe.",
  },
  fix: { confirm: "Im Tab Teilnehmende bestätigen", assign: "Im Tab Plätze zuteilen", book: "Im Tab Plätze buchen" },
};
