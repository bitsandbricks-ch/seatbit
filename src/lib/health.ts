import fs from "node:fs";
import os from "node:os";
import { count } from "drizzle-orm";
import { db, dbFile, schema } from "@/db";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { api, botIdentity, discordEnabled } from "./discord-api";
import { mailTarget, verifySmtp } from "./mail";
import { jobsSnapshot } from "./jobs";
import { announceChannel, opsChannel } from "./ops";
import { getNumberSetting } from "./settings";

const size = (f: string) => {
  try {
    return fs.statSync(f).size;
  } catch {
    return 0;
  }
};


function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`No answer within ${ms / 1000} s`)), ms))]);
}

const rows = (t: SQLiteTable) => db.select({ n: count() }).from(t).get()?.n ?? 0;

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export type Check = { ok: boolean | null; detail?: string };

/** Everything on the admin Health page. Mail and Discord are checked live, with a short timeout. */
export async function healthReport() {
  const sqlite = db.$client;
  const pragma = (p: string) => sqlite.pragma(p, { simple: true }) as string | number;
  const database = {
    path: dbFile,
    size: size(dbFile),
    wal: size(`${dbFile}-wal`),
    sqlite: (sqlite.prepare("select sqlite_version() as v").get() as { v: string }).v,
    journal: String(pragma("journal_mode")),
    integrity: String(pragma("quick_check")),
    counts: {
      users: rows(schema.user),
      clans: rows(schema.clan),
      events: rows(schema.lan),
      audit: rows(schema.auditLog),
    },
  };

  const target = mailTarget();
  const mail: Check & { target: typeof target } = { target, ok: null };
  if (target.kind !== "console") {
    try {
      await withTimeout(verifySmtp(), 5000);
      mail.ok = true;
    } catch (e) {
      mail.ok = false;
      mail.detail = errText(e);
    }
  }

  const discord: Check & { bot?: string; channels: number; ops: Check; announce: Check } = {
    ok: null,
    channels: rows(schema.discordChannel),
    ops: { ok: null },
    announce: { ok: null },
  };
  if (discordEnabled()) {
    try {
      discord.bot = (await withTimeout(botIdentity(), 5000)).username;
      discord.ok = true;
    } catch (e) {
      discord.ok = false;
      discord.detail = errText(e);
    }
    // Reading the channel shows whether the bot can see it (403/404 otherwise).
    for (const [k, id] of [
      ["ops", opsChannel()],
      ["announce", announceChannel()],
    ] as const) {
      if (!id || !discord.ok) continue;
      try {
        const c = await withTimeout(api<{ name?: string }>("GET", `/channels/${id}`), 5000);
        discord[k] = { ok: true, detail: c.name ? `#${c.name}` : id };
      } catch (e) {
        discord[k] = { ok: false, detail: errText(e) };
      }
    }
  }

  const snap = jobsSnapshot();
  return {
    version: {
      commit: process.env.SEATBIT_COMMIT || null,
      node: process.version,
      platform: `${os.platform()} ${os.arch()}`,
      started: new Date(Date.now() - process.uptime() * 1000),
      memory: process.memoryUsage().rss,
      tz: process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    database,
    mail: { ...mail, last: snap.mail },
    discord,
    jobs: snap.jobs,
    problems: snap.problems,
    reminderMinutes: getNumberSetting("reminders.intervalMinutes") ?? 60,
    trackedSince: new Date(snap.started),
  };
}
