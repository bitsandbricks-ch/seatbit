import assert from "node:assert/strict";
import { test } from "node:test";
import { SOCIAL_MAX, cleanSocials, listSocials } from "./socials";

const href = (key: string, value: string) => listSocials({ [key]: value })[0]?.href;

test("Steam: id, custom name or a steamcommunity.com link", () => {
  assert.equal(href("steam", "76561197960287930"), "https://steamcommunity.com/profiles/76561197960287930");
  assert.equal(href("steam", "gabe n"), "https://steamcommunity.com/id/gabe%20n");
  assert.equal(href("steam", "http://steamcommunity.com/id/gabe"), "https://steamcommunity.com/id/gabe");
});

test("links never go to another host", () => {
  assert.equal(href("steam", "https://steamcommunity.com.example.com/id/x"), null);
  assert.equal(href("steam", "https://steamcommunity.com@example.com/id/x"), null);
  assert.equal(href("twitch", "https://example.com/evil"), "https://www.twitch.tv/evil");
  assert.equal(href("youtube", "javascript:alert(1)"), "https://www.youtube.com/@javascript%3Aalert(1)");
});

test("handles: a leading @ or a pasted profile link", () => {
  assert.equal(href("youtube", "@pixel"), "https://www.youtube.com/@pixel");
  assert.equal(href("twitch", "https://www.twitch.tv/pixel/"), "https://www.twitch.tv/pixel");
  assert.equal(href("faceit", "pixel"), "https://www.faceit.com/en/players/pixel");
});

test("services without profile pages show the name only", () => {
  assert.equal(href("discord", "pixel"), null);
  assert.equal(href("battlenet", "Pixel#1234"), null);
});

test("cleanSocials keeps known keys, trims and caps the length", () => {
  const out = cleanSocials({ steam: "  gabe ", evil: "x", twitch: "", xbox: "a".repeat(SOCIAL_MAX + 20) });
  assert.deepEqual(Object.keys(out).sort(), ["steam", "xbox"]);
  assert.equal(out.steam, "gabe");
  assert.equal(out.xbox.length, SOCIAL_MAX);
});

test("listSocials keeps the display order", () => {
  assert.deepEqual(listSocials({ youtube: "a", discord: "b" }).map((s) => s.key), ["discord", "youtube"]);
  assert.deepEqual(listSocials(null), []);
});
