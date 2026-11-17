import type { Messages } from "../en";

export const lanTypes: Messages["lanTypes"] = {
  clanHint:
    "Die wiederkehrenden LAN-Partys, an die euer Clan geht. Das Event jedes Jahres entsteht aus seinem Typ mit den Vorgaben eures Clans, und Mitglieder haben pro Typ einen Nick und eine LAN-ID.",
  spots: { one: "{count} Platz", other: "{count} Plätze" },
  hours: { one: "{count} Stunde", other: "{count} Stunden" },
  addLabel: "LAN-Typ hinzufügen, an den euer Clan geht",
  pick: "LAN-Typ wählen",
  allAdded: "Euer Clan hat alle LAN-Typen",
  add: "Hinzufügen",
  missing: "Fehlt einer? LAN-Typen gelten für alle Clans auf diesem Seatbit. Bitte den Plattform-Support, ihn hinzuzufügen.",
  aboutTitle: "Über diese LAN",
  aboutHint: "Ort, Website, Ticket-Shop und übliche Dauer, für alle Clans gleich.",
  globalNote: "Diese Angaben gelten für alle Clans. Der Plattform-Support hält sie aktuell.",
  editGlobal: "Für alle bearbeiten",
  clanDefaults: "Vorgaben eures Clans",
  clanDefaultsHint: "Werden in jedes neue Event dieses Typs übernommen. Nur euer Clan sieht und nutzt sie.",
  notUsedHint: "Euer Clan hat diesen LAN-Typ noch nicht. Speichern fügt ihn eurer Liste hinzu.",
  remove: "Aus eurem Clan entfernen",
  removeHint: "Events dieses Typs bleiben, wie sie sind. Die Vorgaben, Kontakte und To-dos eures Clans für diesen Typ werden gelöscht. Mitglieder behalten ihre Nicks und LAN-IDs.",
  removeQ: "{name} aus eurem Clan entfernen?",
  removeConfirm: "Entfernen",
  removeName: "{name} entfernen",
  nameTaken: "Es gibt schon einen LAN-Typ namens {name}.",
  adminSubtitle: "Wiederkehrende LAN-Partys, aus denen alle Clans wählen. Clans ergänzen ihre eigenen Plätze, Kontingente, Fristen und To-dos.",
  usageClans: { one: "{count} Clan", other: "{count} Clans" },
  usageEvents: { one: "{count} Event", other: "{count} Events" },
  usedBy: "Clans mit diesem Typ",
  usedByNone: "Noch kein Clan hat diesen Typ hinzugefügt.",
  deleteHint:
    "Löscht den Typ für alle Clans ({clans}): ihre Vorgaben, Kontakte und To-dos dafür und die Nicks der Mitglieder dafür ({nicks}). Seine Events ({events}) bleiben, ohne Typ.",
};
