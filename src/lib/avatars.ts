import fs from "node:fs";
import path from "node:path";
import { inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { IMAGE_TYPES, uploadsDir } from "./clans";

/**
 * Personal colours members pick from. Bright enough for the dark theme and
 * always shown next to the name, so colour never has to identify someone alone.
 * Status colours (Bit Green = you, sky = taken) are left out on purpose.
 */
export const PROFILE_COLORS = [
  { id: "#ff7a6b", label: "Coral" },
  { id: "#ffa94d", label: "Orange" },
  { id: "#f2cc4a", label: "Gold" },
  { id: "#a3e635", label: "Lime" },
  { id: "#2dd4bf", label: "Teal" },
  { id: "#6c8cff", label: "Blue" },
  { id: "#a78bfa", label: "Violet" },
  { id: "#e879f9", label: "Magenta" },
  { id: "#f472b6", label: "Pink" },
  { id: "#94a3b8", label: "Steel" },
] as const;

export const PROFILE_ICONS = [
  "🦎", "🧙", "🐉", "👾", "🎮", "🕹️", "🔥", "⚡", "💀", "🤖", "👽", "🐸",
  "🦊", "🐺", "🐱", "🐼", "🦄", "🍕", "☕", "🎧", "🚀", "⭐", "🌵", "🍄",
] as const;

export type AvatarUser = {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  image: string | null;
  avatarStyle: "picture" | "icon" | "initials";
  avatarFile: string | null;
  icon: string | null;
  color: string | null;
};

/** What an avatar shows; plain data so it can go to client components. */
export type AvatarData = {
  src: string | null;
  icon: string | null;
  initials: string;
  color: string;
  label: string;
};

/** The member's colour: their pick, or a stable one from their id. */
export function userColor(u: { id: string; color: string | null }) {
  if (u.color && PROFILE_COLORS.some((c) => c.id === u.color)) return u.color;
  let h = 0;
  for (const ch of u.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PROFILE_COLORS[h % PROFILE_COLORS.length].id;
}

export function initialsOf(u: { name: string; firstName: string; lastName: string }) {
  const i = [u.firstName, u.lastName].map((s) => s.trim()[0]?.toUpperCase()).filter(Boolean).join("");
  return i || u.name.trim().slice(0, 2).toUpperCase() || "?";
}

export function avatarData(u: AvatarUser): AvatarData {
  const uploaded = u.avatarFile ? `/user-avatar/${u.id}?v=${encodeURIComponent(u.avatarFile)}` : null;
  const picture = uploaded ?? (u.image && /^https:\/\//.test(u.image) ? u.image : null);
  return {
    src: u.avatarStyle === "picture" ? picture : null,
    icon: u.avatarStyle === "icon" && u.icon ? u.icon : null,
    initials: initialsOf(u),
    color: userColor(u),
    label: u.name,
  };
}

/** Avatar data for a list of user rows, by id. */
export function avatarMap(users: AvatarUser[]) {
  return new Map(users.map((u) => [u.id, avatarData(u)]));
}

/** Stores an uploaded profile picture and returns its file name. */
export async function saveUserAvatar(userId: string, file: File) {
  const ext = IMAGE_TYPES[file.type];
  if (!ext) throw new Error("Use a PNG, JPG, WebP or GIF image.");
  if (file.size > 2 * 1024 * 1024) throw new Error("The image must be smaller than 2 MB.");
  fs.mkdirSync(uploadsDir, { recursive: true });
  const name = `user-${userId}-${Date.now()}.${ext}`;
  fs.writeFileSync(path.join(uploadsDir, name), Buffer.from(await file.arrayBuffer()));
  return name;
}

export function deleteUserAvatarFile(name: string | null) {
  if (!name || name.includes("/") || name.includes("..")) return;
  try {
    fs.unlinkSync(path.join(uploadsDir, name));
  } catch {
    // already gone
  }
}

/** Avatar data for the given user ids. */
export function getAvatars(userIds: string[]) {
  if (userIds.length === 0) return new Map<string, AvatarData>();
  const { user } = schema;
  return avatarMap(db.select().from(user).where(inArray(user.id, [...new Set(userIds)])).all());
}
