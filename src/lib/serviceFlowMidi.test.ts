import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultLiveMidiCue,
  effectiveMidiCue,
  findMidiCueItem,
  formatStoredMidiCue,
  gatePlaybackSong,
  isPreServiceRestartCue,
  normalizeMidiFollowSettings,
  playbackHoldForMidiCue,
  midiCueMatches,
  midiNoteName,
  midiNoteNumber,
  notesWithMidiCue,
  notesWithoutMidiCue,
  parseMidiNoteOn,
  parseMidiNoteOns,
  parseNoteMidi,
} from "./serviceFlowMidi.ts";

test("names MIDI notes the way Playback lists them", () => {
  assert.equal(midiNoteName(0), "C-2");
  assert.equal(midiNoteName(43), "G1");
  assert.equal(midiNoteName(60), "C3");
  assert.equal(midiNoteNumber("G1"), 43);
  assert.equal(midiNoteNumber("C3"), 60);
  assert.equal(midiNoteNumber("Db3"), 61);
  assert.equal(midiNoteNumber("60"), 60);
});

test("reads a MIDI note and value from a service flow note", () => {
  assert.deepEqual(parseNoteMidi("Welcome\nMIDI C2 127"), { note: 48, velocity: 127 });
  assert.deepEqual(parseNoteMidi("MIDI 48"), { note: 48, velocity: null });
  assert.equal(parseNoteMidi("Check the MIDI cable"), null);
  assert.equal(formatStoredMidiCue({ note: 60, velocity: 127 }), "MIDI C3 127");
  assert.equal(notesWithoutMidiCue("Hold the walk\nMIDI C3 127"), "Hold the walk");
  assert.equal(notesWithMidiCue("Hold the walk\nMIDI C2 10", { note: 62, velocity: 100 }), "Hold the walk\nMIDI D3 100");
  assert.equal(notesWithMidiCue("MIDI C3 127", null), null);
});

test("matches the chosen channel, note, and value", () => {
  const cue = parseNoteMidi("MIDI C3 127");
  assert.ok(cue);
  assert.equal(midiCueMatches(cue, { channel: 1, note: 60, velocity: 127 }, 1), true);
  assert.equal(midiCueMatches(cue, { channel: 1, note: 60, velocity: 64 }, 1), false);
  assert.equal(midiCueMatches(cue, { channel: 2, note: 60, velocity: 127 }, 1), false);
  assert.equal(midiCueMatches({ note: 60, velocity: null }, { channel: 1, note: 60, velocity: 20 }, 1), true);
  assert.equal(parseMidiNoteOn([0x90, 60, 127])?.note, 60);
  assert.equal(parseMidiNoteOn([0x80, 60, 0]), null);
  assert.equal(parseMidiNoteOn([0x90, 60, 0]), null);
  assert.equal(parseMidiNoteOn([0xfe, 0x80, 60, 0, 0x90, 67, 100])?.note, 67);
  assert.deepEqual(
    parseMidiNoteOns([0x90, 7, 1, 0x80, 7, 0, 0x90, 7, 2]).map((event) => event.velocity),
    [1, 2],
  );

  const match = findMidiCueItem(
    [
      { id: "header", item_type: "header", notes: "MIDI C3 127" },
      { id: "welcome", item_type: "item", notes: "MIDI C3 127" },
      { id: "song", item_type: "song", notes: "MIDI D3 127" },
    ],
    { channel: 1, note: 60, velocity: 127 },
    1,
  );
  assert.equal(match?.id, "welcome");

  const slide = findMidiCueItem(
    [
      { id: "any", item_type: "item", notes: "MIDI G-2" },
      { id: "slide-2", item_type: "item", notes: "MIDI G-2 2" },
    ],
    { channel: 1, note: 7, velocity: 2 },
    1,
  );
  assert.equal(slide?.id, "slide-2");
});

