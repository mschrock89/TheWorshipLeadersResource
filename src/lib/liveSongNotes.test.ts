import assert from "node:assert/strict";
import test from "node:test";
import { contiguousSongIds, readableSongNotes } from "./liveSongNotes.ts";

const flow = [
  { id: "pre", item_type: "header" },
  { id: "countdown", item_type: "item" },
  { id: "worship", item_type: "header" },
  { id: "song-a", item_type: "song" },
  { id: "song-b", item_type: "song" },
  { id: "song-c", item_type: "song" },
  { id: "message", item_type: "header" },
  { id: "sermon", item_type: "item" },
  { id: "response", item_type: "header" },
  { id: "closer", item_type: "song" },
];

test("opens the whole song run when Live is on any song in it", () => {
  assert.deepEqual(contiguousSongIds(flow, "song-b"), ["song-a", "song-b", "song-c"]);
  assert.deepEqual(contiguousSongIds(flow, "song-a"), ["song-a", "song-b", "song-c"]);
  assert.deepEqual(contiguousSongIds(flow, "closer"), ["closer"]);
});

test("stays closed before MIDI reaches a song", () => {
  assert.equal(contiguousSongIds(flow, null), null);
  assert.equal(contiguousSongIds(flow, "countdown"), null);
  assert.equal(contiguousSongIds(flow, "worship"), null);
  assert.equal(contiguousSongIds(flow, "missing"), null);
});

test("keeps mix and free notes and leaves section markers on the timeline", () => {
  const notes = readableSongNotes(["song-a", "song-b"], [
    { serviceFlowItemId: "song-a", kind: "mix", body: "Position 1 lead vocal" },
    { serviceFlowItemId: "song-a", kind: "section", body: "Chorus" },
    { serviceFlowItemId: "song-b", kind: "note", body: "  Watch the bridge  " },
    { serviceFlowItemId: "song-c", kind: "mix", body: "Closer vocal" },
    { serviceFlowItemId: "song-b", kind: "mix", body: "   " },
  ]);
  assert.deepEqual(
    notes.map((note) => note.body),
    ["Position 1 lead vocal", "  Watch the bridge  "],
  );
});
