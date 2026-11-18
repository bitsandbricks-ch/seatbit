"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { err, getT, tr } from "@/i18n/server";
import { formError } from "@/i18n/form-errors";
import { audit } from "@/lib/audit";
import {
  allCatalogGames,
  catalogByName,
  clearCover,
  coverUrl,
  getCatalogGame,
  linkSteam,
  mergeCatalog,
  nameKey,
  resolveCatalog,
  setCover,
  steamLookupOn,
  syncEventNames,
} from "@/lib/game-catalog";
import { lanChanged } from "@/lib/live";
import { foldName } from "@/lib/names";
import { enforceLimit } from "@/lib/rate-limit";
import { optionalHttpUrl } from "@/lib/safe-url";
import { assertPlatform, requireUser } from "@/lib/session";
import { searchSteam, steamAppIdFromUrl } from "@/lib/steam";
import type { FormState } from "./actions";

const { catalogGame, game } = schema;

export type GameSuggestion =
  | { kind: "catalog"; id: string; name: string; sizeGb: number | null; cover: string | null; steam: boolean }
  | { kind: "steam"; appId: number; name: string };

/**
 * Games matching what someone types in "Add game": catalog entries first, then Steam games
 * that aren't in the catalog yet (when Steam lookups are on).
 */
export async function findGames(q: string): Promise<GameSuggestion[]> {
  const me = await requireUser();
  const query = String(q ?? "").trim().slice(0, 60);
  if (query.length < 2) return [];
  const f = foldName(query);
  const all = allCatalogGames();
  const catalog = all
    .filter((c) => foldName(c.name).includes(f))
    .sort((a, b) => Number(!foldName(b.name).startsWith(f)) - Number(!foldName(a.name).startsWith(f)) || b.events - a.events)
    .slice(0, 6);
  const out: GameSuggestion[] = catalog.map((c) => ({
    kind: "catalog",
    id: c.id,
    name: c.name,
    sizeGb: c.sizeGb,
    cover: coverUrl(c),
    steam: !!c.steamAppId,
  }));
  if (!steamLookupOn()) return out;
  await enforceLimit("lookup", me.id);
  const known = new Set(all.map((c) => c.steamAppId).filter(Boolean));
  const names = new Set(all.map((c) => c.nameKey));
  for (const s of await searchSteam(query)) {
    if (known.has(s.appId) || names.has(nameKey(s.name))) continue;
    out.push({ kind: "steam", appId: s.appId, name: s.name });
  }
  return out.slice(0, 10);
}

// ---------------- Platform staff ----------------

const optInt = (min: number, max: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v ? Math.round(Number(v)) : null))
    .pipe(z.number().int().min(min).max(max).nullable());

const optBool = z
  .enum(["", "yes", "no"])
  .optional()
  .transform((v) => (v === "yes" ? true : v === "no" ? false : null));

const catalogInput = z
  .object({
    name: z.string().trim().min(1).max(60),
    sizeGb: optInt(0, 2000),
    url: optionalHttpUrl().default(""),
    steamAppId: optInt(1, 9_999_999_999),
    minPlayers: optInt(1, 1000),
    maxPlayers: optInt(1, 1000),
    free: optBool,
    lan: optBool,
  })
  .refine((d) => d.minPlayers == null || d.maxPlayers == null || d.minPlayers <= d.maxPlayers, { path: ["maxPlayers"] });

const refresh = (ids: string[] = []) => {
  for (const id of ids) lanChanged(id);
  revalidatePath("/admin/games");
  revalidatePath("/lans/[id]", "page");
};

const eventsOf = (catalogId: string) =>
  db
    .select({ lanId: game.lanId })
    .from(game)
    .where(eq(game.catalogId, catalogId))
    .all()
    .map((r) => r.lanId);

