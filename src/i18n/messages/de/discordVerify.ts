import type { Messages } from "../en";

export const discordVerify: Messages["discordVerify"] = {
  // Profile
  title: "Discord",
  username: "Benutzername",
  userId: "Benutzer-ID",
  unknownName: "Erscheint nach deiner nächsten Anmeldung mit Discord",
  verifiedOn: "Auf Discord bestätigt am {date}",
  verifiedHint: "Auf dem Discord-Server deines Clans gefunden: mit /verify, dem Button «Bestätigen» oder der Prüfung eines Clan-Admins.",
  notVerified: "Noch auf keinem Clan-Server bestätigt",
  // Lead view
  badge: "Auf Discord bestätigt",
  linked: "Discord verknüpft",
  // Bot
  noServerClan: "Dieser Server ist noch mit keinem Clan verknüpft. Führe zuerst `/seatbit here` aus.",
  needAdmin: "Nur Leads, die die Mitglieder von **{clan}** verwalten, können sie prüfen.",
  result: "**{clan}** geprüft: {verified} von {total} Mitgliedern sind auf diesem Server und jetzt bestätigt.",
  missing: "Nicht auf diesem Server ({count}): {names}",
  noDiscord: "Kein Discord verknüpft ({count}): {names}",
  failed: "{count} konnten nicht geprüft werden, versuch es später nochmals.",
  none: "**{clan}** hat noch keine Mitglieder mit einem Konto.",
  notMember: "Du bist in Seatbit noch kein Mitglied von {clan}.",
  selfDone: "Bestätigt: dein Seatbit-Konto ist auf dem Server von {clan}. Es zeigt jetzt ein grünes Discord-Abzeichen.",
  // Profile button
  verifyButton: "Bestätigen",
  verifying: "Prüfe …",
  selfVerified: "Bestätigt: dein Discord-Konto ist auf dem Server deines Clans.",
  selfNoServer: "Keiner deiner Clans hat bisher einen Discord-Server verknüpft.",
  selfNotFound: "Dein Discord-Konto ist auf keinem Server deiner Clans. Tritt einem bei und versuch es nochmals.",
  selfError: "Discord hat nicht geantwortet, versuch es später nochmals.",
  linkFirst: "Verknüpfe zuerst dein Discord-Konto.",
  // Clan settings
  button: "Discord prüfen",
  hint: "Gleicht das verknüpfte Discord-Konto jedes Mitglieds mit dem Discord-Server des Clans ab. Gleich wie /seatbit validate.",
  webResult: "{verified} von {total} Mitgliedern sind auf dem Discord-Server des Clans.",
  noServer: "Verknüpfe zuerst einen Discord-Server: führe /seatbit here in einem seiner Kanäle aus.",
  botOff: "Der Discord-Bot ist auf diesem Seatbit nicht eingerichtet.",
};
