// Measures how often the seat planner misses wishes that could all be met, and how long it takes.
// npm run bench:seats -- [layout] [events] [max wishes] [effort]
// layout: seats per row, e.g. 20 or 10,10,10. effort: quick, extended or thorough (30 s each).
import { planSeatsAsync, type PlanEffort } from "../src/lib/seating";
import { missedWishes, plantedEvent } from "../src/lib/seating-bench";

const [layout = "20", events = "100", wishes = "3", effort = "quick"] =
  process.argv.slice(2);
const rows = layout.split(",").map(Number);
async function main() {
  let failed = 0;
  let missed = 0;
  const started = Date.now();
  for (let seed = 0; seed < Number(events); seed++) {
    const { seats, people } = plantedEvent(seed, rows, Number(wishes));
    const plan = await planSeatsAsync(seats, people, people, {
      effort: effort as PlanEffort,
      until: Date.now() + 30_000,
    });
    const m = missedWishes(seats, people, plan);
    if (m.length) {
      failed++;
      missed += m.length;
      console.log(`event ${seed}: ${m.join("; ")}`);
    }
  }
  const ms = Math.round((Date.now() - started) / Number(events));
  console.log(
    `${layout}, up to ${wishes} wishes, ${effort}: ${failed}/${events} plans miss wishes (${missed} in total), ${ms} ms per plan`,
  );
}
void main();
