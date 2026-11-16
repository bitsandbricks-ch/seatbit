import assert from "node:assert/strict";
import { test } from "node:test";
import { myGamesTodo } from "./games-todo";

const g = (myVote: boolean, myInstalled: boolean, sizeGb: number | null = 10) => ({ myVote, myInstalled, sizeGb });

test("only my own votes that I haven't installed count", () => {
  const todo = myGamesTodo([g(true, false, 20), g(true, true, 30), g(false, false, 40), g(false, true), g(true, false, null)]);
  assert.deepEqual(todo, { voted: 3, toInstall: 2, gb: 20 });
});

test("games only others voted for leave nothing to install", () => {
  assert.deepEqual(myGamesTodo([g(false, false), g(false, false)]), { voted: 0, toInstall: 0, gb: 0 });
});
