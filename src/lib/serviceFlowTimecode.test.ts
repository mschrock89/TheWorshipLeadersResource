import assert from "node:assert/strict";
import test from "node:test";
import { smpteSortKey } from "./smpteLtc.ts";
import {
  buildTimecodeWindows,
  flowTimecodeLabels,
  matchTimecodeWindow,
  parseNoteTimecode,
} from "./serviceFlowTimecode.ts";

const song = {
  id: "song",
  item_type: "song",
  notes: "TC 01:00:00:00\nStart on the chorus",
  duration_seconds: 240,
};
const welcome = {
  id: "welcome",
  item_type: "item",
  notes: "TC 10:00:00:00",
  duration_seconds: 180,
};
const sermon = {
  id: "sermon",
  item_type: "item",
  notes: "SMPTE 10:15:00:00-10:55:00:00",
  duration_seconds: null,
};

test("reads a SMPTE cue from a service flow note and ignores a clock time", () => {
  assert.deepEqual(parseNoteTimecode("Welcome at 10:30"), null);
  assert.deepEqual(parseNoteTimecode(song.notes)?.start, {
    hours: 1,
    minutes: 0,
    seconds: 0,
    frames: 0,
  });
  assert.equal(parseNoteTimecode(sermon.notes)?.end?.minutes, 55);
});

test("follows Playback during a song and ProPresenter once its timecode starts", () => {
  const windows = buildTimecodeWindows(
    [
      { id: "header", item_type: "header", notes: "TC 00:00:00:00", duration_seconds: 30 },
      song,
      welcome,
      sermon,
    ],
    30,
  );
  const duringSong = matchTimecodeWindow(windows, smpteSortKey({ hours: 1, minutes: 2, seconds: 0, frames: 0 }, 30));
  assert.equal(duringSong?.itemId, "song");
  assert.ok(duringSong && duringSong.progress > 0.49 && duringSong.progress < 0.51);

  const gap = matchTimecodeWindow(windows, smpteSortKey({ hours: 1, minutes: 5, seconds: 0, frames: 0 }, 30));
  assert.equal(gap, null);

  const duringWelcome = matchTimecodeWindow(windows, smpteSortKey({ hours: 10, minutes: 1, seconds: 0, frames: 0 }, 30));
  assert.equal(duringWelcome?.itemId, "welcome");

  const duringSermon = matchTimecodeWindow(windows, smpteSortKey({ hours: 10, minutes: 16, seconds: 0, frames: 0 }, 30));
  assert.equal(duringSermon?.itemId, "sermon");
});

test("assigns Playback songs every ten minutes from 01:00:00:00", () => {
  const songs = [1, 2, 3, 4].map((number) => ({
    id: `song-${number}`,
    item_type: "song",
    notes: null,
    duration_seconds: 240,
  }));
  const items = [
    { id: "header", item_type: "header", notes: null, duration_seconds: null },
    songs[0],
    { id: "welcome", item_type: "item", notes: null, duration_seconds: 30 },
    songs[1],
    songs[2],
    songs[3],
  ];
  const labels = flowTimecodeLabels(items);
  assert.equal(labels.get("song-1"), "TC 01:00:00:00");
  assert.equal(labels.get("song-2"), "TC 01:10:00:00");
  assert.equal(labels.get("song-3"), "TC 01:20:00:00");
  assert.equal(labels.get("song-4"), "TC 01:30:00:00");
  assert.equal(labels.get("welcome"), undefined);

  const windows = buildTimecodeWindows(items, 30);
  assert.equal(
    matchTimecodeWindow(windows, smpteSortKey({ hours: 1, minutes: 2, seconds: 0, frames: 0 }, 30))?.itemId,
    "song-1",
  );
  assert.equal(
    matchTimecodeWindow(windows, smpteSortKey({ hours: 1, minutes: 11, seconds: 0, frames: 0 }, 30))?.itemId,
    "song-2",
  );
  assert.equal(
    matchTimecodeWindow(windows, smpteSortKey({ hours: 1, minutes: 21, seconds: 0, frames: 0 }, 30))?.itemId,
    "song-3",
  );
  assert.equal(
    matchTimecodeWindow(windows, smpteSortKey({ hours: 1, minutes: 31, seconds: 0, frames: 0 }, 30))?.itemId,
    "song-4",
  );
});

test("hands a note without a duration to the next SMPTE cue", () => {
  const windows = buildTimecodeWindows(
    [
      { id: "pray", item_type: "item", notes: "tc 10:05:00", duration_seconds: null },
      { id: "song-2", item_type: "song", notes: "TC 02:00:00:00", duration_seconds: 200 },
    ],
    30,
  );
  const stillPraying = matchTimecodeWindow(windows, smpteSortKey({ hours: 10, minutes: 6, seconds: 0, frames: 0 }, 30));
  assert.equal(stillPraying?.itemId, "pray");
  const secondSong = matchTimecodeWindow(windows, smpteSortKey({ hours: 2, minutes: 0, seconds: 30, frames: 0 }, 30));
  assert.equal(secondSong?.itemId, "song-2");
});
