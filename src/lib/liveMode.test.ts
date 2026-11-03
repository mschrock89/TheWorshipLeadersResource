import assert from "node:assert/strict";
import test from "node:test";
import {
  canUseLiveLineNotes,
  hasProductionLiveAssignment,
  hasVideoLiveAssignment,
  isListenerHosting,
  liveChatRoomOf,
  liveServiceMinistry,
  pickNextLiveService,
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

test("treats a fresh FOH or MON listener as the host", () => {
  const now = Date.parse("2026-10-04T12:00:00.000Z");
  assert.equal(
    isListenerHosting(
      {
        listener_client_id: "foh-screen",
        listener_station: "foh",
        listener_heartbeat: "2026-10-04T11:59:50.000Z",
      },
      now,
    ),
    true,
  );
  assert.equal(
    isListenerHosting(
      {
        listener_client_id: "mon-screen",
        listener_station: "mon",
        listener_heartbeat: "2026-10-04T11:59:50.000Z",
      },
      now,
    ),
    true,
  );
  assert.equal(
    isListenerHosting(
      {
        listener_client_id: "foh-screen",
        listener_station: "foh",
        listener_heartbeat: "2026-10-04T11:59:00.000Z",
      },
      now,
    ),
    false,
  );
});

test("keeps the video chat room separate from production", () => {
  assert.equal(liveChatRoomOf({ room: "video" }), "video");
  assert.equal(liveChatRoomOf({ room: "production" }), "production");
  assert.equal(liveChatRoomOf({}), "production");
});

test("live line notes stay with admins, production, and video", () => {
  assert.equal(
    canUseLiveLineNotes({ hasCapability: true, revoked: false, hasLiveTeamAssignment: false }),
    true,
  );
  assert.equal(
    canUseLiveLineNotes({ hasCapability: false, revoked: false, hasLiveTeamAssignment: true }),
    true,
  );
  assert.equal(
    canUseLiveLineNotes({ hasCapability: true, revoked: true, hasLiveTeamAssignment: true }),
    false,
  );
  assert.equal(
    canUseLiveLineNotes({ hasCapability: false, revoked: false, hasLiveTeamAssignment: false }),
    false,
  );
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

test("next live service skips today's services once they end", () => {
  const candidates = [
    { date: "2026-11-07", times: ["17:00"] },
    { date: "2026-11-08", times: ["11:00", "09:00"] },
    { date: "2026-11-15", times: ["09:00"] },
  ];
  assert.deepEqual(pickNextLiveService(candidates, "2026-11-03", 600), { ...candidates[0], startTime: "17:00" });
  assert.equal(pickNextLiveService(candidates, "2026-11-08", 8 * 60)?.startTime, "09:00");
  assert.equal(pickNextLiveService(candidates, "2026-11-08", 10 * 60 + 30)?.startTime, "09:00");
  assert.equal(pickNextLiveService(candidates, "2026-11-08", 11 * 60 + 1)?.startTime, "11:00");
  assert.equal(pickNextLiveService(candidates, "2026-11-08", 11 * 60 + 30)?.startTime, "11:00");
  assert.equal(pickNextLiveService(candidates, "2026-11-08", 13 * 60 + 30)?.date, "2026-11-15");
  assert.equal(pickNextLiveService([{ date: "2026-11-01", times: ["09:00"] }], "2026-11-03", 0), null);
});

test("next live service keeps an untimed date open all day", () => {
  const picked = pickNextLiveService(
    [
      { date: "2026-11-03", times: [] },
      { date: "2026-11-04", times: ["18:00"] },
    ],
    "2026-11-03",
    23 * 60,
  );
  assert.deepEqual(picked, { date: "2026-11-03", times: [], startTime: null });
});

test("production schedules open the worship service they support", () => {
  assert.equal(liveServiceMinistry("production"), "weekend");
  assert.equal(liveServiceMinistry("hs_production"), "encounter");
  assert.equal(liveServiceMinistry("worship_night"), "worship_night");
  assert.equal(liveServiceMinistry(null), null);
});
