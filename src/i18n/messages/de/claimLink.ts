import type { Messages } from "../en";

export const claimLink: Messages["claimLink"] = {
  gone: "Link funktioniert nicht mehr",
  goneHint: "Er wurde schon verwendet oder ersetzt. Frag deinen Lead nach einem neuen.",
  done: "Alles erledigt",
  doneText: "Dein Konto hat {name} übernommen. Deine Events, Tickets und dein Platz sind jetzt bei deinem eigenen Konto.",
  doneTextClan: "Dein Konto hat {name} in {clan} übernommen. Deine Events, Tickets und dein Platz sind jetzt bei deinem eigenen Konto.",
  goTo: "Zu Seatbit",
  hi: "Hallo {name}!",
  added: "Ein Lead hat dich als {name} hinzugefügt. Übernimm es, um deine Events, Tickets und deinen Platz mit deinem eigenen Konto zu sehen.",
  addedClan: "Die Leads von {clan} haben dich als {name} hinzugefügt. Übernimm es, um deine Events, Tickets und deinen Platz mit deinem eigenen Konto zu sehen.",
  addedEvents: {
    one: "Ein Lead hat dich als {name} hinzugefügt und für {count} Event angemeldet. Übernimm es, um deine Events, Tickets und deinen Platz mit deinem eigenen Konto zu sehen.",
    other: "Ein Lead hat dich als {name} hinzugefügt und für {count} Events angemeldet. Übernimm es, um deine Events, Tickets und deinen Platz mit deinem eigenen Konto zu sehen.",
  },
  addedClanEvents: {
    one: "Die Leads von {clan} haben dich als {name} hinzugefügt und für {count} Event angemeldet. Übernimm es, um deine Events, Tickets und deinen Platz mit deinem eigenen Konto zu sehen.",
    other: "Die Leads von {clan} haben dich als {name} hinzugefügt und für {count} Events angemeldet. Übernimm es, um deine Events, Tickets und deinen Platz mit deinem eigenen Konto zu sehen.",
  },
};
