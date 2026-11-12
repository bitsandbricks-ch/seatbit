"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { checkDeletion, deleteAccount } from "@/lib/account";
import { getAuth } from "@/lib/auth";
import { requireUser } from "@/lib/session";

export type DeleteState = { error?: string } | undefined;

/** "Delete my account" on the profile. Needs DELETE typed in; signs out and goes to the start page. */
export async function deleteMyAccount(_: DeleteState, formData: FormData): Promise<DeleteState> {
  const me = await requireUser({ allowIncomplete: true });
  if (String(formData.get("confirm") ?? "").trim().toUpperCase() !== "DELETE") return { error: "Type DELETE to confirm." };
  const check = checkDeletion(me.id);
  if (check.blockingClans.length)
    return { error: `You're the only admin of ${check.blockingClans.map((c) => c.name).join(", ")}. Make someone else admin first.` };
  if (check.lastPlatformAdmin) return { error: "You're the only platform admin. Make someone else platform admin first." };
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