/** Adds or fixes a catalog entry. Platform staff with "games"; a Steam link fills the rest from Steam. */
export async function saveCatalogGame(_: FormState, formData: FormData): Promise<FormState> {
  const me = await assertPlatform("games");
  const id = (formData.get("id") as string) || null;
  const before = id ? getCatalogGame(id) : null;
  if (id && !before) throw await err("errors.gone");
  const raw = Object.fromEntries([...formData.entries()].filter(([k]) => k !== "id" && k !== "cover"));
  // The Steam field takes a store link as well as the bare id.
  const steam = String(raw.steamAppId ?? "").trim();
  raw.steamAppId = /^\d*$/.test(steam) ? steam : String(steamAppIdFromUrl(steam) ?? "x");
  const parsed = catalogInput.safeParse(raw);
  if (!parsed.success) return { error: formError(parsed.error, await getT()) };
  const d = parsed.data;
  const appId = d.steamAppId ?? steamAppIdFromUrl(d.url);
  const same = catalogByName(d.name);
  if (same && same.id !== id) return { error: await tr("errors.gameNameInCatalog", { name: same.name }) };
  if (appId) {
    const holder = db.select().from(catalogGame).where(eq(catalogGame.steamAppId, appId)).get();
    if (holder && holder.id !== id) return { error: await tr("errors.steamTaken", { name: holder.name }) };
  }
  let c;
  if (before) {
    db.update(catalogGame)
      .set({ ...d, nameKey: nameKey(d.name), steamAppId: appId })
      .where(eq(catalogGame.id, before.id))
      .run();
    c = getCatalogGame(before.id)!;
    if (appId && appId !== before.steamAppId) await linkSteam(c.id, appId);
    syncEventNames(c);
  } else {
    c = await resolveCatalog({ name: d.name, steamAppId: appId, sizeGb: d.sizeGb, url: d.url }, me.id);
    db.update(catalogGame)
      .set({ minPlayers: d.minPlayers, maxPlayers: d.maxPlayers, free: d.free ?? c.free, lan: d.lan ?? c.lan })
      .where(eq(catalogGame.id, c.id))
      .run();
  }
  const file = formData.get("cover");
  if (file instanceof File && file.size > 0) {
    if (file.size > 2 * 1024 * 1024) return { error: await tr("errors.imageSize") };
    if (!setCover(getCatalogGame(c.id)!, Buffer.from(await file.arrayBuffer()))) return { error: await tr("errors.imageType") };
  }
  audit({ actorId: me.id, action: "game.save", data: { game: d.name, created: !before } });
  refresh(eventsOf(c.id));
  if (!before) redirect(`/admin/games/${c.id}`);
  return { ok: true };
}

/** Fetches the details from Steam again, replacing what is there. Platform staff with "games". */
export async function refreshCatalogFromSteam(id: string): Promise<FormState> {
  const me = await assertPlatform("games");
  const c = getCatalogGame(id);
  if (!c) throw await err("errors.gone");
  if (!c.steamAppId || !steamLookupOn()) throw await err("errors.steamOff");
  await enforceLimit("lookup", me.id);
  if (!(await linkSteam(c.id, c.steamAppId, true))) throw await err("errors.steamDown");
  refresh(eventsOf(c.id));
  return { ok: true };
}

/** Takes the cover picture away. Platform staff with "games". */
export async function removeCatalogCover(id: string) {
  await assertPlatform("games");
  const c = getCatalogGame(id);
  if (!c) return;
  clearCover(c);
  refresh(eventsOf(c.id));
}

/** Folds a duplicate into another entry: events, votes, ticks and teams move over. Platform staff with "games". */
export async function mergeCatalogGame(id: string, formData: FormData) {
  const me = await assertPlatform("games");
  const from = getCatalogGame(id);
  const into = getCatalogGame(String(formData.get("into") ?? ""));
  if (!from || !into || from.id === into.id) throw await err("errors.gone");
  const lans = mergeCatalog(from.id, into.id);
  audit({ actorId: me.id, action: "game.merge", data: { game: from.name, into: into.name } });
  refresh(lans);
  redirect(`/admin/games/${into.id}`);
}

/** Deletes an entry no event uses. Platform staff with "games". */
export async function deleteCatalogGame(id: string) {
  const me = await assertPlatform("games");
  const c = getCatalogGame(id);
  if (!c) return;
  const used = eventsOf(c.id).length;
  if (used) throw await err("errors.gameInUse", { name: c.name, count: used });
  clearCover(c);
  db.delete(catalogGame).where(eq(catalogGame.id, c.id)).run();
  audit({ actorId: me.id, action: "game.delete", data: { game: c.name } });
  refresh();
  redirect("/admin/games");
}
