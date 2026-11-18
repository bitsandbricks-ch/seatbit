import { createRequire } from "node:module";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { seatRow } from "./seat-labels";
import { wishWeights } from "./seat-rules";
import type { PlanPerson, PlanSeat } from "./seating";

/**
 * Exact seat planning for the leads' thorough search: the seat plan as a mixed-integer program,
 * solved by HiGHS (an open-source optimisation solver, compiled to WebAssembly, in the `highs`
 * package). It finds the plan with the highest wish score the leads see (each seated person's
 * weighted share of met wishes, summed) and proves that no plan scores higher.
 *
 * The model: x[p,s] = 1 when person p sits on seat s, for people with wishes or whom someone
 * wishes about; everyone else just fills the seats left over, so they need no variables. m[w] is
 * how far wish w is met (0..1), and the objective adds up m[w] times the wish's weight.
 * - seat, row, edge, middle: m[w] <= sum of x[p,s] over the seats that fit.
 * - right next to / near: y[w,s] <= x[p,s], y[w,s] <= sum of x[q,t] over the seats t close enough
 *   to s, and m[w] <= sum of y[w,s]. (Tighter than one inequality per seat, so the solver proves faster.)
 * - not right next to: m[w] + x[p,s] + sum of x[q,t] over the neighbours t of s <= 2, per seat s.
 *
 * Finding the best seat plan is NP-hard, so a big event with clashing wishes can take long. HiGHS
 * stops at the time limit with the best plan it has, which is then not proven. It runs in a worker
 * thread, so the server keeps answering requests meanwhile.
 */

export type ExactResult = {
  /** seatId -> userId for everyone who may move; null when the solver found nothing better than `occupant`. */
  plan: Map<string, string> | null;
  /** No plan scores higher than the returned one (or `occupant`, when plan is null). */
  proven: boolean;
};

type Wish = { owner: number; other: number; kind: string; fits?: (s: PlanSeat) => boolean; w: number };

/**
 * `occupant`: the plan to start from (seatId -> userId); only these people get a seat. `movable`:
 * who may change seats; everyone else and held seats stay as they are.
 */
