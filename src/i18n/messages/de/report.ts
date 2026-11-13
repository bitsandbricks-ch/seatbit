import type { Messages } from "../en";

export const report: Messages["report"] = {
  open: { clan: "Diesen Clan melden", event: "Dieses Event melden" },
  title: { clan: "Diesen Clan melden", event: "Dieses Event melden" },
  intro: "Deine Meldung geht an die Leute, die dieses Seatbit betreiben, nicht an den Clan. Sie sagen dem Clan nicht, wer gemeldet hat.",
  reason: "Grund",
  reasons: {
    spam: "Spam oder Werbung",
    harassment: "Belästigung oder Hass",
    illegal: "Illegale Inhalte",
    impersonation: "Gibt sich als jemand anderes aus",
    other: "Etwas anderes",
  },
  message: "Was stimmt nicht? (freiwillig, nötig bei „Etwas anderes“)",
  send: "Meldung senden",
  thanks: "Danke, deine Meldung ging an die Moderation.",
  pickReason: "Wähl einen Grund.",
  needMessage: "Schreib kurz, was nicht stimmt.",
  notFound: "Diesen Clan oder dieses Event gibt es nicht mehr.",
  limit: "Du hast heute schon viele Meldungen geschickt. Versuch es bitte morgen wieder.",
  duplicate: "Das hast du schon gemeldet. Die Moderation schaut es sich an.",
};
