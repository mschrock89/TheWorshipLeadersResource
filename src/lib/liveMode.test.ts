import assert from "node:assert/strict";
import test from "node:test";
import {
  hasProductionLiveAssignment,
  hasVideoLiveAssignment,
  liveChatRoomOf,
  resolveLiveAudience,
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

test("recognizes video ministry and camera positions", () => {
  assert.equal(hasVideoLiveAssignment([{ ministry_type: "video" }]), true);
  assert.equal(hasVideoLiveAssignment([{ position: "tri_pod_camera", ministry_type: "weekend" }]), true);
  assert.equal(hasVideoLiveAssignment([{ position: "director" }]), true);
  assert.equal(hasVideoLiveAssignment([{ ministry_type: "weekend", position: "vocalist" }]), false);
  assert.equal(hasVideoLiveAssignment([{ position: "sound_tech" }]), false);
});

test("keeps the video chat room separate from production", () => {
  assert.equal(liveChatRoomOf({ room: "video" }), "video");
  assert.equal(liveChatRoomOf({ room: "production" }), "production");
  assert.equal(liveChatRoomOf({}), "production");
});

test("video team only gets the video live view", () => {
  assert.equal(
    resolveLiveAudience({
      isAdmin: false,
      isProductionManager: false,
      isVideoDirector: false,
      rows: [{ ministry_type: "video", position: "director" }],
    }),
    "video",
  );
  assert.equal(
    resolveLiveAudience({
      isAdmin: false,
      isProductionManager: false,
      isVideoDirector: true,
      rows: [{ ministry_type: "production", position: "sound_tech" }],
    }),
    "video",
  );
  assert.equal(
    resolveLiveAudience({
      isAdmin: false,
      isProductionManager: false,
      isVideoDirector: false,
      rows: [{ ministry_type: "production", position: "sound_tech" }],
    }),
    "production",
  );
  assert.equal(
    resolveLiveAudience({
      isAdmin: true,
      isProductionManager: true,
      isVideoDirector: true,
      rows: [{ ministry_type: "video" }],
    }),
    "production",
  );
});
