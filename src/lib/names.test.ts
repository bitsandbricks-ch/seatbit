import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanName, foldName, nameMatches, personLabel } from "./names";

const mike = { firstName: "Mike", lastName: "Keller", name: "Mike Keller" };

test("personLabel follows the clan's name display", () => {
  assert.equal(personLabel(mike, "Reyki"), 'Mike "Reyki" Keller');
  assert.equal(personLabel(mike, "Reyki", "nameNick"), 'Mike "Reyki"');
  assert.equal(personLabel(mike, "Reyki", "nick"), "Reyki");
  // A nick that is just the name isn't repeated; short displays fall back to "Mike K.".
  assert.equal(personLabel(mike, "Mike"), "Mike Keller");
  assert.equal(personLabel(mike, null, "nick"), "Mike K.");
});

test("names compare without case, accents or German spellings", () => {
  assert.equal(foldName("JÖRG  Bäcker"), "jorg backer");
  assert.equal(foldName("Strauß"), "strauss");
  assert.ok(nameMatches("Jörg Müller", "muller jo"));
  assert.ok(nameMatches("Jörg Müller", "mueller"));
  assert.ok(!nameMatches("Jörg Müller", "meier"));
  assert.equal(cleanName("  Anna   Frei "), "Anna Frei");
});
