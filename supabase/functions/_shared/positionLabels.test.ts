import assert from "node:assert/strict";
import test from "node:test";
import { formatServingPosition } from "./positionLabels.ts";

test("serving reminders use display names instead of backend keys", () => {
  assert.equal(formatServingPosition("acoustic_guitar", "ag_1"), "AG 1");
  assert.equal(formatServingPosition("acoustic_guitar", "ag_2"), "AG 2");
  assert.equal(formatServingPosition("vocalist", "vocalist_3"), "Vocalist");
  assert.equal(formatServingPosition("electric_guitar", "eg_2"), "EG 2");
  assert.equal(formatServingPosition("sound_tech", "foh"), "FOH");
  assert.equal(formatServingPosition("media", "propresenter"), "Lyrics");
});

test("falls back to the position key when the slot is missing", () => {
  assert.equal(formatServingPosition("acoustic_guitar"), "AG 1");
  assert.equal(formatServingPosition("vocalist"), "Vocalist");
  assert.equal(formatServingPosition("bass"), "Bass");
});

test("keeps labels that are already display names", () => {
  assert.equal(formatServingPosition("AG 2"), "AG 2");
  assert.equal(formatServingPosition("Vocalist"), "Vocalist");
  assert.equal(formatServingPosition("Tri-Pod Camera"), "Tri-Pod Camera");
});
