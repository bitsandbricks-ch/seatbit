import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { auth } from "./auth";
import { db, schema } from "@/db";

export const getCurrentUser = cache(async () => {
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s) return null;
  // Read fresh from DB so role changes apply immediately.
  return (await db.query.user.findFirst({ where: eq(schema.user.id, s.user.id) })) ?? null;
});

export async function requireUser() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

export async function requireAdmin() {
  const u = await requireUser();
  if (u.role !== "admin") redirect("/");
  return u;
}
