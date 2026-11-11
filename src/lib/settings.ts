/**
 * Platform settings that global admins can edit at /admin/settings.
 *
 * Each setting resolves in this order: value saved in the database, then the
 * matching environment variable, then the built-in default. So an install that
 * is configured purely through env vars keeps working, and anything set in the
 * admin UI takes precedence.
 *
 * Secret settings (passwords, client secrets, bot tokens) are encrypted with
 * AES-256-GCM before they are written. The key comes from SETTINGS_ENCRYPTION_KEY,
 * or is derived from BETTER_AUTH_SECRET when that is not set. Secrets are never
 * sent to the browser: the admin page only sees whether one is set and its last
 * four characters.
 *
 * No "server-only" import and relative imports only, so scripts run with tsx
 * (e.g. `npm run discord:register`) can read settings too.
 */
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "../db";

const { appSetting } = schema;

export type SettingKind = "text" | "number" | "bool" | "select" | "secret" | "list";

export interface SettingDef {
  key: string;
  group: SettingGroup;
  label: string;
  kind: SettingKind;
  /** Environment variable used when nothing is saved in the database. */
  env?: string;
  default?: string;
  help?: string;
  placeholder?: string;
  options?: { value: string; label: string }[];
  /** Returns an error message when the value is invalid. */
  validate?: (v: string) => string | null;
}

export const SETTING_GROUPS = {
  general: { title: "General", help: "Who can sign up and who is a global admin." },
  mail: {
    title: "Email (SMTP relay)",
    help: "Used for reminders and password resets. Without a host, mails are only printed to the server log.",
  },
  discord: {
    title: "Discord",
    help: "One Discord application is used for both the login button and the bot.",
  },
  google: { title: "Google login", help: "OAuth client for the \"Sign in with Google\" button." },
  automation: { title: "Reminders & cron", help: "How due reminders are triggered." },
} as const;
export type SettingGroup = keyof typeof SETTING_GROUPS;

const isInt = (min: number, max: number) => (v: string) =>
  /^\d+$/.test(v) && +v >= min && +v <= max ? null : `Must be a whole number from ${min} to ${max}`;
const isSnowflake = (v: string) => (/^\d{15,22}$/.test(v) ? null : "Discord ids are 15 to 22 digits");

