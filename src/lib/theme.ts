// Shared by server and client code: no server-only imports here.

export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

/** Per browser, so a phone can stay dark while the office PC is light. Read by the root layout to avoid a flash. */
export const THEME_COOKIE = "seatbit-theme";

export const isTheme = (v: unknown): v is Theme => typeof v === "string" && (THEMES as readonly string[]).includes(v);

/** Page background per theme, for the browser's toolbar colour. Same values as brand/tokens.css. */
export const THEME_COLORS = { dark: "#0b0b0f", light: "#f5f5f7" } as const;
