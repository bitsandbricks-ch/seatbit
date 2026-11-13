"use server";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { LOCALE_COOKIE, isLocale } from "@/i18n/config";
import { getCurrentUser } from "@/lib/session";

/** Pick the app language, or "auto" to follow the browser. Saved on the profile when signed in. */
export async function setLocale(value: string) {
  const locale = isLocale(value) ? value : null;
  const jar = await cookies();
  if (locale) jar.set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  else jar.delete(LOCALE_COOKIE);
  const me = await getCurrentUser();
  if (me) db.update(schema.user).set({ locale }).where(eq(schema.user.id, me.id)).run();
  revalidatePath("/", "layout");
}
