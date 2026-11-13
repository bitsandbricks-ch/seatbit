import { and, eq, inArray, isNull, ne } from "drizzle-orm";
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

/** Ids of everyone who shares a clan with this user (both full members, not pending), the user included. */
export function clanmateIds(userId: string): Set<string> {
  const mine = db
    .select({ clanId: clanMember.clanId })
    .from(clanMember)
    .where(and(eq(clanMember.userId, userId), ne(clanMember.role, "pending")))
    .all()
    .map((r) => r.clanId);
  if (!mine.length) return new Set([userId]);
  const rows = db
    .select({ userId: clanMember.userId })
    .from(clanMember)
    .where(and(inArray(clanMember.clanId, mine), ne(clanMember.role, "pending")))
    .all();
  return new Set([userId, ...rows.map((r) => r.userId)]);
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

/** The image type by its first bytes, or null. The browser's file.type is only a claim. */
export function sniffImage(b: Buffer): string | null {
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.length >= 6 && /^GIF8[79]a$/.test(b.subarray(0, 6).toString("latin1"))) return "gif";
  if (b.length >= 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  return null;
}

/**
 * Checks an uploaded picture (type, size, real image content) and stores it as `<prefix>-<time>.<ext>`.
 * The extension comes from the content, so the file is always served with a matching image type.
 */
export async function saveUpload(prefix: string, file: File) {
  if (!IMAGE_TYPES[file.type]) throw await imageError("errors.imageType");
  if (file.size > 2 * 1024 * 1024) throw await imageError("errors.imageSize");
  const buf = Buffer.from(await file.arrayBuffer());
  const ext = sniffImage(buf);
  if (!ext) throw await imageError("errors.imageType");
  fs.mkdirSync(uploadsDir, { recursive: true });
  const name = `${prefix}-${Date.now()}.${ext}`;
  fs.writeFileSync(path.join(uploadsDir, name), buf);
  return name;
}

/** Stores an uploaded avatar and returns its file name. */
export const saveAvatar = (clanId: string, file: File) => saveUpload(`clan-${clanId}`, file);

/** Headers for serving an uploaded picture: never sniffed or run as a page, even if it slipped through. */
const uploadHeaders = (file: string) => ({
  "content-type": AVATAR_MIME[path.extname(file).slice(1)] ?? "application/octet-stream",
  "x-content-type-options": "nosniff",
  "content-security-policy": "default-src 'none'; sandbox",
  // The URL carries the file name, so a new upload gets a new URL.
  "cache-control": "public, max-age=31536000, immutable",
});

/** Response for an uploaded picture by its stored file name; 404 for anything that isn't a plain file name in the uploads folder. */
export function serveUpload(name: string | null | undefined) {
  if (!name || name.includes("/") || name.includes("\\") || name.includes("..")) return new Response("Not found", { status: 404 });
  const file = path.join(uploadsDir, name);
  if (!fs.existsSync(file)) return new Response("Not found", { status: 404 });
  return new Response(fs.readFileSync(file), { headers: uploadHeaders(file) });
}

export function avatarUrl(c: { id: string; avatar: string | null }) {
  return c.avatar ? `/clan-avatar/${c.id}?v=${encodeURIComponent(c.avatar)}` : null;
}

/** Upload errors in the uploader's language. Loaded lazily: scripts import this file without a request. */
export async function imageError(key: "errors.imageType" | "errors.imageSize") {
  const { err } = await import("@/i18n/server");
  return err(key);
}
