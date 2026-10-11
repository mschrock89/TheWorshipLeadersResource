import assert from "node:assert/strict";
import test from "node:test";
import { shortRosterName } from "./rosterName.ts";

test("keeps a one-syllable last name and shortens the rest to the first syllable", () => {
  assert.equal(shortRosterName("Mitch Schrock"), "Mitch Schrock");
  assert.equal(shortRosterName("HannahGrace West"), "HannahGrace West");
  assert.equal(shortRosterName("Kristen Worley"), "Kristen Wor");
  assert.equal(shortRosterName("Kyle Elkins"), "Kyle El");
  assert.equal(shortRosterName("Zach Simms"), "Zach Simms");
  assert.equal(shortRosterName("Michael Waggoner"), "Michael Wag");
  assert.equal(shortRosterName("Eli Rhodes"), "Eli Rhodes");
  assert.equal(shortRosterName("Scott Wilson"), "Scott Wil");
  assert.equal(shortRosterName("Justin Worley"), "Justin Wor");
});

test("leaves a single name alone and drops a suffix before shortening", () => {
  assert.equal(shortRosterName("Corey"), "Corey");
  assert.equal(shortRosterName("Michael Waggoner Jr."), "Michael Wag");
});
