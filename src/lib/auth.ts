import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { count } from "drizzle-orm";
import { db, schema } from "@/db";
import { sendMail } from "./mail";

const adminEmails = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export const enabledProviders = {
  discord: !!(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET),
  google: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
};

export const auth = betterAuth({
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
    sendResetPassword: async ({ user, url }) => {
      await sendMail(
        user.email,
        "Reset your password",
        `Hi ${user.name},\n\nreset your password here:\n${url}\n\nIf you didn't ask for this, ignore this mail.`,
      );
    },
  },
  socialProviders: {
    ...(enabledProviders.discord && {
      discord: {
        clientId: process.env.DISCORD_CLIENT_ID!,
        clientSecret: process.env.DISCORD_CLIENT_SECRET!,
      },
    }),
    ...(enabledProviders.google && {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
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
    },
  },
  databaseHooks: {
    user: {
      create: {
        // The first user, and anyone listed in ADMIN_EMAILS, becomes an admin.
        before: async (u) => {
          const [{ n }] = await db.select({ n: count() }).from(schema.user);
          const isAdmin = n === 0 || adminEmails.includes(u.email.toLowerCase());
          return { data: { ...u, role: isAdmin ? "admin" : "member" } };
        },
      },
    },
  },
  plugins: [nextCookies()],
});
