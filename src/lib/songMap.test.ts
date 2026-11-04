import assert from "node:assert/strict";
import test from "node:test";
import { activeSongMapCue, formatSongMapTime, songMapKindLabel, songMapOffsetFromRatio, songMapSectionAbbrev } from "./songMap.ts";

test("formats a song map clock", () => {
  assert.equal(formatSongMapTime(0), "0:00");
  assert.equal(formatSongMapTime(65), "1:05");
  assert.equal(formatSongMapTime(259), "4:19");
});

test("places a note from a click along the song", () => {
  assert.equal(songMapOffsetFromRatio(0, 259), 0);
  assert.equal(songMapOffsetFromRatio(0.5, 259), 130);
  assert.equal(songMapOffsetFromRatio(1.4, 259), 259);
  assert.equal(songMapOffsetFromRatio(0.5, 0), 0);
});

test("section markers use a short timeline label", () => {
  assert.equal(songMapKindLabel("section"), "Section");
  assert.equal(songMapSectionAbbrev("Chorus"), "C");
  assert.equal(songMapSectionAbbrev("Verse 2"), "V2");
  assert.equal(songMapSectionAbbrev("Pre-Chorus"), "Pre");
  assert.equal(songMapSectionAbbrev("Instrumental"), "Inst");
});

test("the prompt is the latest cue the playhead has reached", () => {
  const cues = [
    { id: "intro", offsetSeconds: 0, body: "Pads in" },
    { id: "vocal", offsetSeconds: 45, body: "Vocal up" },
    { id: "bridge", offsetSeconds: 150, body: "Open the room" },
  ];

  assert.equal(activeSongMapCue(cues, -1), null);
  assert.equal(activeSongMapCue(cues, 10)?.id, "intro");
  assert.equal(activeSongMapCue(cues, 45)?.id, "vocal");
  assert.equal(activeSongMapCue(cues, 200)?.id, "bridge");
});
