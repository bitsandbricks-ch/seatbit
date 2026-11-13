import { and, eq, isNull, ne } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import { db, schema } from "@/db";
import type { ClanRole } from "@/db/schema";
import { CLAN_PERMISSIONS, roleCan, type ClanPermission } from "./clan-roles";
import { foldName } from "./names";
import { platformCan } from "./platform-roles";

const { clan, clanMember } = schema;

type Who = { id: string; role: string };

export function clanRole(userId: string, clanId: string): ClanRole | null {
  return (
    db
      .select({ role: clanMember.role })
      .from(clanMember)
      .where(and(eq(clanMember.clanId, clanId), eq(clanMember.userId, userId)))
      .get()?.role ?? null
  );
}

export function isClanMember(userId: string, clanId: string) {
  const r = clanRole(userId, clanId);
  return !!r && r !== "pending";
}

/** Suspended by platform staff: its members lose access until it's restored. */
export function isClanSuspended(clanId: string | null | undefined) {
  if (!clanId) return false;
  return !!db.select({ s: clan.suspendedAt }).from(clan).where(eq(clan.id, clanId)).get()?.s;
}

/** Platform owners and admins may do everything; everyone else what their clan role allows (nothing in a suspended clan). */
export function clanCan(u: Who, clanId: string, perm: ClanPermission) {
  if (platformCan(u, "clans")) return true;
  return !isClanSuspended(clanId) && roleCan(clanRole(u.id, clanId), perm);
}

/** Everything the user may do in a clan, for pages that show or hide several parts. */
export function clanPerms(u: Who, clanId: string) {
  if (platformCan(u, "clans")) return new Set(CLAN_PERMISSIONS);
  if (isClanSuspended(clanId)) return new Set<ClanPermission>();
  const r = clanRole(u.id, clanId);
  return new Set(CLAN_PERMISSIONS.filter((p) => roleCan(r, p)));
}

export function myClans(userId: string) {
  return db
    .select({ clan, role: clanMember.role })
    .from(clanMember)
    .innerJoin(clan, eq(clan.id, clanMember.clanId))
    .where(and(eq(clanMember.userId, userId), ne(clanMember.role, "pending"), isNull(clan.suspendedAt)))
    .orderBy(clan.name)
    .all();
}

export function getClanBySlug(slug: string) {
  return db.select().from(clan).where(eq(clan.slug, slug)).get();
}

export function getClan(id: string) {
  return db.select().from(clan).where(eq(clan.id, id)).get();
}

export function slugify(name: string) {
  return (
    foldName(name)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "clan"
  );
}

export function uniqueSlug(name: string, exceptId?: string) {
  const base = slugify(name);
  for (let i = 1; ; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    const hit = db.select({ id: clan.id }).from(clan).where(eq(clan.slug, slug)).get();
    if (!hit || hit.id === exceptId) return slug;
  }
}

// ---------- avatars ----------

export const uploadsDir = path.join(
  path.dirname(process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "lan.db")),
  "uploads",
);

export const IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};
export const AVATAR_MIME: Record<string, string> = Object.fromEntries(
  Object.entries(IMAGE_TYPES).map(([m, e]) => [e, m]),
);

/** Stores an uploaded avatar and returns its file name. */
export async function saveAvatar(clanId: string, file: File) {
  const ext = IMAGE_TYPES[file.type];
  if (!ext) throw await imageError("errors.imageType");
  if (file.size > 2 * 1024 * 1024) throw await imageError("errors.imageSize");
  fs.mkdirSync(uploadsDir, { recursive: true });
  const name = `clan-${clanId}-${Date.now()}.${ext}`;
  fs.writeFileSync(path.join(uploadsDir, name), Buffer.from(await file.arrayBuffer()));
  return name;
}

export function avatarUrl(c: { id: string; avatar: string | null }) {
  return c.avatar ? `/clan-avatar/${c.id}?v=${encodeURIComponent(c.avatar)}` : null;
}

/** Upload errors in the uploader's language. Loaded lazily: scripts import this file without a request. */
export async function imageError(key: "errors.imageType" | "errors.imageSize") {
  const { err } = await import("@/i18n/server");
  return err(key);
}
