import type { Messages } from "../en";

export const chat: Messages["chat"] = {
  posted: { one: "In {count} Kanal gepostet.", other: "In {count} Kanälen gepostet." },
  refreshed: "Schon überall gepostet, die Teilnehmerliste wurde aktualisiert.",
  post: "Ankündigung posten",
  refresh: "Ankündigung aktualisieren",
  confirmReminder: "Die Erinnerung «{label}» jetzt in {count} Discord-Kanal/Kanälen posten? Sie erwähnt die betroffenen Mitglieder.",
  postedReminder: "«{label}» in {count} Kanal/Kanälen gepostet.",
  postKind: "Posten: {label}",
  draft: "Die Ankündigung geht raus, sobald du das Event veröffentlichst.",
  copied: "Kopiert",
  copy: "Text kopieren",
  share: "Über WhatsApp teilen",
};
