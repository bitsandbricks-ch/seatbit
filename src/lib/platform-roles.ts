// Platform roles (instance staff) and what each may do. No database imports: client components use this too.
// Stored in user.role; everyone who isn't staff is "member".

export const PLATFORM_ROLES = ["owner", "admin", "moderator", "support", "member"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];
/** Roles with access to the admin area. */
export const STAFF_ROLES = ["owner", "admin", "moderator", "support"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/**
 * view: the admin area read-only (users, clans, events, audit log) and every clan and event, read-only.
 * settings: platform settings and mail templates. owner: billing and legal settings, the owner role.
 * roles: give and take platform roles. clans: manage any clan and event like their admins.
 * reports: the abuse report queue. suspend: suspend and restore users and clans.
 */
export const PLATFORM_PERMISSIONS = ["view", "settings", "owner", "roles", "clans", "reports", "suspend"] as const;
export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];

export const PLATFORM_ROLE_PERMS: Record<StaffRole, readonly PlatformPermission[]> = {
  owner: PLATFORM_PERMISSIONS,
  admin: ["view", "settings", "roles", "clans", "reports", "suspend"],
  moderator: ["view", "reports", "suspend"],
  support: ["view"],
};

/** Settings groups only owners may see and change (backups hold everyone's data). */
export const OWNER_SETTING_GROUPS: readonly string[] = ["billing", "legal", "backup"];

export function isPlatformRole(r: string | null | undefined): r is PlatformRole {
  return !!r && (PLATFORM_ROLES as readonly string[]).includes(r);
}

export function isStaff(u: { role: string } | null | undefined): boolean {
  return !!u && (STAFF_ROLES as readonly string[]).includes(u.role);
}

export function platformCan(u: { role: string } | null | undefined, perm: PlatformPermission): boolean {
  if (!u || !isStaff(u)) return false;
  return PLATFORM_ROLE_PERMS[u.role as StaffRole].includes(perm);
}

const RANK: Record<PlatformRole, number> = { owner: 4, admin: 3, moderator: 2, support: 1, member: 0 };
export const roleRank = (r: string) => (isPlatformRole(r) ? RANK[r] : 0);

/**
 * Roles `me` may give. Owners give any role; admins give moderator and support (and take them away),
 * but can't touch owners or other admins.
 */
export function assignableRoles(me: { role: string }): PlatformRole[] {
  if (!platformCan(me, "roles")) return [];
  if (me.role === "owner") return [...PLATFORM_ROLES];
  return PLATFORM_ROLES.filter((r) => roleRank(r) < roleRank(me.role));
}

/** May `me` change `target`'s role (to `to`, if given)? Nobody changes their own role here. */
export function canSetRole(me: { id: string; role: string }, target: { id: string; role: string }, to?: string) {
  if (me.id === target.id) return false;
  const can = assignableRoles(me);
  if (!can.includes(target.role as PlatformRole)) return false;
  return to === undefined || can.includes(to as PlatformRole);
}

/** Staff can't act against someone with the same or a higher role (moderators can't suspend admins). */
export const outranks = (me: { role: string }, target: { role: string }) => roleRank(me.role) > roleRank(target.role);
