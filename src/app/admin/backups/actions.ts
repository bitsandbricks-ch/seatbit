"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { BackupError, createBackup, deleteBackup } from "@/lib/backup";
import { drillEnabled, testRestore } from "@/lib/backup-drill";
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
    // Test it right away, so the page shows the result (the scheduler would within a minute).
    const r = drillEnabled() ? await testRestore(f.name).catch(() => null) : null;
    revalidatePath("/admin/backups");
    if (r && !r.ok) return done(false, t("backups.drill.failedNow", { name: f.name, error: r.error ?? "" }));
    return done(true, t(r?.ok ? "backups.createdTested" : "backups.created", { name: f.name }));
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

/** Restore test of the newest backup, on demand (e.g. for backups a cron job wrote). */
export async function testNewestBackup(): Promise<ActionResult> {
  await requirePlatform("owner");
  const t = await getT();
  try {
    const r = await testRestore();
    revalidatePath("/admin/backups");
    return r.ok
      ? done(true, t("backups.drill.passedNow", { name: r.name, tables: r.tables ?? 0, rows: r.rows ?? 0 }))
      : done(false, t("backups.drill.failedNow", { name: r.name, error: r.error ?? "" }));
  } catch (e) {
    return done(false, t("backups.drill.failedNow", { name: "–", error: e instanceof Error ? e.message : String(e) }));
  }
}
