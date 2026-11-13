import type { Messages } from "../en";

export const templateEditor: Messages["templateEditor"] = {
  subject: "Betreff",
  text: "Text",
  textHint: "Steht unter «Hallo {greeting},». Eine Leerzeile beginnt einen neuen Absatz.",
  button: "Button",
  buttonHint: "Leer lassen für keinen Button.",
  note: "Kleingedrucktes",
  noteHint: "Graue Zeile am Schluss. Leer lassen für keine.",
  placeholders: "Platzhalter, tippen zum Einfügen in {field}. Eine Zeile fällt weg, wenn alle ihre Platzhalter leer sind.",
  field: {
    subject: "den Betreff",
    body: "den Text",
    button: "den Button",
    note: "das Kleingedruckte",
  },
  facts: "Faktenbox (automatisch ausgefüllt): {list}.",
  preview: "Vorschau",
  previewOf: "Vorschau von {id}",
  test: "Test an mich senden",
  reset: "Auf Standard zurücksetzen",
};
