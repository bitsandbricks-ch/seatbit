import type { Messages } from "../en";

export const emergency: Messages["emergency"] = {
  tab: "Notfall",
  title: "Notfallkontakt und Ernährung",
  intro: "Freiwillig. Passiert an einer LAN etwas, wissen die Leads, wen sie anrufen sollen, und wer das Essen plant, weiss, worauf zu achten ist.",
  contactName: "Notfallkontakt",
  contactNamePh: "z. B. Anna Muster (Schwester)",
  contactPhone: "Telefonnummer",
  contactPhonePh: "+41 79 123 45 67",
  diet: "Ernährung und Allergien",
  dietPh: "z. B. vegetarisch, Nussallergie (hat einen EpiPen dabei)",
  dietHint: "Was die Leads wissen sollten, wenn Essen bestellt wird oder etwas passiert.",
  privacy:
    "Das sehen nur die Leads von Events, an die du kommst, ab deiner Antwort «Ich komme» bis zwei Tage nach dem Event. Jeder Blick darauf wird im Protokoll des Clans festgehalten. Es geht nie per Mail oder Discord raus und ist in keinem Export. Leere die Felder, um es zu entfernen.",
  manageTab: "Notfall",
  manageTitle: "Notfallkontakte",
  leadNotice:
    "Heikle Daten, die du als Lead dieses Events siehst. Nutze sie nur am Event oder im Notfall und kopiere sie nirgendwohin. Das Öffnen dieses Tabs wird protokolliert.",
  filledOf: "{filled} von {count} ausgefüllt",
  nobodyComing: "Noch niemand kommt.",
  seat: "Platz {seat}",
  contactShort: "Kontakt:",
  noContact: "Kein Notfallkontakt angegeben",
  dietShort: "Ernährung:",
  dietTitle: "Ernährung und Allergien",
  noDiets: "Niemand, der kommt, hat etwas zur Ernährung angegeben.",
  dietFoodHint: "Denk bei Essensbestellungen daran. Mitglieder tragen das in ihrem Profil ein.",
  foodHint: {
    one: "{count} Person, die kommt, hat Angaben zu Ernährung oder Allergien gemacht.",
    other: "{count} Personen, die kommen, haben Angaben zu Ernährung oder Allergien gemacht.",
  },
  foodHintLink: "Zur Liste",
};
