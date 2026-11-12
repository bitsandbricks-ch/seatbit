/**
 * How a clan shows its members (clan setting): "full" = Mike "Reyki" Keller,
 * "nameNick" = Mike "Reyki", "nick" = Reyki. Orga and admin views always use "full",
 * because that's what tickets and real-life check-ins need.
 */
export const NAME_DISPLAYS = ["full", "nameNick", "nick"] as const;
export type NameDisplay = (typeof NAME_DISPLAYS)[number];
export const NAME_DISPLAY_LABELS: Record<NameDisplay, string> = {
  full: 'Name "Nick" Surname',
  nameNick: 'Name "Nick"',
  nick: "Nick only",
};

/**
 * The one way a person is shown in Seatbit (pages, seat map, emails, Discord):
 * Mike "Reyki" Keller. The nick is left out when it is just the real name (or missing).
 * Use the LAN's nick (event > LAN type > default) where there is one: see getNames
 * in lib/lans.ts, which does that lookup and picks the clan's name display.
 * Without a nick of their own, the shorter displays fall back to "Mike K." so two
 * Mikes stay apart.
 */
export function personLabel(u: { firstName: string; lastName: string; name: string }, nick?: string | null, mode: NameDisplay = "full") {
  const first = u.firstName.trim();
  const last = u.lastName.trim();
  const n = nick?.trim();
  if (!first && !last) return n && n !== u.name ? (mode === "full" ? `"${n}" ${u.name}`.trim() : n) : u.name;
  const showNick = n && n !== u.name && n !== first && n !== `${first} ${last}`.trim();
  if (mode !== "full" && !showNick) return [first, last ? `${[...last][0]}.` : ""].filter(Boolean).join(" ") || u.name;
  if (mode === "nick") return n!;
  return [first, showNick ? `"${n}"` : "", mode === "full" ? last : ""].filter(Boolean).join(" ");
}

/**
 * Tidies a typed name before it's saved: one canonical Unicode form (NFC), so "ü"
 * typed on a Mac (u + combining dots) and on a phone are the same letters, and single spaces.
 */
export function cleanName(s: string) {
  return s.normalize("NFC").replace(/\s+/g, " ").trim();
}

// Letters NFKD doesn't split into base letter + accent.
const FOLD: Record<string, string> = { ß: "ss", æ: "ae", œ: "oe", ø: "o", đ: "d", ð: "d", ł: "l", þ: "th", ı: "i" };

/**
 * A name reduced for comparing and searching: lower case, accents dropped, only
 * letters and digits. "Jörg Bäcker", "jorg backer" and "JÖRG  BÄCKER" give the same key.
 */
export function foldName(s: string) {
  return s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[ßæœøđðłþı]/g, (c) => FOLD[c] ?? c)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Keys a name matches under: the folded name and, for German, the spelling with
 * ae/oe/ue, so "Müller" also matches "Mueller".
 */
export function nameKeys(s: string) {
  const plain = foldName(s);
  const german = foldName(s.normalize("NFC").replace(/[äöüÄÖÜ]/g, (c) => ({ ä: "ae", ö: "oe", ü: "ue", Ä: "Ae", Ö: "Oe", Ü: "Ue" })[c]!));
  return plain === german ? [plain] : [plain, german];
}

/** Search that ignores case and accents and needs every word somewhere: "muller jo" finds Jörg Müller. */
export function nameMatches(haystack: string, q: string) {
  const h = nameKeys(haystack).join(" | ");
  return foldName(q)
    .split(" ")
    .filter(Boolean)
    .every((w) => h.includes(w));
}
