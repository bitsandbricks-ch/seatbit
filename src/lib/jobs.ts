/**
 * What the background jobs and outside services did lately, for the admin
 * Health page. Kept in memory (per server process): it starts empty after a
 * restart, which the page says.
 */

export type JobState = {
  name: string;
  runs: number;
  lastStart?: number;
  lastEnd?: number;
  lastOk?: number;
  lastError?: { at: number; message: string };
  running: boolean;
};

export type ProblemKind = "error" | "mail" | "discord";
export type Problem = { at: number; kind: ProblemKind; where?: string; message: string };

type Store = {
  started: number;
  jobs: Map<string, JobState>;
  problems: Problem[];
  mail?: { at: number; ok: boolean; error?: string };
  /** Counters since the start, for /api/metrics (the lists above only keep the latest). */
  counts: { problems: Record<ProblemKind, number>; mails: { ok: number; failed: number }; jobErrors: Record<string, number> };
};

// On globalThis: route handlers, server actions and instrumentation get their own module copies.
const g = globalThis as unknown as { __seatbitJobs?: Store };
const newCounts = (): Store["counts"] => ({ problems: { error: 0, mail: 0, discord: 0 }, mails: { ok: 0, failed: 0 }, jobErrors: {} });
const store = (): Store => {
  const s = (g.__seatbitJobs ??= { started: Date.now(), jobs: new Map(), problems: [], counts: newCounts() });
  // A dev server keeps the store across reloads, also one made before counts existed.
  s.counts ??= newCounts();
  return s;
};

const KEEP_PROBLEMS = 30;
const message = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 1000);

/** Runs a background job and remembers when it ran and how it went. Rethrows errors. */
export async function runJob<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const s = store();
  const j: JobState = s.jobs.get(name) ?? { name, runs: 0, running: false };
  s.jobs.set(name, j);
  j.running = true;
  j.lastStart = Date.now();
  j.runs++;
  try {
    const r = await fn();
    j.lastOk = Date.now();
    return r;
  } catch (e) {
    j.lastError = { at: Date.now(), message: message(e) };
    s.counts.jobErrors[name] = (s.counts.jobErrors[name] ?? 0) + 1;
    throw e;
  } finally {
    j.running = false;
    j.lastEnd = Date.now();
  }
}

/** Remembers a failure for the Health page (newest first, the last 30). */
export function recordProblem(kind: ProblemKind, e: unknown, where?: string) {
  const s = store();
  s.problems.unshift({ at: Date.now(), kind, where, message: message(e) });
  s.counts.problems[kind]++;
  s.problems.length = Math.min(s.problems.length, KEEP_PROBLEMS);
}

/** The last mail sent or failed. */
export function recordMail(ok: boolean, e?: unknown) {
  const s = store();
  s.mail = { at: Date.now(), ok, ...(e !== undefined && { error: message(e) }) };
  s.counts.mails[ok ? "ok" : "failed"]++;
}

export function jobsSnapshot() {
  const s = store();
  return {
    started: s.started,
    jobs: [...s.jobs.values()].map((j) => ({ ...j })),
    problems: [...s.problems],
    mail: s.mail,
    counts: structuredClone(s.counts),
  };
}
