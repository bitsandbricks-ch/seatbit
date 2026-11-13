import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { and, eq } from "drizzle-orm";
import { getAuth } from "./auth";
import { clanCan, isClanMember, isClanSuspended } from "./clans";
import { isStaff, platformCan, type PlatformPermission } from "./platform-roles";
import type { ClanPermission } from "./clan-roles";
import { db, schema } from "@/db";

/** The account behind the session cookie, also when it's suspended. */
const getSessionAccount = cache(async () => {
  const s = await getAuth().api.getSession({ headers: await headers() });
  if (!s) return null;
  // Read fresh from DB so role changes apply immediately.
  const u = await db.query.user.findFirst({ where: eq(schema.user.id, s.user.id) });
  // A deleted account is signed out everywhere, even if a session cookie is still around.
  return u && !u.deletedAt ? u : null;
});

export const getCurrentUser = cache(async () => {
  const u = await getSessionAccount();
  // Suspended accounts count as signed out; requireUser sends them to /suspended.
  return u && !u.suspendedAt ? u : null;
});

/** The signed-in account if it's suspended (for the /suspended page). */
export async function getSuspendedAccount() {
  const u = await getSessionAccount();
  return u?.suspendedAt ? u : null;
}

/**
 * Signed-in user. Until they've given first name and surname (e.g. right after a Discord sign-up) they're sent to /welcome.
 * `next` is where to come back to after signing in or finishing the profile (a shared event link, say).
 */
export async function requireUser(opts?: { allowIncomplete?: boolean; next?: string }) {
  const u = await getCurrentUser();
  const back = opts?.next ? `?next=${encodeURIComponent(opts.next)}` : "";
  if (!u) redirect((await getSuspendedAccount()) ? "/suspended" : `/login${back}`);
  if (!opts?.allowIncomplete && !isProfileComplete(u)) redirect(`/welcome${back}`);
  return u;
}

export const isProfileComplete = (u: { firstName: string; lastName: string }) => !!(u.firstName && u.lastName);

/** Platform staff with a permission (see src/lib/platform-roles.ts); others go home. */
export async function requirePlatform(perm: PlatformPermission) {
  const u = await requireUser();
  if (!platformCan(u, perm)) redirect(isStaff(u) ? "/admin" : "/");
  return u;
}

/** Platform settings: owners and admins. */
export const requireAdmin = () => requirePlatform("settings");

/** For server actions: throws instead of redirecting. */
export async function assertPlatform(perm: PlatformPermission) {
  const u = await requireUser();
  if (!platformCan(u, perm)) {
    const { err } = await import("@/i18n/server");
    throw await err("errors.perm.platform");
  }
  return u;
}

/** Platform owners and admins, the clan's admins and event managers, and the LAN's leads may manage a LAN. */
export function isLanManager(u: { id: string; role: string }, lanId: string) {
  if (platformCan(u, "clans")) return true;
  const l = db.select({ clanId: schema.lan.clanId }).from(schema.lan).where(eq(schema.lan.id, lanId)).get();
  if (l?.clanId && clanCan(u, l.clanId, "events")) return true;
  if (isClanSuspended(l?.clanId)) return false;
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

/** Clan members (and platform staff, read-only) may see a LAN and answer for it. Drafts only show to its managers. */
export function canViewLan(u: { id: string; role: string }, lanId: string) {
  if (platformCan(u, "view")) return true;
  const l = db
    .select({ clanId: schema.lan.clanId, publishedAt: schema.lan.publishedAt })
    .from(schema.lan)
    .where(eq(schema.lan.id, lanId))
    .get();
  if (!l || isClanSuspended(l.clanId)) return false;
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
