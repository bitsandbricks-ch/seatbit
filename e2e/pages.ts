/** The demo pages each kind of user can open, shared by the smoke and accessibility tests. */
export const LAN = "demo-lan-lakeside";
export const CLAN = "/clans/pixel-pirates";

export const MEMBER_PAGES = [
  "/",
  "/clans",
  CLAN,
  `${CLAN}/stats`,
  `${CLAN}/members/demo-ben`,
  `/lans/${LAN}`,
  // Tabs switch on the client, so each one is loaded once to check what it shows.
  ...["seats", "attendees", "trip", "travel", "gear", "games", "costs"].map((t) => `/lans/${LAN}?tab=${t}`),
  "/lans/demo-lan-mountain",
  "/lans/demo-lan-retro",
  "/profile",
  "/changelog",
  "/terms",
  "/privacy",
];

// Someone who just signed up and isn't in any clan yet: the empty states.
export const NEWCOMER_PAGES = ["/", "/clans", "/profile", ...["notifications", "data"].map((t) => `/profile?tab=${t}`), "/changelog", "/donate"];

export const LEAD_PAGES = [
  `/lans/${LAN}/manage`,
  ...["seats", "attendees", "missing", "emergency", "chat", "settings"].map((t) => `/lans/${LAN}/manage?tab=${t}`),
  "/lans/demo-lan-lakeside-next/manage",
  `${CLAN}/settings`,
  `${CLAN}/lans/new`,
  `${CLAN}/lans/new?type=demo-type-lakeside`,
  `${CLAN}/types/demo-type-lakeside`,
  `${CLAN}/payments/new`,
  `${CLAN}/payments/demo-charge-dues`,
];

export const ADMIN_PAGES = [
  "/admin",
  "/admin/reports",
  "/admin/stats",
  "/admin/health",
  "/admin/log",
  "/admin/backups",
  "/admin/types",
  "/admin/types/new",
  "/admin/types/demo-type-lakeside",
  `/admin/lans/${LAN}`,
  "/admin/users",
  "/admin/users/demo-ben",
  ...["mail", "discord", "general", "automation", "maintenance", "legal", "billing", "connect", "templates", "server"].map(
    (t) => `/admin/settings?tab=${t}`,
  ),
];
