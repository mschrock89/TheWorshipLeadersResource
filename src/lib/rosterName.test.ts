import assert from "node:assert/strict";
import test from "node:test";
import { shortRosterName } from "./rosterName.ts";

test("shortens a last name to its first letter", () => {
  assert.equal(shortRosterName("Mitch Schrock"), "Mitch S");
  assert.equal(shortRosterName("HannahGrace West"), "HannahGrace W");
  assert.equal(shortRosterName("Kristen Worley"), "Kristen W");
  assert.equal(shortRosterName("Kyle Elkins"), "Kyle E");
  assert.equal(shortRosterName("Zach Simms"), "Zach S");
  assert.equal(shortRosterName("Michael Waggoner"), "Michael W");
  assert.equal(shortRosterName("Eli Rhodes"), "Eli R");
  assert.equal(shortRosterName("Scott Wilson"), "Scott W");
  assert.equal(shortRosterName("Justin Worley"), "Justin W");
});

test("leaves a single name alone and drops a suffix before the initial", () => {
  assert.equal(shortRosterName("Corey"), "Corey");
  assert.equal(shortRosterName("Michael Waggoner Jr."), "Michael W");
});
