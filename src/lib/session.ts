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

/** Signed-in user. Until they've given first name and surname (e.g. right after a Discord sign-up) they're sent to /welcome. */
export async function requireUser(opts?: { allowIncomplete?: boolean }) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (!opts?.allowIncomplete && !isProfileComplete(u)) redirect("/welcome");
  return u;
}

export const isProfileComplete = (u: { firstName: string; lastName: string }) => !!(u.firstName && u.lastName);

export async function requireAdmin() {
  const u = await requireUser();
  if (u.role !== "admin") redirect("/");
  return u;
}

/** Platform admins, the clan's admins and event managers, and the LAN's orgas may manage a LAN. */
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
  if (!isLanManager(u, lanId)) throw new Error("Only orgas of this LAN can do that");
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

const PERM_ERROR: Record<ClanPermission, string> = {
  settings: "Only clan admins can do that",
  roles: "Only clan admins can change roles",
  members: "Only clan admins and recruiters can do that",
  events: "Only clan admins and event managers can do that",
  stats: "You can't see this clan's stats",
  log: "You can't see this clan's audit log",
};

export async function requireClanPermission(clanId: string, perm: ClanPermission) {
  const u = await requireUser();
  if (!clanCan(u, clanId, perm)) throw new Error(PERM_ERROR[perm]);
  return u;
}
