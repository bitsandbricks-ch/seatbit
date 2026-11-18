import fs from "node:fs";
import path from "node:path";
import { and, asc, count, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import type { CatalogGame } from "@/db/schema";
import { AVATAR_MIME, sniffImage, uploadsDir } from "./clans";
import { platformCan } from "./platform-roles";
import { getBoolSetting } from "./settings";
import { fetchSteamDetails, fetchSteamImage, steamAppIdFromUrl, steamStoreUrl, type SteamDetails } from "./steam";

const { catalogGame, game, gameVote, team } = schema;

/** The key a game name is unique by: "CS2" and " cs2" are the same game. */
export const nameKey = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

export const steamLookupOn = () => getBoolSetting("games.steamLookup");

export const getCatalogGame = (id: string) => db.select().from(catalogGame).where(eq(catalogGame.id, id)).get();
export const catalogByName = (name: string) => db.select().from(catalogGame).where(eq(catalogGame.nameKey, nameKey(name))).get();
const catalogBySteam = (appId: number) => db.select().from(catalogGame).where(eq(catalogGame.steamAppId, appId)).get();

/** The whole catalog by name, with how many events use each game. */
export function allCatalogGames() {
  const used = new Map(
    db
      .select({ id: game.catalogId, n: count() })
      .from(game)
      .groupBy(game.catalogId)
      .all()
      .map((r) => [r.id, r.n]),
  );
  return db
    .select()
    .from(catalogGame)
    .orderBy(asc(catalogGame.nameKey))
    .all()
    .map((c) => ({ ...c, events: used.get(c.id) ?? 0 }));
}

/** Who may change a catalog entry's details: whoever put it in the catalog, and platform staff with "games". */
export const canEditCatalog = (u: { id: string; role: string }, c: Pick<CatalogGame, "createdBy">) =>
  platformCan(u, "games") || (!!c.createdBy && c.createdBy === u.id);

export const coverUrl = (c: Pick<CatalogGame, "id" | "cover">) => (c.cover ? `/game-cover/${c.id}?v=${encodeURIComponent(c.cover)}` : null);

function removeFile(name: string | null) {
  if (!name || name.includes("/") || name.includes("\\") || name.includes("..")) return;
  try {
    fs.unlinkSync(path.join(uploadsDir, name));
  } catch {
    // already gone
  }
}

/** Stores a cover picture (checked by its content) and swaps it in for the old one. */
export function setCover(c: Pick<CatalogGame, "id" | "cover">, buf: Buffer) {
  const ext = sniffImage(buf);
  if (!ext || !AVATAR_MIME[ext] || buf.length > 2 * 1024 * 1024) return false;
  fs.mkdirSync(uploadsDir, { recursive: true });
  const name = `game-${c.id}-${Date.now()}.${ext}`;
  fs.writeFileSync(path.join(uploadsDir, name), buf);
  db.update(catalogGame).set({ cover: name }).where(eq(catalogGame.id, c.id)).run();
  removeFile(c.cover);
  return true;
}

export function clearCover(c: Pick<CatalogGame, "id" | "cover">) {
  db.update(catalogGame).set({ cover: null }).where(eq(catalogGame.id, c.id)).run();
  removeFile(c.cover);
}

/**
 * Puts Steam's details on a catalog entry. `overwrite` (an admin's "refresh") replaces what is
 * there; otherwise Steam only fills what is still empty, so a fixed size stays fixed.
 */
export async function applySteam(c: CatalogGame, s: SteamDetails, overwrite = false) {
  const keep = <T,>(cur: T | null, next: T | null) => (overwrite ? (next ?? cur) : (cur ?? next));
  db.update(catalogGame)
    .set({
      steamAppId: s.appId,
      sizeGb: keep(c.sizeGb, s.sizeGb),
      free: keep(c.free, s.free),
      lan: keep(c.lan, s.lan),
      url: overwrite || !c.url ? steamStoreUrl(s.appId) : c.url,
      steamFetchedAt: new Date(),
    })
    .where(eq(catalogGame.id, c.id))
    .run();
  if (s.headerImage && (overwrite || !c.cover)) {
    const buf = await fetchSteamImage(s.headerImage);
    if (buf) setCover(c, buf);
  }
}

export type GameInput = {
  catalogId?: string | null;
  steamAppId?: number | null;
  name: string;
  sizeGb?: number | null;
  url?: string;
};

function insertCatalog(values: typeof catalogGame.$inferInsert) {
  return db.insert(catalogGame).values(values).returning().get();
}

/**
 * The catalog entry for what someone typed or picked: the picked entry, the Steam game (looked
 * up and stored the first time), or the entry with that name; a new one otherwise. Never fails
 * because of Steam: without an answer the game goes in with what was typed.
 */
export async function resolveCatalog(input: GameInput, userId: string | null): Promise<CatalogGame> {
  if (input.catalogId) {
    const c = getCatalogGame(input.catalogId);
    if (c) return c;
  }
  const appId = input.steamAppId ?? steamAppIdFromUrl(input.url);
  if (appId) {
    const known = catalogBySteam(appId);
    if (known) return known;
    const s = steamLookupOn() ? await fetchSteamDetails(appId) : null;
    // Another request may have added it while Steam answered.
    const again = catalogBySteam(appId);
    if (again) return again;
    const name = s?.name || input.name.trim();
    const same = name ? catalogByName(name) : undefined;
    if (same && same.steamAppId && same.steamAppId !== appId) return same;
    const c =
      same ??
      insertCatalog({
        name,
        nameKey: nameKey(name),
        steamAppId: appId,
        sizeGb: input.sizeGb ?? null,
        url: steamStoreUrl(appId),
        createdBy: userId,
      });
    if (s) await applySteam(c, s);
    else if (!c.steamAppId) db.update(catalogGame).set({ steamAppId: appId }).where(eq(catalogGame.id, c.id)).run();
    return getCatalogGame(c.id)!;
  }
  const same = catalogByName(input.name);
  if (same) return same;
  return insertCatalog({
    name: input.name.trim(),
    nameKey: nameKey(input.name),
    sizeGb: input.sizeGb ?? null,
    url: input.url ?? "",
    createdBy: userId,
  });
}

/** Renames every event's copy of the name, so lists, teams and the Discord bot say the same. */
export function syncEventNames(c: Pick<CatalogGame, "id" | "name">) {
  db.update(game).set({ name: c.name }).where(eq(game.catalogId, c.id)).run();
}

/**
 * Folds one catalog entry into another (duplicates such as "CS2" and "Counter-Strike 2"). An event
 * that has both keeps one game with everyone's votes, ticks and teams. Returns the events touched.
 */
export function mergeCatalog(fromId: string, intoId: string) {
  const into = getCatalogGame(intoId);
  if (!into || fromId === intoId) return [];
  const lans = new Set<string>();
  db.transaction((tx) => {
    const moving = tx.select().from(game).where(eq(game.catalogId, fromId)).all();
    for (const g of moving) {
      lans.add(g.lanId);
      const keep = tx
        .select()
        .from(game)
        .where(and(eq(game.lanId, g.lanId), eq(game.catalogId, intoId)))
        .get();
      if (!keep) {
        tx.update(game).set({ catalogId: intoId, name: into.name }).where(eq(game.id, g.id)).run();
        continue;
      }
      for (const v of tx.select().from(gameVote).where(eq(gameVote.gameId, g.id)).all()) {
        const other = tx
          .select()
          .from(gameVote)
          .where(and(eq(gameVote.gameId, keep.id), eq(gameVote.userId, v.userId)))
          .get();
        if (other)
          tx.update(gameVote)
            .set({ vote: other.vote || v.vote, installed: other.installed || v.installed })
            .where(and(eq(gameVote.gameId, keep.id), eq(gameVote.userId, v.userId)))
            .run();
        else tx.insert(gameVote).values({ ...v, gameId: keep.id }).run();
      }
      tx.update(team).set({ gameId: keep.id }).where(eq(team.gameId, g.id)).run();
      tx.delete(game).where(eq(game.id, g.id)).run();
    }
    const from = tx.select().from(catalogGame).where(eq(catalogGame.id, fromId)).get();
    tx.delete(catalogGame).where(eq(catalogGame.id, fromId)).run();
    removeFile(from?.cover ?? null);
  });
  return [...lans];
}

/**
 * Start-up job: games from before the catalog get an entry (one per name across all events),
 * with the size and link someone typed back then. Does nothing once everything is linked.
 */
export function linkLegacyGames() {
  const loose = db.select().from(game).where(isNull(game.catalogId)).all();
  if (!loose.length) return 0;
  const byKey = new Map<string, typeof loose>();
  for (const g of loose) byKey.set(nameKey(g.name), [...(byKey.get(nameKey(g.name)) ?? []), g]);
  db.transaction(() => {
    for (const [key, gs] of byKey) {
      let c = db.select().from(catalogGame).where(eq(catalogGame.nameKey, key)).get();
      if (!c) {
        const first = [...gs].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
        const url = gs.find((g) => g.url)?.url ?? "";
        const appId = steamAppIdFromUrl(url);
        c = insertCatalog({
          name: first.name.trim(),
          nameKey: key,
          sizeGb: gs.reduce<number | null>((n, g) => (g.sizeGb != null && (n == null || g.sizeGb > n) ? g.sizeGb : n), null),
          url,
          steamAppId: appId && !catalogBySteam(appId) ? appId : null,
          createdBy: first.addedBy,
          createdAt: first.createdAt,
        });
      }
      db.update(game)
        .set({ catalogId: c.id, name: c.name })
        .where(inArray(game.id, gs.map((g) => g.id)))
        .run();
    }
  });
  return loose.length;
}

/** Ties an entry to a Steam game (unless another entry has it) and fills what is empty from Steam. */
export async function linkSteam(id: string, appId: number, overwrite = false) {
  const holder = catalogBySteam(appId);
  if (holder && holder.id !== id) return false;
  db.update(catalogGame).set({ steamAppId: appId }).where(eq(catalogGame.id, id)).run();
  const s = steamLookupOn() ? await fetchSteamDetails(appId) : null;
  if (s) await applySteam(getCatalogGame(id)!, s, overwrite);
  return !!s;
}
