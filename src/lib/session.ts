import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { and, eq } from "drizzle-orm";
import { getAuth } from "./auth";
import { canManageClan, isClanMember } from "./clans";
import { db, schema } from "@/db";

export const getCurrentUser = cache(async () => {
  const s = await getAuth().api.getSession({ headers: await headers() });
  if (!s) return null;
  // Read fresh from DB so role changes apply immediately.
  return (await db.query.user.findFirst({ where: eq(schema.user.id, s.user.id) })) ?? null;
});

export async function requireUser() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

export async function requireAdmin() {
  const u = await requireUser();
  if (u.role !== "admin") redirect("/");
  return u;
}

/** Platform admins, admins of the LAN's clan and the LAN's orgas may manage a LAN. */
export function isLanManager(u: { id: string; role: string }, lanId: string) {
  if (u.role === "admin") return true;
  const l = db.select({ clanId: schema.lan.clanId }).from(schema.lan).where(eq(schema.lan.id, lanId)).get();
  if (l?.clanId && canManageClan(u, l.clanId)) return true;
  return !!db
    .select()
    .from(schema.lanOrga)
    .where(and(eq(schema.lanOrga.lanId, lanId), eq(schema.lanOrga.userId, u.id)))
    .get();
}

export async function requireLanManager(lanId: string) {
  const u = await requireUser();
  if (!isLanManager(u, lanId)) throw new Error("Only orgas of this LAN can do that");
  return u;
}

/** Clan members (and platform admins) may see a LAN and answer for it. */
export function canViewLan(u: { id: string; role: string }, lanId: string) {
  if (u.role === "admin") return true;
  const l = db.select({ clanId: schema.lan.clanId }).from(schema.lan).where(eq(schema.lan.id, lanId)).get();
  if (!l) return false;
  return (l.clanId && isClanMember(u.id, l.clanId)) || isLanManager(u, lanId);
}

export async function requireClanManager(clanId: string) {
  const u = await requireUser();
  if (!canManageClan(u, clanId)) throw new Error("Only clan admins can do that");
  return u;
}
