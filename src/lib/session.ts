import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { and, eq } from "drizzle-orm";
import { getAuth } from "./auth";
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

/** Global admins and the LAN's orgas may manage a LAN. */
export function isLanManager(u: { id: string; role: string }, lanId: string) {
  if (u.role === "admin") return true;
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
