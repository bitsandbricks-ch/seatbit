import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { count, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { claimGuestsByDiscord, claimGuestsByEmail } from "./guest-claim";
import { sendSystemMail } from "./system-mail";
import { localeOf } from "../i18n/user-locale";
import { getBoolSetting, getSetting, settingsFingerprint } from "./settings";

/** Settings that change how the auth instance is built; it is rebuilt when any of them change. */
const AUTH_KEYS = [
  "discord.clientId",
  "discord.clientSecret",
  "google.clientId",
  "google.clientSecret",
  "auth.signupOpen",
  "auth.trustedProxies",
];

function adminEmails() {
  return (getSetting("auth.adminEmails") ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Login methods Seatbit offers. Discord only for now (decided 2026-11-11). Google
 * and email/password still work in code: set them to true to bring them back.
 * ALLOW_EMAIL_LOGIN=1 turns email login on for local development and tests.
 */
export const LOGIN_METHODS = {
  discord: true,
  google: false,
  email: process.env.ALLOW_EMAIL_LOGIN === "1",
};

/** Which login methods are on and configured. */
export function enabledProviders() {
  return {
    discord: LOGIN_METHODS.discord && !!(getSetting("discord.clientId") && getSetting("discord.clientSecret")),
    google: LOGIN_METHODS.google && !!(getSetting("google.clientId") && getSetting("google.clientSecret")),
    email: LOGIN_METHODS.email,
  };
}

export function signupOpen() {
  return getBoolSetting("auth.signupOpen");
}

function build() {
  const providers = enabledProviders();
  const open = signupOpen();
  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    emailAndPassword: {
      enabled: LOGIN_METHODS.email,
      minPasswordLength: 8,
      disableSignUp: !open,
      sendResetPassword: async ({ user, url }) => {
        const u = user as typeof user & { firstName?: string; locale?: string | null };
        await sendSystemMail(user.email, "passwordReset", { firstName: u.firstName || user.name, link: url }, localeOf(u));
      },
    },
    socialProviders: {
      ...(providers.discord && {
        discord: {
          clientId: getSetting("discord.clientId")!,
          clientSecret: getSetting("discord.clientSecret")!,
          // Discord asks for "identify" and "email" by default; the email is used for reminders.
          disableImplicitSignUp: !open,
        },
      }),
      ...(providers.google && {
        google: {
          clientId: getSetting("google.clientId")!,
          clientSecret: getSetting("google.clientSecret")!,
          mapProfileToUser: (p) => ({ firstName: p.given_name ?? "", lastName: p.family_name ?? "" }),
          disableImplicitSignUp: !open,
        },
      }),
    },
    account: {
      accountLinking: { enabled: true, trustedProviders: ["discord", "google"] },
    },
    user: {
      additionalFields: {
        role: { type: "string", defaultValue: "member", input: false },
        emailReminders: { type: "boolean", defaultValue: true, input: false },
        firstName: { type: "string", defaultValue: "", required: false },
        lastName: { type: "string", defaultValue: "", required: false },
      },
    },
    databaseHooks: {
      account: {
        create: {
          // Linking Discord on the profile later counts too.
          after: async (a) => {
            if (a.providerId !== "discord") return;
            try {
              claimGuestsByDiscord(a.userId);
            } catch (e) {
              console.error("[guests] Discord auto-claim failed", e);
            }
          },
        },
      },
      session: {
        create: {
          // Signing in with a verified email takes over guests the leads invited with that address,
          // and a linked Discord account the guests a lead tied to that Discord user via the bot.
          after: async (session) => {
            try {
              claimGuestsByEmail(session.userId);
              claimGuestsByDiscord(session.userId);
            } catch (e) {
              console.error("[guests] auto-claim failed", e);
            }
          },
        },
      },
      user: {
        create: {
          // The first user, and anyone listed in the admin emails setting, becomes an owner.
          before: async (u) => {
            // Deleted accounts don't count, so a fresh start after everyone left still gets an admin.
            const [{ n }] = await db.select({ n: count() }).from(schema.user).where(isNull(schema.user.deletedAt));
            const isAdmin = n === 0 || adminEmails().includes(u.email.toLowerCase());
            return { data: { ...u, role: isAdmin ? "owner" : "member" } };
          },
        },
      },
    },
    // Login and sign-up rate limits per visitor. Behind a reverse proxy the visitor is the first
    // X-Forwarded-For entry (from the right) that isn't one of the trusted proxies.
    rateLimit: { enabled: process.env.NODE_ENV === "production" },
    advanced: {
      ipAddress: {
        ipAddressHeaders: ["x-forwarded-for"],
        trustedProxies: (getSetting("auth.trustedProxies") ?? "")
          .split(",")
          .map((e) => e.trim())
          .filter(Boolean),
      },
    },
    plugins: [nextCookies()],
  });
}

export type Auth = ReturnType<typeof build>;
const g = globalThis as unknown as { __seatbitAuth?: { fp: string; auth: Auth } };

/**
 * The Better Auth instance for the current settings. OAuth providers are fixed
 * when Better Auth is created, so a new instance is built whenever an admin
 * changes provider credentials or the sign-up switch.
 */
export function getAuth(): Auth {
  const fp = settingsFingerprint(AUTH_KEYS);
  if (g.__seatbitAuth?.fp !== fp) g.__seatbitAuth = { fp, auth: build() };
  return g.__seatbitAuth.auth;
}
