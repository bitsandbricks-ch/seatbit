import type { Messages } from "../en";

export const reminderButtons: Messages["reminderButtons"] = {
  confirm: { one: "Die Erinnerung ({what}) jetzt an {count} Mitglied schicken?", other: "Die Erinnerung ({what}) jetzt an {count} Mitglieder schicken?" },
  sent: { one: "{count} Erinnerung ({what}) verschickt.", other: "{count} Erinnerungen ({what}) verschickt." },
  now: "Jetzt erinnern:",
  signup: "Unentschlossene ({count})",
  payment: "Ohne Ticket ({count})",
  event: "Alle, die kommen ({count})",
  draft: "Erinnerungen starten, sobald du das Event veröffentlichst.",
};
