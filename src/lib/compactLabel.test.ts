import assert from "node:assert/strict";
import test from "node:test";
import { toCompactLabel } from "./compactLabel.ts";

test("uses the first letter of each word", () => {
  assert.equal(toCompactLabel("Weekend Worship"), "WW");
  assert.equal(toCompactLabel("Murfreesboro Central"), "MC");
  assert.equal(toCompactLabel("HS Worship"), "HW");
  assert.equal(toCompactLabel("MS Worship Weekend"), "MWW");
  assert.equal(toCompactLabel("MS/HS Worship"), "MHW");
  assert.equal(toCompactLabel("MS/HS Production"), "MHP");
  assert.equal(toCompactLabel("Kids Camp Morning"), "KCM");
  assert.equal(toCompactLabel("Network Wide Events"), "NWE");
  assert.equal(toCompactLabel("All Campuses"), "AC");
  assert.equal(toCompactLabel("All campuses"), "AC");
  assert.equal(toCompactLabel("Combined (HS + MS Worship)"), "CHMW");
});

test("keeps single-word names intact", () => {
  assert.equal(toCompactLabel("Production"), "Production");
  assert.equal(toCompactLabel("Video"), "Video");
  assert.equal(toCompactLabel("ER"), "ER");
  assert.equal(toCompactLabel("Shelbyville"), "Shelbyville");
});

test("ignores extra space and apostrophes", () => {
  assert.equal(toCompactLabel("  Weekend   Worship  "), "WW");
  assert.equal(toCompactLabel("Children's Ministry"), "CM");
  assert.equal(toCompactLabel(""), "");
  assert.equal(toCompactLabel(null), "");
});
