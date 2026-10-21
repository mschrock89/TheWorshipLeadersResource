import assert from "node:assert/strict";
import test from "node:test";
import {
  fallbackPlaylistPeriod,
  formatTrackOffset,
  serviceAudioFile,
  playlistPlaybackPlan,
  trackTitleFromFileName,
} from "./preServicePlaylist.ts";

const preRoll = Date.parse("2026-10-19T08:54:00");

test("the playlist opens early enough that the last song ends as pre-roll starts", () => {
  const durations = [3 * 60_000, 4 * 60_000];
  const early = playlistPlaybackPlan(durations, Date.parse("2026-10-19T08:40:00"), preRoll);
  assert.equal(early.finished, false);
  assert.equal(early.trackIndex, 0);
  assert.equal(early.offsetMs, 0);
  assert.equal(early.startAtMs, preRoll - 7 * 60_000);

  const intoFirst = playlistPlaybackPlan(durations, Date.parse("2026-10-19T08:48:00"), preRoll);
  assert.equal(intoFirst.trackIndex, 0);
  assert.equal(intoFirst.offsetMs, 60_000);

  const intoLast = playlistPlaybackPlan(durations, Date.parse("2026-10-19T08:51:00"), preRoll);
  assert.equal(intoLast.trackIndex, 1);
  assert.equal(intoLast.offsetMs, 60_000);

  const done = playlistPlaybackPlan(durations, preRoll, preRoll);
  assert.equal(done.finished, true);
});

test("an empty playlist does not invent a start position", () => {
  const plan = playlistPlaybackPlan([], Date.parse("2026-10-19T08:00:00"), preRoll);
  assert.equal(plan.finished, true);
  assert.equal(plan.totalMs, 0);
});

test("trimester fallback splits the year into three saved periods", () => {
  assert.deepEqual(fallbackPlaylistPeriod("2026-02-10"), { year: 2026, trimester: 1 });
  assert.deepEqual(fallbackPlaylistPeriod("2026-06-01"), { year: 2026, trimester: 2 });
  assert.deepEqual(fallbackPlaylistPeriod("2026-10-19"), { year: 2026, trimester: 3 });
});

test("mp3 and m4a files become track titles", () => {
  assert.deepEqual(serviceAudioFile({ name: "Oceans.mp3", type: "" }), {
    extension: "mp3",
    contentType: "audio/mpeg",
  });
  assert.deepEqual(serviceAudioFile({ name: "Oceans.m4a", type: "audio/mp4" }), {
    extension: "m4a",
    contentType: "audio/mp4",
  });
  assert.deepEqual(serviceAudioFile({ name: "Oceans.M4A", type: "" }), {
    extension: "m4a",
    contentType: "audio/mp4",
  });
  assert.equal(serviceAudioFile({ name: "clip.mp4", type: "audio/mp4" }), null);
  assert.equal(serviceAudioFile({ name: "notes.txt", type: "text/plain" }), null);
  assert.equal(trackTitleFromFileName("Pre Service/Great Are You Lord.mp3"), "Great Are You Lord");
  assert.equal(trackTitleFromFileName("Pre Service/Great Are You Lord.m4a"), "Great Are You Lord");
  assert.equal(formatTrackOffset(72_400), "1:12");
});