test("maps G1 values 1 through 12 onto the service flow in order", () => {
  const items = [
    { id: "pre", item_type: "header", notes: null },
    { id: "ipod", item_type: "item", notes: null },
    { id: "preroll", item_type: "item", notes: null },
    { id: "announce", item_type: "header", notes: null },
    { id: "host", item_type: "item", notes: null },
    { id: "psa", item_type: "item", notes: "MIDI C3 9" },
  ];
  assert.deepEqual(defaultLiveMidiCue(0), { note: 43, velocity: 1 });
  assert.deepEqual(defaultLiveMidiCue(11), { note: 43, velocity: 12 });
  assert.equal(defaultLiveMidiCue(12), null);
  assert.deepEqual(effectiveMidiCue(null, 3), { note: 43, velocity: 4 });
  assert.deepEqual(effectiveMidiCue("MIDI C3 9", 3), { note: 60, velocity: 9 });

  assert.equal(
    findMidiCueItem(items, { channel: 1, note: 43, velocity: 1 }, 1)?.id,
    "ipod",
  );
  assert.equal(
    findMidiCueItem(items, { channel: 1, note: 43, velocity: 3 }, 1)?.id,
    "host",
  );
  assert.equal(
    findMidiCueItem(items, { channel: 1, note: 43, velocity: 4 }, 1)?.id,
    undefined,
  );
  assert.equal(
    findMidiCueItem(items, { channel: 1, note: 60, velocity: 9 }, 1)?.id,
    "psa",
  );
  assert.equal(isPreServiceRestartCue({ channel: 1, note: 43, velocity: 1 }, 1), true);
  assert.equal(isPreServiceRestartCue({ channel: 1, note: 43, velocity: 2 }, 1), false);
  assert.equal(isPreServiceRestartCue({ channel: 2, note: 43, velocity: 1 }, 1), false);
});

test("playlist MIDI notes stay with this screen and can be cleared", () => {
  const saved = normalizeMidiFollowSettings({ channel: 2, inputId: "bus-1" });
  assert.deepEqual(saved.preServiceCue, { note: 43, velocity: 1 });
  assert.equal(saved.endServiceCue, null);

  const chosen = normalizeMidiFollowSettings({
    channel: 2,
    inputId: "bus-1",
    preServiceCue: { note: 60, velocity: 12 },
    endServiceCue: { note: 62, velocity: null },
  });
  assert.equal(chosen.channel, 2);
  assert.deepEqual(chosen.preServiceCue, { note: 60, velocity: 12 });
  assert.deepEqual(chosen.endServiceCue, { note: 62, velocity: null });

  const cleared = normalizeMidiFollowSettings({
    preServiceCue: null,
    endServiceCue: { note: 200, velocity: 1 },
  });
  assert.equal(cleared.preServiceCue, null);
  assert.equal(cleared.endServiceCue, null);
});

test("keeps a MIDI cue while Playback is still on the same song", () => {
  const items = [
    { id: "song-1", item_type: "song" },
    { id: "prayer", item_type: "item" },
    { id: "song-2", item_type: "song" },
  ];
  const prayer = playbackHoldForMidiCue(
    { playbackSongId: "song-1", currentId: "song-1" },
    items,
    { id: "prayer", item_type: "item" },
  );
  assert.equal(prayer.hold, true);
  assert.equal(prayer.playbackSongId, "song-1");
  const stillOnSong = gatePlaybackSong(
    { currentId: "prayer", lastSongId: prayer.playbackSongId, hold: prayer.hold },
    "song-1",
  );
  assert.equal(stillOnSong.take, false);
  assert.equal(stillOnSong.currentId, "prayer");

  const nextSong = playbackHoldForMidiCue(
    { playbackSongId: "song-1", currentId: "song-1" },
    items,
    { id: "song-2", item_type: "song" },
  );
  assert.equal(nextSong.hold, true);
  assert.equal(nextSong.playbackSongId, "song-1");
  const notYanked = gatePlaybackSong(
    { currentId: "song-2", lastSongId: nextSong.playbackSongId, hold: nextSong.hold },
    "song-1",
  );
  assert.equal(notYanked.take, false);
  assert.equal(notYanked.currentId, "song-2");
});

test("holds a MIDI line until playback enters the next song", () => {
  const firstSong = gatePlaybackSong({ currentId: "welcome", lastSongId: null, hold: true }, "song-1");
  assert.equal(firstSong.take, true);
  assert.equal(firstSong.currentId, "song-1");
  assert.equal(firstSong.hold, false);

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
