import type { Messages } from "../en";

export const discordClaim: Messages["discordClaim"] = {
  invalid: "Link funktioniert nicht mehr",
  invalidHint: "Er ist älter als einen Tag. Führ /claim im Discord-Server deines Clans nochmals aus, um einen neuen zu bekommen.",
  gone: "Schon übernommen",
  goneHint: "Dieser Gast wartet nicht mehr. Wenn du es warst, ist alles erledigt; sonst sprich mit deinen Leads.",
  wrong: "Anderes Discord-Konto",
  wrongHint: "Dieser Link gilt für das Discord-Konto, das /claim ausgeführt hat. Melde dich mit diesem an.",
  unlinked: "Zuerst Discord verknüpfen",
  unlinkedHint: "Dieser Link gilt für das Discord-Konto, das /claim ausgeführt hat. Verknüpf es in deinem Profil und öffne den Link dann nochmals.",
  openProfile: "Profil öffnen",
  pending: "Du hast angefragt, {name} in {clan} zu übernehmen. Ein Admin bestätigt es, und du bekommst eine Nachricht, sobald es so weit ist.",
  open: "{clan} öffnen",
  said: "Auf Discord hast du gesagt, du bist {name} in {clan}. Übernimm es, um Events, Tickets und Platz mit deinem eigenen Konto zu sehen.",
};
