import type { Messages } from "../en";

export const memberActions: Messages["memberActions"] = {
  guestNoRole: "Gäste können eine Rolle bekommen, sobald sie ihr Konto übernommen haben.",
  removeGuestQ: "Gast {name} entfernen? Antworten und Plätze werden ebenfalls gelöscht.",
  youAre: "Du bist {role}:",
  theyAre: "{name} ist {role}:",
  onlyAdmins: "Nur Admins ändern Rollen.",
  removeFromClan: "Aus dem Clan entfernen",
  lastAdmin: "{name} ist der einzige Admin. Mach zuerst jemand anderen zum Admin, damit der Clan nie ohne einen ist.",
  lastAdminSelf: "Du bist der einzige Admin. Mach zuerst jemand anderen zum Admin, damit der Clan nie ohne einen ist.",
};
