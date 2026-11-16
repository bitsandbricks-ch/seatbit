import assert from "node:assert/strict";
import { test } from "node:test";
import { profileLink, profilePattern, validProfileUrl } from "./profile-link";

test("a pattern is an http(s) URL with {id}", () => {
  assert.equal(validProfileUrl("https://example.com/user/?id={id}"), true);
  assert.equal(validProfileUrl("https://example.com/user/"), false);
  assert.equal(validProfileUrl("javascript:alert({id})"), false);
  assert.equal(validProfileUrl("example.com/{id}"), false);
});

test("profileLink fills in the encoded LAN ID", () => {
  assert.equal(profileLink("https://example.com/u/{id}", " 42 "), "https://example.com/u/42");
  assert.equal(profileLink("https://example.com/u?id={id}", "a&b=c"), "https://example.com/u?id=a%26b%3Dc");
  assert.equal(profileLink("https://example.com/u/{id}", ""), null);
  assert.equal(profileLink("", "42"), null);
  assert.equal(profileLink("ftp://example.com/{id}", "42"), null);
});

test("the event's own pattern wins over its LAN type's", () => {
  assert.equal(profilePattern({ profileUrl: "https://a.example/{id}" }, { profileUrl: "https://b.example/{id}" }), "https://a.example/{id}");
  assert.equal(profilePattern({ profileUrl: "" }, { profileUrl: "https://b.example/{id}" }), "https://b.example/{id}");
  assert.equal(profilePattern({ profileUrl: "" }, null), "");
});
