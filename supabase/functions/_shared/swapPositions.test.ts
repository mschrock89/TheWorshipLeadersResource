import assert from "node:assert/strict";
import test from "node:test";
import { canonicalSwapPosition, swapPositionsMatch } from "./swapPositions.ts";

test("vocalist slot labels match the campus Vocalist assignment", () => {
  assert.equal(canonicalSwapPosition("Vocalist 1"), "vocalist");
  assert.equal(canonicalSwapPosition("Vocalist"), "vocalist");
  assert.equal(swapPositionsMatch("Vocalist 1", "Vocalist"), true);
  assert.equal(swapPositionsMatch("vocalist_4", "lead_vocals"), true);
  assert.equal(swapPositionsMatch("Vocalist 1", "Drums"), false);
});

test("numbered instrument and camera slots match their position family", () => {
  assert.equal(swapPositionsMatch("EG 2", "EG 1"), true);
  assert.equal(swapPositionsMatch("AG 2", "acoustic_guitar"), true);
  assert.equal(swapPositionsMatch("Tri-Pod Camera 1", "Tri-Pod Camera"), true);
  assert.equal(swapPositionsMatch("Hand-Held Camera 2", "hand_held_camera"), true);
  assert.equal(swapPositionsMatch("FOH", "sound_tech"), true);
  assert.equal(swapPositionsMatch("Lyrics", "media"), true);
  assert.equal(swapPositionsMatch("Announcements", "announcement"), true);
  assert.equal(swapPositionsMatch("EG 1", "AG 1"), false);
});
