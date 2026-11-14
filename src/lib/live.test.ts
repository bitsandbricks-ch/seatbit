import { test } from "node:test";
import assert from "node:assert/strict";
import { SETTLE_MS, lanChanged, liveConnections, onLanChange } from "./live";

const settle = () => new Promise((r) => setTimeout(r, SETTLE_MS + 50));

test("a burst of changes reaches each listener of that event once", async () => {
  let a = 0;
  let b = 0;
  let other = 0;
  const offA = onLanChange("lan-1", () => a++);
  const offB = onLanChange("lan-1", () => b++);
  const offOther = onLanChange("lan-2", () => other++);
  lanChanged("lan-1");
  lanChanged("lan-1");
  lanChanged("lan-1");
  await settle();
  assert.deepEqual([a, b, other], [1, 1, 0]);
  offA();
  offB();
  offOther();
});

test("unsubscribed listeners hear nothing and are not counted", async () => {
  let n = 0;
  const off = onLanChange("lan-3", () => n++);
  assert.equal(liveConnections(), 1);
  off();
  assert.equal(liveConnections(), 0);
  lanChanged("lan-3");
  await settle();
  assert.equal(n, 0);
});

test("a failing listener doesn't stop the others", async () => {
  let n = 0;
  const off1 = onLanChange("lan-4", () => {
    throw new Error("closed");
  });
  const off2 = onLanChange("lan-4", () => n++);
  lanChanged("lan-4");
  await settle();
  assert.equal(n, 1);
  off1();
  off2();
});
