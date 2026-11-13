/**
 * The changelog: user-facing release notes in English and German, one YAML file per
 * entry in changelog/ (see docs/contributing/changelog.md). Read by the "What's new"
 * page, the upgrade notice and the announcements channel; the docs render the same files.
 *
 * Kept free of "server-only" and the database so scripts (check:changelog) can import it.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { LOCALES, type Locale } from "../i18n/config";

export const CHANGE_TYPES = ["new", "improved", "fixed"] as const;
export type ChangeType = (typeof CHANGE_TYPES)[number];

/** "everyone" shows to all; "admins" only to the platform team (backups, upgrades, settings). */
export const AUDIENCES = ["everyone", "admins"] as const;
export type Audience = (typeof AUDIENCES)[number];

export type ChangeText = { title: string; text?: string };

export type ChangelogEntry = {
  /** File name without .yml, e.g. "2026-11-13-changelog". Stable: the upgrade notice remembers it. */
  id: string;
  /** Day it reached main (YYYY-MM-DD). */
  date: string;
  type: ChangeType;
  audience: Audience;
  prs: number[];
  en: ChangeText;
  de: ChangeText;
};

const FILE = /^(\d{4}-\d{2}-\d{2})-[a-z0-9]+(?:-[a-z0-9]+)*\.yml$/;

/** Checks one parsed file; returns the problems (empty when fine). */
export function validateEntry(file: string, raw: unknown): string[] {
  const errs: string[] = [];
  const m = FILE.exec(file);
  if (!m) errs.push("file name must be YYYY-MM-DD-short-slug.yml (lowercase, dashes)");
  if (!raw || typeof raw !== "object") return [...errs, "not a YAML mapping"];
  const r = raw as Record<string, unknown>;
  const date = r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) errs.push("date must be YYYY-MM-DD");
  else if (m && m[1] !== date) errs.push(`date ${date} doesn't match the file name`);
  if (!CHANGE_TYPES.includes(r.type as ChangeType)) errs.push(`type must be one of ${CHANGE_TYPES.join(", ")}`);
  if (r.audience !== undefined && !AUDIENCES.includes(r.audience as Audience)) errs.push(`audience must be one of ${AUDIENCES.join(", ")}`);
  const prs = r.pr === undefined ? [] : Array.isArray(r.pr) ? r.pr : [r.pr];
  if (prs.some((p) => !Number.isInteger(p) || (p as number) < 1)) errs.push("pr must be a number or a list of numbers");
  const known = new Set(["date", "type", "audience", "pr", ...LOCALES]);
  for (const k of Object.keys(r)) if (!known.has(k)) errs.push(`unknown field "${k}"`);
  for (const l of LOCALES) {
    const c = r[l] as Record<string, unknown> | undefined;
    if (!c || typeof c !== "object") {
      errs.push(`${l}: missing (every entry needs ${LOCALES.join(" and ")})`);
      continue;
    }
    if (typeof c.title !== "string" || !c.title.trim()) errs.push(`${l}.title: missing`);
    else if (c.title.length > 120) errs.push(`${l}.title: keep it under 120 characters, details go into text`);
    if (c.text !== undefined && typeof c.text !== "string") errs.push(`${l}.text: must be text`);
    for (const k of Object.keys(c)) if (k !== "title" && k !== "text") errs.push(`${l}: unknown field "${k}"`);
  }
  const de = r.de as Record<string, unknown> | undefined;
  if (de && /ß/.test(`${de.title ?? ""} ${de.text ?? ""}`)) errs.push('de: Swiss German writes "ss", never "ß"');
  if (/\borgas?\b/i.test(JSON.stringify(r))) errs.push('say "lead" (Lead), never "orga"');
  return errs;
}

function toEntry(file: string, r: Record<string, unknown>): ChangelogEntry {
  const text = (c: unknown): ChangeText => {
    const o = c as Record<string, string>;
    return { title: o.title.trim(), ...(o.text?.trim() && { text: o.text.trim() }) };
  };
  return {
    id: file.replace(/\.yml$/, ""),
    date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date),
    type: r.type as ChangeType,
    audience: (r.audience as Audience) ?? "everyone",
    prs: r.pr === undefined ? [] : ((Array.isArray(r.pr) ? r.pr : [r.pr]) as number[]),
    en: text(r.en),
    de: text(r.de),
  };
}

/** Every file in the folder with its parsed content (or parse error), sorted by name. */
// Paths spelled out in each call: a path in a variable makes the build trace the whole project.
export function readChangelogFiles() {
  let files: string[] = [];
  try {
    files = readdirSync(path.join(process.cwd(), "changelog")).filter((f) => f.endsWith(".yml")).sort();
  } catch {
    return [];
  }
  return files.map((file) => {
    try {
      return { file, raw: parse(readFileSync(path.join(process.cwd(), "changelog", file), "utf8")) as unknown };
    } catch (e) {
      return { file, raw: undefined, error: e instanceof Error ? e.message : String(e) };
    }
  });
}

const TYPE_ORDER: Record<ChangeType, number> = { new: 0, improved: 1, fixed: 2 };

let cache: ChangelogEntry[] | undefined;

/** All valid entries, newest day first; within a day new, improved, fixed. Broken files are skipped (CI catches them). */
export function getChangelog(): ChangelogEntry[] {
  if (cache && process.env.NODE_ENV === "production") return cache;
  const out: ChangelogEntry[] = [];
  for (const { file, raw, error } of readChangelogFiles()) {
    const errs = error ? [error] : validateEntry(file, raw);
    if (errs.length) {
      console.warn(`[changelog] skipping ${file}: ${errs.join("; ")}`);
      continue;
    }
    out.push(toEntry(file, raw as Record<string, unknown>));
  }
  out.sort((a, b) => b.date.localeCompare(a.date) || TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.id.localeCompare(b.id));
  cache = out;
  return out;
}

/** Entries grouped by day, newest first. */
export function changelogByDay(entries: ChangelogEntry[]) {
  const days: { date: string; entries: ChangelogEntry[] }[] = [];
  for (const e of entries) {
    const last = days.at(-1);
    if (last?.date === e.date) last.entries.push(e);
    else days.push({ date: e.date, entries: [e] });
  }
  return days;
}

export const entryText = (e: ChangelogEntry, locale: Locale): ChangeText => e[locale] ?? e.en;

/** "• Title" lines for a notice or a Discord post. */
export const changeLines = (entries: ChangelogEntry[], locale: Locale) => entries.map((e) => `• ${entryText(e, locale).title}`).join("\n");
