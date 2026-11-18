// Which store a game link points to, for the store button. No server imports: the game list uses it.

export type StoreKey = "steam" | "epic" | "gog" | "battlenet" | "ea" | "ubisoft" | "xbox" | "itch" | "web";

const STORES: { key: StoreKey; name: string; hosts: RegExp }[] = [
  { key: "steam", name: "Steam", hosts: /(^|\.)(steampowered\.com|steamcommunity\.com)$/ },
  { key: "epic", name: "Epic Games", hosts: /(^|\.)(epicgames\.com)$/ },
  { key: "gog", name: "GOG", hosts: /(^|\.)gog\.com$/ },
  { key: "battlenet", name: "Battle.net", hosts: /(^|\.)(battle\.net|blizzard\.com)$/ },
  { key: "ea", name: "EA app", hosts: /(^|\.)(ea\.com|origin\.com)$/ },
  { key: "ubisoft", name: "Ubisoft", hosts: /(^|\.)(ubisoft\.com|ubi\.com)$/ },
  { key: "xbox", name: "Xbox", hosts: /(^|\.)(xbox\.com|microsoft\.com)$/ },
  { key: "itch", name: "itch.io", hosts: /(^|\.)itch\.io$/ },
];

/** The store a link points to; "web" (no brand name) for any other site, null for no link. */
export function storeOf(url: string | null | undefined): { key: StoreKey; name: string | null } | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.toLowerCase();
    const s = STORES.find((x) => x.hosts.test(host));
    return s ? { key: s.key, name: s.name } : { key: "web", name: null };
  } catch {
    return null;
  }
}
