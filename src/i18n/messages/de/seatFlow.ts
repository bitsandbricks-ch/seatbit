import type { Messages } from "../en";

export const seatFlow: Messages["seatFlow"] = {
  removeTakenQ: "{seat} ist von {name} belegt. Platz trotzdem entfernen?",
  closed: "Geschlossen, als du festgelegt hast.",
  wishesHint: "Mitglieder sagen dir, neben wem und wo sie sitzen wollen. {wishes} von {count}, die kommen, haben bisher Wünsche geschickt.",
  pick: "Mitglieder wählen ihren Platz selbst",
  pickOn:
    "An: Wer kommt und «Ich habe mein Ticket» abgehakt hat, kann auf der Event-Seite einen freien Platz nehmen. Gehaltene Plätze bleiben unerreichbar und du kannst weiterhin alle verschieben.",
  pickOff: "Optional. Schalte es ein, damit Mitglieder selbst einen freien Platz nehmen. Danach prüfst du den Plan und legst ihn fest.",
  turnOff: "Selbstwahl ausschalten",
  turnOn: "Selbstwahl einschalten",
  finalize: "Leads machen den Plan definitiv",
  finalized: "Definitiv seit {date}. Mitglieder sehen den Plan, und Änderungen ab jetzt werden den Betroffenen mitgeteilt.",
  reopen: "Wieder öffnen",
  check: "Prüf die Plätze, verschieb wen nötig und leg den Plan dann fest. Das schliesst die Platzwünsche und zeigt allen den Plan.",
  checkPicked:
    "Prüf die gewählten Plätze, verschieb wen nötig und leg den Plan dann fest. Das schliesst Selbstwahl und Platzwünsche und zeigt allen den Plan.",
  unseated: { one: "{count} Person, die kommt, hat noch keinen Platz.", other: "{count} Personen, die kommen, haben noch keinen Platz." },
  tellEveryone: "Allen, die kommen, ihren Platz mitteilen",
  finalizedTold: { one: "Definitiv, {count} Mitglied informiert.", other: "Definitiv, {count} Mitglieder informiert." },
  finalizedShort: "Definitiv.",
  finalizeButton: "Sitzplan definitiv machen",
  on: "an",
  optionalOff: "optional · aus",
};
