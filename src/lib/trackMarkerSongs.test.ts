import assert from "node:assert/strict";
import test from "node:test";
import {
  markerHasTime,
  markerRowsForSongs,
  songsForTrackMarkers,
  withMissingSongMarkers,
} from "./trackMarkerSongs.ts";

const flow = [
  { id: "wind", title: "Wild Rushing Wind", sequenceOrder: 8 },
  { id: "spirit", title: "Holy Spirit", sequenceOrder: 9 },
  { id: "grateful", title: "God I'm Just Grateful", sequenceOrder: 10 },
];

test("keeps a song added on the service flow after the set was published", () => {
  const songs = songsForTrackMarkers(flow, [
    { id: "wind", title: "Wild Rushing Wind", sequenceOrder: 0 },
    { id: "grateful", title: "God I'm Just Grateful", sequenceOrder: 1 },
  ]);

  assert.deepEqual(
    songs.map((song) => song.title),
    ["Wild Rushing Wind", "Holy Spirit", "God I'm Just Grateful"],
  );
});

test("keeps a draft-set song that is not on the service flow yet", () => {
  const songs = songsForTrackMarkers(flow, [
    { id: "wind", title: "Wild Rushing Wind", sequenceOrder: 0 },
    { id: "father", title: "Run To The Father", sequenceOrder: 4 },
  ]);

  assert.equal(songs.at(-1)?.title, "Run To The Father");
});

test("adds an empty marker row for a song the upload did not place", () => {
  const rows = withMissingSongMarkers(
    [
      { id: "m1", songId: "wind", title: "Wild Rushing Wind", minutes: "0", seconds: "00" },
      { id: "m2", songId: "grateful", title: "God I'm Just Grateful", minutes: "6", seconds: "25" },
    ],
    flow,
  );

  assert.equal(rows.length, 3);
  assert.equal(rows[2]?.title, "Holy Spirit");
  assert.equal(rows[2]?.minutes, "");
  assert.equal(rows[2]?.seconds, "");
  assert.equal(markerHasTime(rows[2]!), false);
});

test("creates one blank marker row per song", () => {
  const rows = markerRowsForSongs(flow);
  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.map((row) => row.title),
    ["Wild Rushing Wind", "Holy Spirit", "God I'm Just Grateful"],
  );
  assert.equal(rows.every((row) => !markerHasTime(row)), true);
});
