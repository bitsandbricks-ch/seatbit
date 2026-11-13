/**
 * Authorization matrix: every server action, tried as every kind of person
 * (signed out, suspended, another clan's admin, pending, member, lead, clan
 * roles, platform staff). See tests/authz/README.md.
 *
 *   npm run test:authz
 */
import fs from "node:fs";
import path from "node:path";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { ALL_ACTORS, attempt, isRefusal, redirectTarget, reportsFailure, setup, type Outcome } from "./harness";
import { MODULES, SPECS, type Spec } from "./matrix";

before(setup, { timeout: 120_000 });
// Discord and mail helpers leave timers behind.
after(() => setTimeout(() => process.exit(process.exitCode ?? 0), 100).unref());

const describe = (o: Outcome) =>
  o.threw ? `threw ${redirectTarget(o.threw) !== undefined ? `a redirect to ${redirectTarget(o.threw)}` : JSON.stringify(o.threw.message.slice(0, 120))}` : `returned ${JSON.stringify(o.value)?.slice(0, 120)}`;

/** Every "use server" file under src/app, as the MODULES key ("clan-actions", "admin/settings/actions"). */
function serverActionFiles(dir = "src/app"): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return serverActionFiles(p);
    if (!/\.tsx?$/.test(e.name) || !/^["']use server["']/m.test(fs.readFileSync(p, "utf8"))) return [];
    return [path.relative("src/app", p).replace(/\.tsx?$/, "").split(path.sep).join("/")];
  });
}

test("every server action file is in matrix.ts", () => {
  assert.deepEqual(serverActionFiles().filter((f) => !(f in MODULES)), [], "Import these in tests/authz/matrix.ts (MODULES)");
});

test("every exported server action has a row in matrix.ts", () => {
  const covered = new Set(SPECS.map((s) => s.name.split(" ")[0]));
  const missing = Object.entries(MODULES).flatMap(([mod, exports]) =>
    Object.entries(exports)
      .filter(([, v]) => typeof v === "function")
      .map(([name]) => `${mod}.${name}`)
      .filter((n) => !covered.has(n)),
  );
  assert.deepEqual(missing, [], "Add these actions to tests/authz/matrix.ts");
});

for (const spec of SPECS) {
  test(spec.name, async () => {
    const problems: string[] = [];
    const denials: string[] = [];
    for (const actor of ALL_ACTORS.filter((a) => !spec.allow.includes(a))) {
      const o = await attempt(actor, spec.run);
      if (o.threw) denials.push(describe(o));
      if (spec.effect === "read") {
        const status = o.value instanceof Response ? o.value.status : undefined;
        if (!o.threw ? status === undefined || status < 400 : redirectTarget(o.threw) !== undefined && !isRefusal(o.threw))
          problems.push(`${actor} was not refused (${status ? `status ${status}` : describe(o)})`);
      }
      if (o.changed.length) problems.push(`${actor} changed ${o.changed.join(", ")} (${describe(o)})`);
      else if (spec.effect === "none" && (o.threw ? redirectTarget(o.threw) !== undefined && !isRefusal(o.threw) : !reportsFailure(o.value)))
        problems.push(`${actor} was not refused (${describe(o)})`);
    }
    if (!spec.noPositive) problems.push(...(await positive(spec, denials)));
    if (problems.length) assert.fail(`${spec.name}:\n  ${problems.join("\n  ")}`);
  });
}

/** The allowed call must really do something, or the denials above prove nothing. */
async function positive(spec: Spec, denials: string[]) {
  const actor = spec.positive ?? spec.allow[0];
  if (!actor) return [`no allowed actor for the positive control; set noPositive`];
  const o = await attempt(actor, spec.run);
  if (spec.effect === "read") {
    const status = o.value instanceof Response ? o.value.status : undefined;
    return status && status < 300 ? [] : [`positive control: ${actor} got ${status ? `status ${status}` : describe(o)}`];
  }
  if (spec.effect === "none") {
    if (isRefusal(o.threw) || (o.threw && denials.includes(describe(o))))
      return [`positive control: ${actor} was refused like the others (${describe(o)})`];
    return [];
  }
  return o.changed.length ? [] : [`positive control: ${actor} changed nothing (${describe(o)})`];
}
