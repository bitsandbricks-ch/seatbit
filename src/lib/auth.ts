import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { count } from "drizzle-orm";
import { db, schema } from "@/db";
import { sendMail } from "./mail";
import { getBoolSetting, getSetting, settingsFingerprint } from "./settings";

/** Settings that change how the auth instance is built; it is rebuilt when any of them change. */
const AUTH_KEYS = [
  "discord.clientId",
  "discord.clientSecret",
  "google.clientId",
  "google.clientSecret",
  "auth.signupOpen",
];

function adminEmails() {
  return (getSetting("auth.adminEmails") ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** Which social login buttons to show. */
export function enabledProviders() {
  return {
    discord: !!(getSetting("discord.clientId") && getSetting("discord.clientSecret")),
    google: !!(getSetting("google.clientId") && getSetting("google.clientSecret")),
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
      enabled: true,
      minPasswordLength: 8,
      disableSignUp: !open,
      sendResetPassword: async ({ user, url }) => {
        await sendMail(
          user.email,
          "Reset your password",
          `Hi ${user.name},\n\nreset your password here:\n${url}\n\nIf you didn't ask for this, ignore this mail.`,
        );
      },
    },
    socialProviders: {
      ...(providers.discord && {
        discord: {
          clientId: getSetting("discord.clientId")!,
          clientSecret: getSetting("discord.clientSecret")!,
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
      user: {
        create: {
          // The first user, and anyone listed in the admin emails setting, becomes an admin.
          before: async (u) => {
            const [{ n }] = await db.select({ n: count() }).from(schema.user);
            const isAdmin = n === 0 || adminEmails().includes(u.email.toLowerCase());
            return { data: { ...u, role: isAdmin ? "admin" : "member" } };
          },
        },
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
