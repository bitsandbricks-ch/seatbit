// Measures how often the seat planner misses wishes that could all be met, and how long it takes.
// npm run bench:seats -- [layout] [events] [max wishes] [effort] [clashes] [seconds]
// layout: seats per row, e.g. 20 or 10,10,10. effort: quick, extended or exact. clashes: extra
// random wishes per event, so not every wish can be met (then it counts how often the exact
// search proves the best plan, and how often it beats extended). seconds: exact search time limit.
import { exactPlan } from "../src/lib/seat-milp";
import { planSeatsAsync, type PlanEffort } from "../src/lib/seating";
import { addClashes, missedWishes, plantedEvent } from "../src/lib/seating-bench";

const [layout = "20", events = "100", wishes = "3", effort = "quick", clashes = "0", seconds = "60"] = process.argv.slice(2);
const rows = layout.split(",").map(Number);

async function main() {
  let failed = 0;
  let missed = 0;
  let proven = 0;
  let better = 0;
  let slowest = 0;
  const started = Date.now();
  for (let seed = 0; seed < Number(events); seed++) {
    const { seats, people } = plantedEvent(seed, rows, Number(wishes));
    addClashes(seed, seats, people, Number(clashes));
    const t = Date.now();
    const exact = effort === "exact";
    const plan = await planSeatsAsync(seats, people, people, { effort: (exact ? "extended" : effort) as PlanEffort });
    if (exact) {
      const occupant = new Map([...plan].map(([u, s]) => [s, u]));
      const r = await exactPlan(seats, occupant, new Set(plan.keys()), people, 4, Date.now() + Number(seconds) * 1000);
      if (r.proven) proven++;
      if (r.plan) {
        better++;
        for (const [s, u] of r.plan) plan.set(u, s);
      }
    }
    slowest = Math.max(slowest, Date.now() - t);
    const m = missedWishes(seats, people, plan);
    if (m.length) {
      failed++;
      missed += m.length;
      if (!Number(clashes)) console.log(`event ${seed}: ${m.join("; ")}`);
    }
  }
  const ms = Math.round((Date.now() - started) / Number(events));
  console.log(
    `${layout}, up to ${wishes} wishes + ${clashes} clashing, ${effort}: ${failed}/${events} plans miss wishes (${missed} in total), ${ms} ms per plan, slowest ${slowest} ms` +
      (effort === "exact" ? `; proven best ${proven}/${events}, better than extended ${better}` : ""),
  );
}
void main();