export function buildModel(seats: PlanSeat[], occupant: Map<string, string>, movable: Set<string>, everyone: PlanPerson[], range: number) {
  const at = new Map(seats.map((s, i) => [`${s.row}:${s.col}`, i]));
  const edge = seats.map((s) => !at.has(`${s.row}:${s.col - 1}`) || !at.has(`${s.row}:${s.col + 1}`));
  const seatIx = new Map(seats.map((s, i) => [s.id, i]));
  const seatOf = new Map([...occupant].map(([sid, uid]) => [uid, seatIx.get(sid)!]));
  const people = everyone.filter((p) => seatOf.has(p.userId));
  const ix = new Map(people.map((p, i) => [p.userId, i]));

  const wishes: Wish[] = [];
  for (const p of people) {
    const weights = wishWeights(p.rules);
    const mine: Omit<Wish, "w">[] = [];
    const ws: number[] = [];
    const owner = ix.get(p.userId)!;
    p.rules.forEach((r, i) => {
      if (r.kind === "next" || r.kind === "near" || r.kind === "avoid") {
        const other = ix.get(r.userId);
        if (other === undefined) return; // no seat: can't be checked, doesn't count (like checkWishes)
        mine.push({ owner, other, kind: r.kind });
      } else {
        const fits =
          r.kind === "seat"
            ? (s: PlanSeat) => s.label.toUpperCase() === r.seat
            : r.kind === "row"
              ? (s: PlanSeat) => seatRow(s) === r.row
              : (s: PlanSeat) => edge[seatIx.get(s.id)!] === (r.kind === "edge");
        mine.push({ owner, other: -1, kind: r.kind, fits });
      }
      ws.push(weights[i]);
    });
    const all = ws.reduce((a, b) => a + b, 0);
    mine.forEach((m, i) => wishes.push({ ...m, w: ws[i] / all }));
  }

  const moves = people.map((p) => movable.has(p.userId));
  const special = people.map(() => false);
  for (const w of wishes) {
    special[w.owner] = true;
    if (w.other >= 0) special[w.other] = true;
  }
  // Seats the movable people may take: not held, and not someone's who stays.
  const fixedSeat = new Set(people.filter((_, i) => !moves[i]).map((p) => seatOf.get(p.userId)!));
  const open = seats.map((s, i) => !s.locked && !fixedSeat.has(i));
  const openIx = seats.map((_, i) => i).filter((i) => open[i]);
  const near = (a: number, b: number, within: number) =>
    a !== b && seats[a].row === seats[b].row && Math.abs(seats[a].col - seats[b].col) <= within;
  const around = (s: number, within: number) => openIx.filter((t) => near(s, t, within));
  const vars = people.map((_, i) => (moves[i] && special[i] ? openIx : []));
  const x = (p: number, s: number) => `x${p}_${s}`;
  const within = (w: Wish) => (w.kind === "next" || w.kind === "avoid" ? 1 : range);

  const objective: string[] = [];
  const rows: string[] = [];
  const add = (lhs: string, rhs: string) => rows.push(` r${rows.length}: ${lhs} ${rhs}`);
  const sum = (terms: string[], sign = "+") => terms.map((t) => ` ${sign} ${t}`).join("");
  for (let p = 0; p < people.length; p++) if (vars[p].length) add(vars[p].map((s) => x(p, s)).join(" + "), "= 1");
  for (const s of openIx) {
    const here = people.map((_, p) => p).filter((p) => vars[p].length);
    if (here.length) add(here.map((p) => x(p, s)).join(" + "), "<= 1");
  }
  let constant = 0;
  const bounds: string[] = [];
  const free: string[] = [];
  wishes.forEach((w, k) => {
    const m = `m${k}`;
    const pm = moves[w.owner] && special[w.owner];
    if (w.other < 0) {
      if (!pm) {
        if (w.fits!(seats[seatOf.get(people[w.owner].userId)!])) constant += w.w;
        return;
      }
      objective.push(`${w.w} ${m}`);
      bounds.push(` 0 <= ${m} <= 1`);
      add(`${m}${sum(openIx.filter((s) => w.fits!(seats[s])).map((s) => x(w.owner, s)), "-")}`, "<= 0");
      return;
    }
    const qm = moves[w.other] && special[w.other];
    const fixedAt = (p: number) => seatOf.get(people[p].userId)!;
    if (!pm && !qm) {
      const ok = near(fixedAt(w.owner), fixedAt(w.other), within(w));
      if (w.kind === "avoid" ? !ok : ok) constant += w.w;
      return;
    }
    objective.push(`${w.w} ${m}`);
    bounds.push(` 0 <= ${m} <= 1`);
    if (!pm || !qm) {
      // One of them stays put: it only matters whether the other sits close to that seat.
      const [mover, still] = pm ? [w.owner, w.other] : [w.other, w.owner];
      const close = around(fixedAt(still), within(w)).map((s) => x(mover, s));
      if (w.kind === "avoid") add(`${m}${sum(close)}`, "<= 1");
      else add(`${m}${sum(close, "-")}`, "<= 0");
      return;
    }
    if (w.kind === "avoid") {
      for (const s of openIx) add(`${m} + ${x(w.owner, s)}${sum(around(s, 1).map((t) => x(w.other, t)))}`, "<= 2");
      return;
    }
    const ys: string[] = [];
    for (const s of openIx) {
      const close = around(s, within(w));
      if (!close.length) continue;
      const y = `y${k}_${s}`;
      ys.push(y);
      free.push(y);
      add(`${y} - ${x(w.owner, s)}`, "<= 0");
      add(`${y}${sum(close.map((t) => x(w.other, t)), "-")}`, "<= 0");
    }
    add(`${m}${sum(ys, "-")}`, "<= 0");
  });
  for (const y of free) bounds.push(` 0 <= ${y} <= 1`);

  const binaries = people.flatMap((_, p) => vars[p].map((s) => x(p, s)));
  const lp = [
    "Maximize",
    ` obj: ${objective.length ? objective.join(" + ") : "0 dummy"}`,
    "Subject To",
    ...(rows.length ? rows : [" r0: dummy >= 0"]),
    "Bounds",
    ...bounds,
    ...(binaries.length ? ["Binary", ` ${binaries.join(" ")}`] : []),
    "End",
    "",
  ].join("\n");

  /** Who sits where for a solver solution: seatId -> userId for everyone who may move. */
  const decode = (value: (name: string) => number) => {
    const plan = new Map<string, string>();
    const taken = new Set<number>();
    for (let p = 0; p < people.length; p++) {
      if (!vars[p].length) continue;
      const s = vars[p].reduce((a, b) => (value(x(p, b)) > value(x(p, a)) ? b : a));
      if (taken.has(s)) return null; // can't happen for a valid solution; stay safe
      plan.set(seats[s].id, people[p].userId);
      taken.add(s);
    }
    // Everyone else who may move keeps their seat where it's still free, the rest fill up the free seats.
    const rest = people.filter((_, p) => moves[p] && !vars[p].length);
    const homeless: string[] = [];
    for (const p of rest) {
      const s = seatOf.get(p.userId)!;
      if (taken.has(s)) homeless.push(p.userId);
      else {
        plan.set(seats[s].id, p.userId);
        taken.add(s);
      }
    }
    for (const s of openIx) {
      if (!homeless.length) break;
      if (taken.has(s)) continue;
      plan.set(seats[s].id, homeless.shift()!);
      taken.add(s);
    }
    // Movable people without a PlanPerson (shouldn't happen) keep their seat.
    for (const [sid, uid] of occupant) if (movable.has(uid) && !ix.has(uid)) plan.set(sid, uid);
    return plan;
  };

  /** The wish score of a plan (seatId -> userId for everyone seated). */
  const score = (plan: Map<string, string>) => {
    const pos = new Map([...plan].map(([sid, uid]) => [uid, seatIx.get(sid)!]));
    const where = (p: number) => pos.get(people[p].userId);
    let t = 0;
    for (const w of wishes) {
      const a = where(w.owner);
      if (a === undefined) continue;
      if (w.other < 0) {
        if (w.fits!(seats[a])) t += w.w;
        continue;
      }
      const b = where(w.other);
      if (b === undefined) continue;
      const ok = near(a, b, within(w));
      if (w.kind === "avoid" ? !ok : ok) t += w.w;
    }
    return t;
  };

  const max = wishes.reduce((a, w) => a + w.w, 0);
  return { lp, decode, score, max, variables: binaries.length, constant, needed: objective.length > 0 };
}

