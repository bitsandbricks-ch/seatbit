import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { and, eq } from "drizzle-orm";
import { getAuth } from "./auth";
import { clanCan, isClanMember } from "./clans";
import type { ClanPermission } from "./clan-roles";
import { db, schema } from "@/db";

export const getCurrentUser = cache(async () => {
  const s = await getAuth().api.getSession({ headers: await headers() });
  if (!s) return null;
  // Read fresh from DB so role changes apply immediately.
  const u = await db.query.user.findFirst({ where: eq(schema.user.id, s.user.id) });
  // A deleted account is signed out everywhere, even if a session cookie is still around.
  return u && !u.deletedAt ? u : null;
});

/**
 * Signed-in user. Until they've given first name and surname (e.g. right after a Discord sign-up) they're sent to /welcome.
 * `next` is where to come back to after signing in or finishing the profile (a shared event link, say).
 */
export async function requireUser(opts?: { allowIncomplete?: boolean; next?: string }) {
  const u = await getCurrentUser();
  const back = opts?.next ? `?next=${encodeURIComponent(opts.next)}` : "";
  if (!u) redirect(`/login${back}`);
  if (!opts?.allowIncomplete && !isProfileComplete(u)) redirect(`/welcome${back}`);
  return u;
}

export const isProfileComplete = (u: { firstName: string; lastName: string }) => !!(u.firstName && u.lastName);

export async function requireAdmin() {
  const u = await requireUser();
  if (u.role !== "admin") redirect("/");
  return u;
}

/** Platform admins, the clan's admins and event managers, and the LAN's leads may manage a LAN. */
export function isLanManager(u: { id: string; role: string }, lanId: string) {
  if (u.role === "admin") return true;
  const l = db.select({ clanId: schema.lan.clanId }).from(schema.lan).where(eq(schema.lan.id, lanId)).get();
  if (l?.clanId && clanCan(u, l.clanId, "events")) return true;
  return !!db
    .select()
    .from(schema.lanOrga)
    .where(and(eq(schema.lanOrga.lanId, lanId), eq(schema.lanOrga.userId, u.id)))
    .get();
}

export async function requireLanManager(lanId: string) {
  const u = await requireUser();
  if (!isLanManager(u, lanId)) {
    const { err } = await import("@/i18n/server");
    throw await err("errors.perm.lead");
  }
  return u;
}

/** Clan members (and platform admins) may see a LAN and answer for it. Drafts only show to its managers. */
export function canViewLan(u: { id: string; role: string }, lanId: string) {
  if (u.role === "admin") return true;
  const l = db
    .select({ clanId: schema.lan.clanId, publishedAt: schema.lan.publishedAt })
    .from(schema.lan)
    .where(eq(schema.lan.id, lanId))
    .get();
  if (!l) return false;
  if (!l.publishedAt) return isLanManager(u, lanId);
  return (l.clanId && isClanMember(u.id, l.clanId)) || isLanManager(u, lanId);
}

/** Leaves out drafts the user can't manage (for event lists). */
export function visibleLans<T extends { id: string; publishedAt: Date | null }>(u: { id: string; role: string }, lans: T[]) {
  return lans.filter((l) => l.publishedAt || isLanManager(u, l.id));
}


export async function requireClanPermission(clanId: string, perm: ClanPermission) {
  const u = await requireUser();
  if (!clanCan(u, clanId, perm)) {
    // Lazy: the i18n server module imports this file.
    const { err } = await import("@/i18n/server");
    throw await err(`errors.perm.${perm}`);
  }
  return u;
}