export const SETTINGS: SettingDef[] = [
  // General
  {
    key: "auth.signupOpen",
    group: "general",
    label: "Allow new accounts",
    kind: "bool",
    env: "SIGNUP_OPEN",
    default: "true",
    help: "When off, only existing members can sign in (with email, Discord or Google).",
  },
  {
    key: "auth.adminEmails",
    group: "general",
    label: "Admin emails",
    kind: "list",
    env: "ADMIN_EMAILS",
    placeholder: "mike@example.com, anna@example.com",
    help: "Comma-separated. These become global admins when they sign up. The first account is always admin.",
    validate: (v) =>
      v
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean)
        .every((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
        ? null
        : "Use a comma-separated list of email addresses",
  },

  // Mail
  { key: "smtp.host", group: "mail", label: "SMTP host", kind: "text", env: "SMTP_HOST", placeholder: "smtp.example.com" },
  {
    key: "smtp.port",
    group: "mail",
    label: "Port",
    kind: "number",
    env: "SMTP_PORT",
    default: "587",
    validate: isInt(1, 65535),
  },
  {
    key: "smtp.security",
    group: "mail",
    label: "Encryption",
    kind: "select",
    env: "SMTP_SECURITY",
    default: "starttls",
    options: [
      { value: "starttls", label: "STARTTLS (usually port 587)" },
      { value: "tls", label: "TLS / SMTPS (usually port 465)" },
      { value: "none", label: "None (local relays only)" },
    ],
  },
  { key: "smtp.user", group: "mail", label: "Username", kind: "text", env: "SMTP_USER" },
  { key: "smtp.password", group: "mail", label: "Password", kind: "secret", env: "SMTP_PASSWORD" },
  {
    key: "mail.from",
    group: "mail",
    label: "Sender",
    kind: "text",
    env: "MAIL_FROM",
    default: "Seatbit <noreply@localhost>",
    placeholder: "Seatbit <lan@example.com>",
  },

  // Discord
  {
    key: "discord.clientId",
    group: "discord",
    label: "Application (client) ID",
    kind: "text",
    env: "DISCORD_CLIENT_ID",
    validate: isSnowflake,
  },
  {
    key: "discord.clientSecret",
    group: "discord",
    label: "OAuth2 client secret",
    kind: "secret",
    env: "DISCORD_CLIENT_SECRET",
    help: "Login with Discord is enabled when the client ID and secret are set.",
  },
  {
    key: "discord.botToken",
    group: "discord",
    label: "Bot token",
    kind: "secret",
    env: "DISCORD_BOT_TOKEN",
    help: "Developer portal → Bot → Reset Token.",
  },
  {
    key: "discord.publicKey",
    group: "discord",
    label: "Public key",
    kind: "text",
    env: "DISCORD_PUBLIC_KEY",
    help: "Developer portal → General Information. Used to verify button clicks and slash commands.",
    validate: (v) => (/^[0-9a-f]{64}$/i.test(v) ? null : "The public key is 64 hex characters"),
  },

  // Google
  { key: "google.clientId", group: "google", label: "Client ID", kind: "text", env: "GOOGLE_CLIENT_ID" },
  { key: "google.clientSecret", group: "google", label: "Client secret", kind: "secret", env: "GOOGLE_CLIENT_SECRET" },

  // Automation
  {
    key: "reminders.intervalMinutes",
    group: "automation",
    label: "Reminder check interval (minutes)",
    kind: "number",
    env: "REMINDER_INTERVAL_MINUTES",
    default: "60",
    help: "How often the server checks for due reminders. 0 turns the built-in check off (use the cron URL instead).",
    validate: isInt(0, 1440),
  },
  {
    key: "cron.secret",
    group: "automation",
    label: "Cron secret",
    kind: "secret",
    env: "CRON_SECRET",
    help: "Bearer token for GET /api/cron/reminders. Leave unset to disable the endpoint.",
  },
];

const defs = new Map(SETTINGS.map((d) => [d.key, d]));
export function settingDef(key: string) {
  const d = defs.get(key);
  if (!d) throw new Error(`Unknown setting ${key}`);
  return d;
}

// ---------- Encryption ----------

const DEV_FALLBACK = "seatbit-dev-only-settings-key";

function encryptionKey(): Buffer | null {
  const raw = process.env.SETTINGS_ENCRYPTION_KEY || process.env.BETTER_AUTH_SECRET;
  if (!raw) {
    if (process.env.NODE_ENV === "production") return null;
    return Buffer.from(crypto.hkdfSync("sha256", DEV_FALLBACK, "", "seatbit-settings-v1", 32));
  }
  return Buffer.from(crypto.hkdfSync("sha256", raw, "seatbit", "seatbit-settings-v1", 32));
}

export function canEncrypt() {
  return encryptionKey() !== null;
}

function encrypt(plain: string): string {
  const key = encryptionKey();
  if (!key) throw new Error("Set SETTINGS_ENCRYPTION_KEY or BETTER_AUTH_SECRET before saving secrets");
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), ct.toString("base64")].join(":");
}