type Solution = { Status: string; Columns?: Record<string, { Primal: number }>; error?: string };

/** HiGHS's `solve` runs in a worker thread; the server stays responsive, and `terminate` ends it for sure. */
function solveInWorker(lp: string, seconds: number): Promise<Solution> {
  // Resolved from the app folder (the container image ships node_modules/highs there, see next.config.ts).
  const highsPath = createRequire(join(process.cwd(), "package.json")).resolve("highs");
  const code = `
    const { parentPort, workerData } = require("node:worker_threads");
    require(workerData.highsPath)()
      .then((h) => parentPort.postMessage(h.solve(workerData.lp, workerData.options)))
      .catch((e) => parentPort.postMessage({ Status: "Error", error: String(e && e.message || e) }));
  `;
  const options = { output_flag: false, time_limit: Math.max(1, seconds), mip_rel_gap: 0, mip_abs_gap: 1e-9 };
  return new Promise((resolve) => {
    const worker = new Worker(code, { eval: true, workerData: { highsPath, lp, options } });
    // HiGHS honours the time limit; this is the backstop.
    const kill = setTimeout(() => void worker.terminate(), (seconds + 30) * 1000);
    const done = (s: Solution) => {
      clearTimeout(kill);
      void worker.terminate();
      resolve(s);
    };
    worker.once("message", (m: Solution) => done(m));
    worker.once("error", (e: Error) => done({ Status: "Error", error: e.message }));
    worker.once("exit", () => done({ Status: "Error", error: "worker stopped" }));
  });
}

/** Solves the seat plan exactly, starting from `occupant`, until `until` (ms). */
export async function exactPlan(
  seats: PlanSeat[],
  occupant: Map<string, string>,
  movable: Set<string>,
  everyone: PlanPerson[],
  range: number,
  until: number,
): Promise<ExactResult> {
  const model = buildModel(seats, occupant, movable, everyone, range);
  const start = model.score(occupant);
  // Nothing to decide, or every wish already met: the starting plan is the best there is.
  if (!model.needed || !model.variables || start >= model.max - 1e-9) return { plan: null, proven: true };
  const res = await solveInWorker(model.lp, Math.floor((until - Date.now()) / 1000));
  if (!res.Columns || (res.Status !== "Optimal" && res.Status !== "Time limit reached")) return { plan: null, proven: false };
  const plan = model.decode((name) => res.Columns![name]?.Primal ?? 0);
  const proven = res.Status === "Optimal";
  if (!plan) return { plan: null, proven: false };
  // Fixed people keep their seats; compare the whole plans.
  const whole = new Map([...occupant].filter(([, uid]) => !movable.has(uid)));
  for (const [sid, uid] of plan) whole.set(sid, uid);
  return model.score(whole) > start + 1e-9 ? { plan, proven } : { plan: null, proven };
}
