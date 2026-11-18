/**
 * Off-site copies of the backups: each new backup is encrypted with age (https://age-encryption.org)
 * for the public key from the settings and uploaded to an S3-compatible bucket as
 * `<prefix>seatbit-YYYYMMDD-HHMMSS.db.age`.
 *
 * The server only has the public key, so it can write copies but never read them back: someone
 * who gets the bucket (or the server) can't open old copies without the private key, which the
 * operator keeps elsewhere. `node scripts/restore.mjs` fetches and decrypts them; so does the
 * plain age tool (`age -d -i key.txt`).
 *
 * The local backups stay as they are (plain SQLite files on the backup volume, next to the live
 * database): the restore test and quick restores use them. The scheduler (src/instrumentation.ts)
 * uploads the newest local backup once, whoever made it (the app or a cron job).
 */
import fs from "node:fs";
import { type OffsiteConfig, listRemote, pruneRemote, uploadEncrypted } from "./backup-s3";
import { backupKeepDays, backupPath, listBackups } from "./backup";
import { runJob } from "./jobs";
import { reportError } from "./ops";
import { getNumberSetting, getSetting, readState, rememberState } from "./settings";

export type { OffsiteConfig };

export type OffsiteResult = {
  /** Local backup file name. */
  name: string;
  /** ISO time the upload ran. */
  at: string;
  /** ISO time the backup was written. */
  backupAt?: string;
  ok: boolean;
  ms: number;
  error?: string;
  /** Encrypted size in bytes. */
  size?: number;
  /** Copies in the bucket after pruning, and their size together. */
  remote?: number;
  remoteBytes?: number;
  pruned?: number;
  /** The last upload that worked (this one or an earlier one): when, and when its backup was written. */
  okAt?: string;
  okBackupAt?: string;
};


const STATE = "state.backup.offsite";
const RETRY_MS = 3600_000;

/** The settings for off-site copies: null when off (no bucket), the env names of what is missing, or the config. */
export function offsiteConfig(): OffsiteConfig | { missing: string[] } | null {
  const bucket = getSetting("backup.s3Bucket") ?? "";
  if (!bucket) return null;
  const c: OffsiteConfig = {
    endpoint: (getSetting("backup.s3Endpoint") ?? "").replace(/\/+$/, ""),
    bucket,
    region: getSetting("backup.s3Region") || "us-east-1",
    prefix: getSetting("backup.s3Prefix") ?? "",
    publicKey: getSetting("backup.publicKey") ?? "",
    accessKey: getSetting("backup.s3AccessKey") ?? "",
    secretKey: getSetting("backup.s3SecretKey") ?? "",
  };
  const missing = (
    [
      ["endpoint", "BACKUP_S3_ENDPOINT"],
      ["publicKey", "BACKUP_PUBLIC_KEY"],
      ["accessKey", "BACKUP_S3_ACCESS_KEY"],
      ["secretKey", "BACKUP_S3_SECRET_KEY"],
    ] as const
  )
    .filter(([k]) => !c[k])
    .map(([, env]) => env);
  return missing.length ? { missing } : c;
}

export const offsiteKeepDays = () => getNumberSetting("backup.s3KeepDays") ?? 30;

/** How long backups exist anywhere, for the privacy policy: the longer retention, 0 when either keeps all. */
export function backupRetentionDays(): number {
  const local = backupKeepDays();
  if (!offsiteConfig()) return local;
  const remote = offsiteKeepDays();
  return local > 0 && remote > 0 ? Math.max(local, remote) : 0;
}

export function lastOffsite(): OffsiteResult | null {
  try {
    const raw = readState(STATE);
    return raw ? (JSON.parse(raw) as OffsiteResult) : null;
  } catch {
    return null;
  }
}

const g = globalThis as unknown as { __seatbitOffsite?: { job?: Promise<OffsiteResult>; failedAt?: Record<string, number> } };
const state = () => (g.__seatbitOffsite ??= {});

/** Uploads one local backup (newest when no name is given), stores and returns the result. One at a time. */
export function uploadBackup(name = listBackups()[0]?.name): Promise<OffsiteResult> {
  const s = state();
  if (s.job) return s.job;
  const c = offsiteConfig();
  if (!c) return Promise.reject(new Error("Off-site copies aren't set up (no bucket)"));
  if ("missing" in c) return Promise.reject(new Error(`Off-site copies need ${c.missing.join(", ")}`));
  if (!name) return Promise.reject(new Error("No backup to upload yet"));
  s.job = runJob("backup-offsite", async () => {
    const started = Date.now();
    const r: OffsiteResult = { name, at: new Date().toISOString(), ok: false, ms: 0 };
    try {
      const file = backupPath(name);
      if (!file) throw new Error(`No backup named ${name}`);
      r.backupAt = fs.statSync(file).mtime.toISOString();
      r.size = await uploadEncrypted(c, file, `${c.prefix}${name}.age`);
      const before = await listRemote(c);
      const kept = await pruneRemote(c, before, offsiteKeepDays());
      r.pruned = before.length - kept.length;
      r.remote = kept.length;
      r.remoteBytes = kept.reduce((n, x) => n + x.size, 0);
      r.ok = true;
    } catch (e) {
      r.error = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    }
    r.ms = Date.now() - started;
    const prev = lastOffsite();
    r.okAt = r.ok ? r.at : prev?.okAt;
    r.okBackupAt = r.ok ? r.backupAt : prev?.okBackupAt;
    rememberState(STATE, JSON.stringify(r));
    if (r.ok) {
      console.log(`[backup] uploaded ${name}.age (${r.size} bytes, ${r.ms} ms); ${r.remote} off-site copies`);
      return r;
    }
    (s.failedAt ??= {})[name] = Date.now();
    console.error(`[backup] off-site upload of ${name} failed: ${r.error}`);
    const err = new Error(`Off-site upload of ${name} failed: ${r.error}`);
    reportError("backup-offsite", err);
    throw Object.assign(err, { result: r });
  })
    .catch((e: unknown) => {
      const r = (e as { result?: OffsiteResult }).result;
      if (r) return r;
      throw e;
    })
    .finally(() => {
      s.job = undefined;
    });
  return s.job;
}

/**
 * Called every minute by the scheduler: uploads the newest local backup once. A failed upload is
 * retried after an hour, or when a newer backup comes.
 */
export async function runScheduledOffsite() {
  const c = offsiteConfig();
  if (!c || "missing" in c) return;
  const newest = listBackups()[0];
  if (!newest) return;
  // Leave a file a cron job is still writing alone for a minute.
  if (Date.now() - newest.at.getTime() < 60_000) return;
  const last = lastOffsite();
  if (last?.name === newest.name && last.ok) return;
  const failed = state().failedAt?.[newest.name];
  if (failed && Date.now() - failed < RETRY_MS) return;
  if (last?.name === newest.name && !last.ok && !failed && Date.now() - Date.parse(last.at) < RETRY_MS) return;
  await uploadBackup(newest.name).catch(() => {});
}
