import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAppDetails, parseSearch, parseSizeGb, steamAppIdFromUrl } from "./steam";
import { storeOf } from "./game-stores";

test("finds the app id in Steam links only", () => {
  assert.equal(steamAppIdFromUrl("https://store.steampowered.com/app/730/CounterStrike_2/"), 730);
  assert.equal(steamAppIdFromUrl("https://store.steampowered.com/app/1361210"), 1361210);
  assert.equal(steamAppIdFromUrl("https://steamcommunity.com/app/730/"), 730);
  assert.equal(steamAppIdFromUrl("https://example.com/app/730/"), null);
  assert.equal(steamAppIdFromUrl("https://store.steampowered.com/bundle/123/"), null);
  assert.equal(steamAppIdFromUrl("not a link"), null);
  assert.equal(steamAppIdFromUrl(""), null);
});

test("reads the install size from Steam's system requirements", () => {
  assert.equal(parseSizeGb('<strong>Minimum:</strong><br><ul class="bb_ul"><li><strong>Storage:</strong> 85 GB available space</li></ul>'), 85);
  assert.equal(parseSizeGb("<li><strong>Hard Drive:</strong> 1.5 GB available space</li>"), 2);
  assert.equal(parseSizeGb("<li><strong>Hard Disk Space:</strong> 500 MB</li>"), 1);
  assert.equal(parseSizeGb("<li><strong>Storage:</strong> 1,2 TB</li>"), 1200);
  assert.equal(parseSizeGb("<li><strong>Memory:</strong> 8 GB RAM</li>"), null);
  assert.equal(parseSizeGb(undefined), null);
});

test("turns an appdetails answer into game details", () => {
  const json = {
    "730": {
      success: true,
      data: {
        name: "Counter-Strike 2",
        is_free: true,
        header_image: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/730/header.jpg?t=1",
        pc_requirements: {
          minimum: "<strong>Storage:</strong> 85 GB available space",
          recommended: "<strong>Storage:</strong> 90 GB available space",
        },
        categories: [{ id: 1 }, { id: 47 }],
      },
    },
  };
  assert.deepEqual(parseAppDetails(730, json), {
    appId: 730,
    name: "Counter-Strike 2",
    sizeGb: 90,
    free: true,
    lan: true,
    multiplayer: true,
    headerImage: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/730/header.jpg?t=1",
  });
  // No requirements (Steam sends an empty list then), single player, paid.
  const solo = parseAppDetails(1, { "1": { success: true, data: { name: "Solo", is_free: false, pc_requirements: [], categories: [{ id: 2 }] } } });
  assert.equal(solo?.sizeGb, null);
  assert.equal(solo?.lan, false);
  assert.equal(solo?.multiplayer, false);
  assert.equal(parseAppDetails(2, { "2": { success: false } }), null);
  assert.equal(parseAppDetails(3, null), null);
});

test("keeps only games from a storesearch answer", () => {
  const hits = parseSearch({
    items: [
      { type: "app", id: 2225070, name: "Trackmania" },
      { type: "sub", id: 5, name: "A bundle" },
      { type: "app", id: "x", name: "Broken" },
    ],
  });
  assert.deepEqual(hits, [{ appId: 2225070, name: "Trackmania" }]);
  assert.deepEqual(parseSearch({}), []);
});

test("names the store a link points to", () => {
  assert.equal(storeOf("https://store.steampowered.com/app/730/")?.name, "Steam");
  assert.equal(storeOf("https://store.epicgames.com/en-US/p/fortnite")?.name, "Epic Games");
  assert.equal(storeOf("https://www.gog.com/en/game/x")?.name, "GOG");
  assert.deepEqual(storeOf("https://example.com/game"), { key: "web", name: null });
  assert.equal(storeOf(""), null);
});
