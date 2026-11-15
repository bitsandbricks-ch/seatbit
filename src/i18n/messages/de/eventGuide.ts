import type { Messages } from "../en";

export const eventGuide: Messages["eventGuide"] = {
  next: "Als Nächstes",
  go: {
    nick: "Nick setzen",
    wishes: "Platzwünsche senden",
    pick: "Platz wählen",
    games: "Zu den Games",
  },
  also: "Auch für diesen Event",
  extras: {
    rides: { one: "{count} sucht eine Mitfahrt", other: "{count} suchen eine Mitfahrt" },
    pack: "Tasche packen",
    games: { one: "{count} Game installieren", other: "{count} Games installieren" },
    food: { one: "Essensbestellung offen", other: "{count} Essensbestellungen offen" },
    owe: "Du schuldest {amount}",
    back: "Du bekommst {amount} zurück",
  },
  sections: { travel: "Anreise", gear: "Packen", games: "Games", costs: "Kosten" },
  trip: "Trip",
  onSite: "Vor Ort",
  onSiteLater: "Essensbestellungen erscheinen hier, sobald der Event startet.",
  onSiteLeads: "Vor dem Event sehen nur Leads diesen Tab. Mitglieder bekommen ihn, sobald der Event startet. So kannst du eine Essensbestellung vorbereiten.",
  tripLabel: "Trip-Bereiche",
};
