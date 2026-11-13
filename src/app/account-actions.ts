"use server";
import { tr } from "@/i18n/server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { checkDeletion, deleteAccount } from "@/lib/account";
import { getAuth } from "@/lib/auth";
import { requireUser } from "@/lib/session";

export type DeleteState = { error?: string } | undefined;

/** "Delete my account" on the profile. Needs DELETE typed in; signs out and goes to the start page. */
export async function deleteMyAccount(_: DeleteState, formData: FormData): Promise<DeleteState> {
  const me = await requireUser({ allowIncomplete: true });
  if (String(formData.get("confirm") ?? "").trim().toUpperCase() !== "DELETE") return { error: await tr("errors.typeDelete") };
  const check = checkDeletion(me.id);
  if (check.blockingClans.length)
    return { error: await tr("errors.onlyAdminOf", { clans: check.blockingClans.map((c) => c.name).join(", ") }) };
  if (check.lastPlatformAdmin) return { error: await tr("errors.onlyPlatformAdmin") };
  // Sign out first so the session cookie is cleared, then remove everything.
  await getAuth()
    .api.signOut({ headers: await headers() })
    .catch(() => {});
  try {
    await deleteAccount(me.id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Deleting failed." };
  }
  redirect("/login?deleted=1");
}
