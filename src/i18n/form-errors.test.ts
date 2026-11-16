import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { formError } from "./form-errors";
import { makeT } from "./translate";
import { optionalHttpUrl } from "../lib/safe-url";

const form = z.object({
  name: z.string().trim().min(1).max(10),
  capacity: z.coerce.number().int().min(1),
  websiteUrl: optionalHttpUrl(),
  mystery: z.string().min(3),
});

const fail = (v: unknown, locale: "en" | "de" = "en") => {
  const r = form.safeParse(v);
  assert.ok(!r.success);
  return formError(r.error, makeT(locale));
};

test("names the field and the reason in the reader's language", () => {
  const ok = { name: "x", capacity: "2", websiteUrl: "", mystery: "abc" };
  assert.equal(fail({ ...ok, name: " " }), "Name: please fill this in.");
  assert.equal(fail({ ...ok, name: " " }, "de"), "Name: bitte ausfüllen.");
  assert.equal(fail({ ...ok, name: "a".repeat(11) }), "Name: at most 10 characters.");
  assert.equal(fail({ ...ok, capacity: "0" }), "Spots: at least 1.");
  assert.equal(fail({ ...ok, capacity: "abc" }), "Spots: please enter a whole number.");
  assert.equal(fail({ ...ok, websiteUrl: "javascript:alert(1)" }), "Website: use a full link starting with https://.");
});

test("fields without a label show only the reason, each field once", () => {
  assert.equal(
    fail({ name: "", capacity: "0", websiteUrl: "", mystery: "a" }),
    "Name: please fill this in. Spots: at least 1. At least 3 characters.",
  );
});
