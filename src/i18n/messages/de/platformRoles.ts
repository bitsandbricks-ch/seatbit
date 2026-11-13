import type { Messages } from "../en";

export const platformRoles: Messages["platformRoles"] = {
  title: "Plattform-Rollen",
  you: "Du bist {role} auf diesem Seatbit.",
  roleOf: "Plattform-Rolle von {name}",
  name: { owner: "Owner", admin: "Admin", moderator: "Moderator", support: "Support", member: "Keine Rolle" },
  info: {
    owner: "Alles, auch Zahlungen und die Betreiber- und Rechtsangaben.",
    admin: "Plattform-Einstellungen, Mail-Vorlagen, Rollen unter Admin und alle Clans und Events.",
    moderator: "Bearbeitet Meldungen und kann Nutzer und Clans sperren. Keine Einstellungen.",
    support: "Sieht Nutzer, Clans, Events und das Protokoll, ohne etwas zu ändern, um Leuten zu helfen.",
  },
};
