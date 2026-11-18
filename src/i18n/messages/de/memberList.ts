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
  removeBody: "Die Person wird von den kommenden Events des Clans genommen: Ihr Platz geht an die Warteliste, und Platzwünsche, Fahrten und Teams, die sie nennen, werden entfernt. Antworten mit Ticket oder Zahlung bleiben, markiert als nicht mehr im Clan, damit die Organisatoren das regeln. Vergangene Events bleiben, wie sie waren.",
};
