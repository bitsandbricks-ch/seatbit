"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { BackupError, createBackup, deleteBackup } from "@/lib/backup";
import { requirePlatform } from "@/lib/session";
import { getT } from "@/i18n/server";
import type { ActionResult } from "../settings/actions";

const done = (ok: boolean, message: string): ActionResult => ({ ok, message, at: Date.now() });

export async function backupNow(): Promise<ActionResult> {
  const me = await requirePlatform("owner");
  const t = await getT();
  try {
    const f = await createBackup();
    audit({ actorId: me.id, action: "backup.create", data: { file: f.name } });
    revalidatePath("/admin/backups");
    return done(true, t("backups.created", { name: f.name }));
  } catch (e) {
    const error = e instanceof BackupError ? t(e.key, e.vars) : e instanceof Error ? e.message : String(e);
    return done(false, t("backups.failed", { error }));
  }
}

export async function removeBackup(name: string): Promise<ActionResult> {
  const me = await requirePlatform("owner");
  const t = await getT();
  if (!deleteBackup(name)) return done(false, t("backups.notFound"));
  audit({ actorId: me.id, action: "backup.delete", data: { file: name } });
  revalidatePath("/admin/backups");
  return done(true, t("backups.deleted", { name }));
}
