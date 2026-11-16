import assert from "node:assert/strict";
import { test } from "node:test";
import { httpHref, isHttpUrl, optionalHttpUrl, safeNext } from "./safe-url";

test("safeNext keeps same-site paths", () => {
  assert.equal(safeNext("/lans/abc?tab=seats"), "/lans/abc?tab=seats");
  assert.equal(safeNext("/"), "/");
});

test("safeNext refuses everything a browser reads as another site", () => {
  for (const raw of [
    "https://evil.example.com",
    "//evil.example.com",
    "/\\evil.example.com",
    "/\t/evil.example.com",
    "/\n/evil.example.com",
    "javascript:alert(1)",
    "lans",
    "",
    "/" + "a".repeat(2001),
  ]) {
    assert.equal(safeNext(raw, "/home"), "/home", JSON.stringify(raw));
  }
  assert.equal(safeNext(undefined), "/");
  assert.equal(safeNext(["/lans"]), "/");
});

test("isHttpUrl only lets http and https through", () => {
  assert.equal(isHttpUrl("https://example.com/x"), true);
  assert.equal(isHttpUrl("http://example.com"), true);
  for (const v of ["javascript:alert(1)", "JAVASCRIPT:alert(1)", "data:text/html,hi", "ftp://example.com", "example.com", "", "//example.com"]) {
    assert.equal(isHttpUrl(v), false, v);
  }
});

test("httpHref drops stored links that could run script", () => {
  assert.equal(httpHref("https://example.com"), "https://example.com");
  assert.equal(httpHref("javascript:alert(1)"), undefined);
  assert.equal(httpHref(""), undefined);
  assert.equal(httpHref(null), undefined);
});

test("optionalHttpUrl accepts empty or an http(s) link within the limit", () => {
  const field = optionalHttpUrl(30);
  assert.equal(field.safeParse("").success, true);
  assert.equal(field.safeParse("https://example.com").success, true);
  assert.equal(field.safeParse("javascript:alert(1)").success, false);
  assert.equal(field.safeParse(`https://example.com/${"a".repeat(30)}`).success, false);
});
