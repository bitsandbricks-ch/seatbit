// Clan roles and what each may do. No database imports: client components use this too.

/** "pending" = asked to join, waiting for approval. */
export const CLAN_ROLES = ["admin", "organizer", "recruiter", "member", "pending"] as const;
export type ClanRole = (typeof CLAN_ROLES)[number];
/** Roles an admin can give someone who's in the clan. */
export const MEMBER_ROLES = ["admin", "organizer", "recruiter", "member"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

/**
 * settings: clan details, Discord, delete the clan. roles: give and take roles.
 * members: approve requests, add and remove members, guests, invite links.
 * events: create and run every clan event, LAN types. stats: the clan's stats page.
 * log: the clan's audit log.
 */
export const CLAN_PERMISSIONS = ["settings", "roles", "members", "events", "stats", "log"] as const;
export type ClanPermission = (typeof CLAN_PERMISSIONS)[number];

export const ROLE_INFO: Record<MemberRole, { label: string; description: string; perms: readonly ClanPermission[] }> = {
  admin: {
    label: "Admin",
    description: "Everything: clan settings, Discord, roles, members and every event.",
    perms: CLAN_PERMISSIONS,
  },
  organizer: {
    label: "Event manager",
    description: "Creates and runs every clan event and edits LAN types. Sees stats and the audit log.",
    perms: ["events", "stats", "log"],
  },
  recruiter: {
    label: "Recruiter",
    description: "Approves join requests, adds members and guests, manages invite links. Sees stats and the audit log.",
    perms: ["members", "stats", "log"],
  },
  member: {
    label: "Member",
    description: "Answers for events and sees the clan. Can still be a lead of single events.",
    perms: [],
  },
};

export function isMemberRole(role: string | null | undefined): role is MemberRole {
  return !!role && (MEMBER_ROLES as readonly string[]).includes(role);
}

export function roleCan(role: string | null | undefined, perm: ClanPermission) {
  return isMemberRole(role) && ROLE_INFO[role].perms.includes(perm);
}

/** Roles that carry a permission, for "who gets notified" queries. */
export const rolesWith = (perm: ClanPermission) => MEMBER_ROLES.filter((r) => ROLE_INFO[r].perms.includes(perm));

export const roleLabel = (role: string) => (isMemberRole(role) ? ROLE_INFO[role].label : role);

/** Manage tabs of the clan settings and the permission each needs. */
export const MANAGE_TAB_PERMS = {
  general: "settings",
  members: "members",
  guests: "members",
  types: "events",
  invites: "members",
  chat: "settings",
  log: "log",
} as const satisfies Record<string, ClanPermission>;

/** "an admin", "an event manager", "a recruiter": for sentences. */
export function roleWithArticle(role: string) {
  const l = roleLabel(role).toLowerCase();
  return `${/^[aeiou]/.test(l) ? "an" : "a"} ${l}`;
}
