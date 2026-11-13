import type { Messages } from "../en";

export const memberList: Messages["memberList"] = {
  searchN: "{count} Mitglieder durchsuchen",
  search: "Mitglieder suchen",
  searchAdmin: "Name, Nick oder E-Mail suchen",
  noMatchQ: "Niemand passt zu «{q}».",
  noMatch: "Niemand passt.",
  error: "Etwas ist schiefgelaufen",
  filter: { all: "alle", admin: "Admins", organizer: "Event-Manager", recruiter: "Recruiter", member: "Mitglieder" },
  removeGuestQ: "Gast {name} entfernen?",
  remove: "Entfernen",
  needsAdmin: "Der Clan braucht mindestens einen Admin. Mach zuerst jemand anderen zum Admin.",
  roleOf: "Rolle von {name}",
  giveUpAdmin: "Deine eigenen Admin-Rechte abgeben? Das kannst du selbst nicht rückgängig machen.",
  removeQ: "{name} aus dem Clan entfernen?",
};
