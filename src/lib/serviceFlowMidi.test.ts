import assert from "node:assert/strict";
import test from "node:test";
import {
  findMidiCueItem,
  formatStoredMidiCue,
  gatePlaybackSong,
  midiCueMatches,
  midiNoteName,
  midiNoteNumber,
  notesWithMidiCue,
  notesWithoutMidiCue,
  parseMidiNoteOn,
  parseNoteMidi,
} from "./serviceFlowMidi.ts";

test("names MIDI notes the way ProPresenter lists them", () => {
  assert.equal(midiNoteName(0), "C-1");
  assert.equal(midiNoteName(60), "C4");
  assert.equal(midiNoteNumber("C4"), 60);
  assert.equal(midiNoteNumber("Db4"), 61);
  assert.equal(midiNoteNumber("60"), 60);
});

test("reads a MIDI note and value from a service flow note", () => {
  assert.deepEqual(parseNoteMidi("Welcome\nMIDI C3 127"), { note: 48, velocity: 127 });
  assert.deepEqual(parseNoteMidi("MIDI 48"), { note: 48, velocity: null });
  assert.equal(parseNoteMidi("Check the MIDI cable"), null);
  assert.equal(formatStoredMidiCue({ note: 60, velocity: 127 }), "MIDI C4 127");
  assert.equal(notesWithoutMidiCue("Hold the walk\nMIDI C4 127"), "Hold the walk");
  assert.equal(notesWithMidiCue("Hold the walk\nMIDI C3 10", { note: 62, velocity: 100 }), "Hold the walk\nMIDI D4 100");
  assert.equal(notesWithMidiCue("MIDI C4 127", null), null);
});

test("matches the chosen channel, note, and value", () => {
  const cue = parseNoteMidi("MIDI C4 127");
  assert.ok(cue);
  assert.equal(midiCueMatches(cue, { channel: 1, note: 60, velocity: 127 }, 1), true);
  assert.equal(midiCueMatches(cue, { channel: 1, note: 60, velocity: 64 }, 1), false);
  assert.equal(midiCueMatches(cue, { channel: 2, note: 60, velocity: 127 }, 1), false);
  assert.equal(midiCueMatches({ note: 60, velocity: null }, { channel: 1, note: 60, velocity: 20 }, 1), true);
  assert.equal(parseMidiNoteOn([0x90, 60, 127])?.note, 60);
  assert.equal(parseMidiNoteOn([0x80, 60, 0]), null);
  assert.equal(parseMidiNoteOn([0x90, 60, 0]), null);

  const match = findMidiCueItem(
    [
      { id: "header", item_type: "header", notes: "MIDI C4 127" },
      { id: "welcome", item_type: "item", notes: "MIDI C4 127" },
      { id: "song", item_type: "song", notes: "MIDI D4 127" },
    ],
    { channel: 1, note: 60, velocity: 127 },
    1,
  );
  assert.equal(match?.id, "welcome");
});

test("holds a MIDI line until playback enters the next song", () => {
  const held = gatePlaybackSong({ currentId: "welcome", lastSongId: null, hold: true }, "song-1");
  assert.equal(held.take, false);
  assert.equal(held.lastSongId, "song-1");

  const stillHeld = gatePlaybackSong(
    { currentId: "welcome", lastSongId: "song-1", hold: true },
    "song-1",
  );
  assert.equal(stillHeld.take, false);
  assert.equal(stillHeld.currentId, "welcome");

  const nextSong = gatePlaybackSong(
    { currentId: "welcome", lastSongId: "song-1", hold: true },
    "song-2",
  );
  assert.equal(nextSong.take, true);
  assert.equal(nextSong.currentId, "song-2");
  assert.equal(nextSong.hold, false);
});
