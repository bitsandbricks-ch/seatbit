/**
 * Game details from the public Steam store API (no key needed): name, cover, install size,
 * free or paid, LAN mode. Only the server calls Steam, and only with a numeric app id or a
 * search term, so nothing about the people using Seatbit goes there. Platform admins can turn
 * it off with the `games.steamLookup` setting.
 *
 * The parsers are pure (tested in steam.test.ts); the fetchers return null on any trouble, so
 * adding a game never fails because Steam is slow or down.
 */

const STORE = "https://store.steampowered.com";
const TIMEOUT_MS = 6000;

export type SteamDetails = {
  appId: number;
  name: string;
  /** Install size in GB from the system requirements, rounded up; null when Steam doesn't say. */
  sizeGb: number | null;
  free: boolean;
  /** Steam's "LAN PvP" or "LAN Co-op" category. */
  lan: boolean;
  /** Multiplayer at all (online or LAN). */
  multiplayer: boolean;
  headerImage: string | null;
};

export type SteamHit = { appId: number; name: string };

/** The app id in a Steam store or community link (store.steampowered.com/app/730/...), or null. */
export function steamAppIdFromUrl(raw: string | null | undefined): number | null {
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (!/^(store\.steampowered\.com|steamcommunity\.com)$/i.test(u.hostname)) return null;
  const m = u.pathname.match(/^\/app\/(\d{1,10})(?:\/|$)/);
  return m ? Number(m[1]) : null;
}

export const steamStoreUrl = (appId: number) => `${STORE}/app/${appId}/`;

/** Opens Steam's install dialog for the game on the visitor's own PC. */
export const steamInstallUrl = (appId: number) => `steam://install/${appId}`;

/**
 * Install size in GB from a Steam system requirements block (HTML), e.g.
 * "<strong>Storage:</strong> 85 GB available space". Older pages say "Hard Drive" or "Hard Disk Space".
 */
export function parseSizeGb(html: string | null | undefined): number | null {
  if (!html) return null;
  const text = html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ");
  const m = text.match(/(?:Storage|Hard\s*Drive|Hard\s*Disk(?:\s*Space)?|Disk\s*Space|HDD|Free\s*Space)\s*:\s*([\d]+(?:[.,]\d+)?)\s*(TB|GB|MB)/i);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = m[2].toUpperCase();
  const gb = unit === "TB" ? n * 1000 : unit === "MB" ? n / 1000 : n;
  return Math.min(2000, Math.max(1, Math.ceil(gb)));
}

type Requirements = { minimum?: string; recommended?: string } | unknown[] | undefined;

/** The details out of one appdetails answer (`{ "<id>": { success, data } }`), or null. */
export function parseAppDetails(appId: number, json: unknown): SteamDetails | null {
  const entry = (json as Record<string, { success?: boolean; data?: Record<string, unknown> }> | null)?.[String(appId)];
  const d = entry?.success ? entry.data : undefined;
  if (!d || typeof d.name !== "string" || !d.name.trim()) return null;
  const req = d.pc_requirements as Requirements;
  const reqs = req && !Array.isArray(req) ? [req.minimum, req.recommended] : [];
  const sizes = reqs.map((r) => parseSizeGb(r)).filter((n): n is number => n != null);
  const cats = new Set(Array.isArray(d.categories) ? (d.categories as { id?: number }[]).map((c) => c.id) : []);
  return {
    appId,
    name: d.name.trim().slice(0, 60),
    sizeGb: sizes.length ? Math.max(...sizes) : null,
    free: d.is_free === true,
    // 47 LAN PvP, 48 LAN Co-op.
    lan: cats.has(47) || cats.has(48),
    // 1 Multi-player, 9 Co-op, 36 Online PvP, 38 Online Co-op, 49 PvP.
    multiplayer: [1, 9, 36, 38, 47, 48, 49].some((c) => cats.has(c)),
    headerImage: typeof d.header_image === "string" && d.header_image.startsWith("https://") ? d.header_image : null,
  };
}

/** Games from one storesearch answer (`{ items: [{ type, id, name }] }`). */
export function parseSearch(json: unknown, limit = 6): SteamHit[] {
  const items = (json as { items?: { type?: string; id?: number; name?: string }[] } | null)?.items;
  if (!Array.isArray(items)) return [];
  return items
    .filter((i) => i.type === "app" && Number.isInteger(i.id) && typeof i.name === "string")
    .slice(0, limit)
    .map((i) => ({ appId: i.id as number, name: (i.name as string).trim().slice(0, 60) }));
}

async function getJson(url: string): Promise<unknown> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: "application/json" } });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

// Small cache: typing a name asks on every pause, and Steam limits how often one server may ask.
const g = globalThis as unknown as { __seatbitSteam?: Map<string, { at: number; value: unknown }> };
const cache = (g.__seatbitSteam ??= new Map());
const CACHE_MS = 30 * 60 * 1000;

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value as T;
  const value = await load();
  if (value != null) {
    if (cache.size > 500) cache.clear();
    cache.set(key, { at: Date.now(), value });
  }
  return value;
}

/** Details of one Steam game, or null when Steam doesn't answer or doesn't know it. */
export function fetchSteamDetails(appId: number): Promise<SteamDetails | null> {
  if (!Number.isInteger(appId) || appId <= 0) return Promise.resolve(null);
  return cached(`app:${appId}`, async () => parseAppDetails(appId, await getJson(`${STORE}/api/appdetails?appids=${appId}&l=english`)));
}

/** Steam games matching a name, best first. Empty on any trouble. */
export function searchSteam(term: string): Promise<SteamHit[]> {
  const q = term.trim().slice(0, 60);
  if (q.length < 2) return Promise.resolve([]);
  return cached(`search:${q.toLowerCase()}`, async () =>
    parseSearch(await getJson(`${STORE}/api/storesearch/?term=${encodeURIComponent(q)}&l=english&cc=US`)),
  );
}

/** Downloads a Steam cover picture (only from Steam's own image hosts), at most 2 MB. */
export async function fetchSteamImage(url: string): Promise<Buffer | null> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || !/(^|\.)(steamstatic\.com|steampowered\.com|akamaihd\.net)$/i.test(u.hostname)) return null;
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "error" });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    return buf.length > 0 && buf.length <= 2 * 1024 * 1024 ? buf : null;
  } catch {
    return null;
  }
}