/** Returns null when the value can't be decrypted (e.g. the key changed). */
function decrypt(stored: string): string | null {
  const key = encryptionKey();
  const [v, iv, tag, ct] = stored.split(":");
  if (!key || v !== "v1" || !iv || !tag || ct === undefined) return null;
  try {
    const d = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(ct, "base64")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

// ---------- Reading ----------

type Row = typeof appSetting.$inferSelect;
type Cache = { at: number; rows: Map<string, Row> };

// Shared across module instances (route handlers, server actions, instrumentation)
// and refreshed every few seconds so a change made in one place shows up everywhere.
const g = globalThis as unknown as { __seatbitSettings?: Cache };
const TTL = 5_000;

function rows(): Map<string, Row> {
  const c = g.__seatbitSettings;
  if (c && Date.now() - c.at < TTL) return c.rows;
  const all = db.select().from(appSetting).all();
  g.__seatbitSettings = { at: Date.now(), rows: new Map(all.map((r) => [r.key, r])) };
  return g.__seatbitSettings.rows;
}

function invalidate() {
  g.__seatbitSettings = undefined;
}

export type SettingSource = "database" | "env" | "default" | "unset";

/** Where a setting's effective value comes from, plus the value itself (server-side only). */
export function resolveSetting(key: string): { value: string | undefined; source: SettingSource; undecryptable?: boolean } {
  const d = settingDef(key);
  const row = rows().get(key);
  if (row) {
    const v = row.encrypted ? decrypt(row.value) : row.value;
    if (v !== null) return { value: v, source: "database" };
    // Can't decrypt: fall through to env so the app keeps working, but flag it.
    const rest = fromEnv(d);
    return { ...rest, undecryptable: true };
  }
  return fromEnv(d);
}

function fromEnv(d: SettingDef): { value: string | undefined; source: SettingSource } {
  const e = d.env ? process.env[d.env] : undefined;
  if (e !== undefined && e !== "") return { value: e, source: "env" };
  if (d.default !== undefined) return { value: d.default, source: "default" };
  return { value: undefined, source: "unset" };
}

/** The effective value of a setting, or undefined. */
export function getSetting(key: string): string | undefined {
  return resolveSetting(key).value;
}

export function getBoolSetting(key: string): boolean {
  const v = (getSetting(key) ?? "").toLowerCase();
  return v === "true" || v === "1" || v === "yes" || v === "on";
}

export function getNumberSetting(key: string): number | undefined {
  const v = getSetting(key);
  if (v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** A short fingerprint of some settings, to rebuild things (auth, SMTP transport) only when they change. */
export function settingsFingerprint(keys: string[]): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(keys.map((k) => getSetting(k) ?? null)))
    .digest("base64url");
}

// ---------- Admin view ----------

export interface SettingView {
  key: string;
  group: SettingGroup;
  label: string;
  kind: SettingKind;
  env?: string;
  help?: string;
  placeholder?: string;
  options?: { value: string; label: string }[];
  source: SettingSource;
  /** Value saved in the database (never set for secrets). */
  saved?: string;
  /** Effective value when it comes from env/default (never set for secrets). */
  fallback?: string;
  /** For secrets: whether a value is set and its last 4 characters. */
  secretSet?: boolean;
  secretHint?: string;
  undecryptable?: boolean;
  updatedAt?: number;
  updatedBy?: string | null;
}

const hint = (v: string) => (v.length >= 12 ? `…${v.slice(-4)}` : "");

/** Everything the admin page needs, with secrets reduced to set/unset and a short hint. */
export function settingsForAdmin(): SettingView[] {
  const users = new Map(db.select({ id: schema.user.id, name: schema.user.name }).from(schema.user).all().map((u) => [u.id, u.name]));
  return SETTINGS.map((d) => {
    const r = resolveSetting(d.key);
    const row = rows().get(d.key);
    const view: SettingView = {
      key: d.key,
      group: d.group,
      label: d.label,
      kind: d.kind,
      env: d.env,
      help: d.help,
      placeholder: d.placeholder,
      options: d.options,
      source: r.source,
      undecryptable: r.undecryptable,
      updatedAt: row?.updatedAt.getTime(),
      updatedBy: row?.updatedBy ? (users.get(row.updatedBy) ?? null) : null,
    };
    if (d.kind === "secret") {
      view.secretSet = r.value !== undefined && r.value !== "";
      view.secretHint = r.value ? hint(r.value) : undefined;
    } else if (r.source === "database") {
      view.saved = r.value;
      const f = fromEnv(d);
      view.fallback = f.value;
    } else {
      view.fallback = r.value;
    }
    return view;
  });
}

// ---------- Writing ----------

/** Returns an error message when the value isn't valid for the setting. */
export function checkSetting(key: string, value: string): string | null {
  const d = settingDef(key);
  const v = value.trim();
  if (v.length > 4096) return `${d.label}: too long`;
  if (d.kind === "select" && !d.options?.some((o) => o.value === v)) return `${d.label}: invalid choice`;
  if (d.kind === "bool" && v !== "true" && v !== "false") return `${d.label}: invalid choice`;
  const err = d.validate?.(v);
  return err ? `${d.label}: ${err}` : null;
}

/** Saves a setting to the database, encrypting secrets. Validates first. */
export function setSetting(key: string, value: string, userId: string | null) {
  const d = settingDef(key);
  const v = value.trim();
  const err = checkSetting(key, v);
  if (err) throw new SettingError(err);
  const secret = d.kind === "secret";
  const stored = secret ? encrypt(v) : v;
  db.insert(appSetting)
    .values({ key, value: stored, encrypted: secret, updatedBy: userId, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appSetting.key,
      set: { value: stored, encrypted: secret, updatedBy: userId, updatedAt: new Date() },
    })
    .run();
  invalidate();
}

/** Removes the database value, so the setting falls back to its env var / default. */
export function clearSetting(key: string) {
  settingDef(key);
  db.delete(appSetting).where(eq(appSetting.key, key)).run();
  invalidate();
}

export class SettingError extends Error {}
