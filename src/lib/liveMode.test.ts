import assert from "node:assert/strict";
import test from "node:test";
import {
  hasProductionLiveAssignment,
  rmsFromTimeDomain,
  sanitizeTalkbackTranscript,
  shouldDropRepeat,
} from "./liveMode.ts";

test("keeps a short talkback cue and drops silence hallucinations", () => {
  assert.equal(sanitizeTalkbackTranscript("  more click in the ears "), "more click in the ears");
  assert.equal(sanitizeTalkbackTranscript("ok"), "ok");
  assert.equal(sanitizeTalkbackTranscript("Thanks for watching!"), null);
  assert.equal(sanitizeTalkbackTranscript("[Music]"), null);
  assert.equal(sanitizeTalkbackTranscript("you"), null);
  assert.equal(sanitizeTalkbackTranscript("."), null);
});

test("measures silence as near-zero rms", () => {
  const silence = new Uint8Array(32).fill(128);
  assert.ok(rmsFromTimeDomain(silence) < 0.001);
  const loud = new Uint8Array(32);
  for (let index = 0; index < loud.length; index += 1) loud[index] = index % 2 === 0 ? 40 : 220;
  assert.ok(rmsFromTimeDomain(loud) > 0.2);
});

test("drops an immediate repeat of the same caption", () => {
  assert.equal(
    shouldDropRepeat({ text: "vocals up", at: 1_000 }, "vocals up", 4_000),
    true,
  );
  assert.equal(
    shouldDropRepeat({ text: "vocals up", at: 1_000 }, "vocals up", 12_000),
    false,
  );
});

test("recognizes production ministry and FOH positions", () => {
  assert.equal(hasProductionLiveAssignment([{ ministry_type: "production" }]), true);
  assert.equal(hasProductionLiveAssignment([{ position: "sound_tech", ministry_type: "weekend" }]), true);
  assert.equal(hasProductionLiveAssignment([{ ministry_type: "weekend", position: "vocalist" }]), false);
});
