import type { Messages } from "../en";

export const waitlistPanel: Messages["waitlistPanel"] = {
  whenOpens: "Wenn ein Platz frei wird",
  auto: "Der Nächste rückt nach",
  manual: "Leads wählen",
  noLimit: "Kein Limit",
  noFree: "Kein Platz frei",
  free: { one: "{count} Platz frei", other: "{count} Plätze frei" },
  autoHint: "Wenn jemand nicht mehr kommt, rückt die erste Person in der Reihe nach und bekommt eine E-Mail und eine Discord-DM.",
  manualHint:
    "Wenn jemand nicht mehr kommt, bekommen die Leads eine Nachricht und lassen jemanden von Hand nachrücken. Praktisch, wenn ihr zuerst fragen wollt, wer noch Zeit hat.",
  nobody: "Niemand wartet.",
  waiting: "wartet {since}",
  ticketConfirmed: "Ticket bestätigt",
  ticketReported: "Ticket gemeldet",
  up: "Einen Platz nach oben",
  down: "Einen Platz nach unten",
  upName: "{name} einen Platz nach oben",
  downName: "{name} einen Platz nach unten",
  overLimit: "Die Gruppe ist voll. {name} trotzdem auf «komme» setzen (über dem Limit)?",
  moveUp: "Auf «komme» setzen",
};
