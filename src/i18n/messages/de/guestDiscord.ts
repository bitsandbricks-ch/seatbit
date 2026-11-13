import type { Messages } from "../en";

export const guestDiscord: Messages["guestDiscord"] = {
  notLinked: "Mit keinem Discord-Mitglied verknüpft.",
  linkedTo: "Verknüpft mit {name}",
  aMember: "einem Discord-Mitglied",
  linkedAt: "Verknüpft {date}",
  linkedAtBy: "Verknüpft {date} von {by}",
  dmed: "Übernahme-Link per DM geschickt {date}",
  noDm: "Der Bot konnte den Übernahme-Link noch nicht per DM schicken",
  takesOver: "Die erste Anmeldung mit diesem Discord-Konto übernimmt den Gast.",
  resend: "DM nochmals senden",
  relink: "Um jemand anderen zu verknüpfen, führ /guest in Discord nochmals aus.",
  howToLink: "Verknüpf die Person in Discord mit /guest guest:… member:…",
};
