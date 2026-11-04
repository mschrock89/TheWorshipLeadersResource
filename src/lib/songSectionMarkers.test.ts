import assert from "node:assert/strict";
import test from "node:test";
import { matchSectionsToFlowSongs, normalizeSongMarkerTitle, pickTracksMp3 } from "./songSectionMarkers.ts";

test("normalizes song marker titles the way service flow songs are matched", () => {
  assert.equal(normalizeSongMarkerTitle("Great I Am (feat. Worship)"), "great i am");
  assert.equal(normalizeSongMarkerTitle("Build My Life!"), "build my life");
});

test("uses the Tracks MP3 with the most song markers", () => {
  const picked = pickTracksMp3([
    { id: "short", sequenceOrder: 0, markerCount: 2 },
    { id: "full", sequenceOrder: 2, markerCount: 6 },
    { id: "empty", sequenceOrder: 1, markerCount: 0 },
  ]);
  assert.equal(picked?.id, "full");
});

test("breaks a marker-count tie toward the earlier track", () => {
  const picked = pickTracksMp3([
    { id: "later", sequenceOrder: 3, markerCount: 4 },
    { id: "earlier", sequenceOrder: 1, markerCount: 4 },
  ]);
  assert.equal(picked?.id, "earlier");
});

test("matches section cues to flow songs by title", () => {
  const matched = matchSectionsToFlowSongs(
    [
      { id: "song-b", title: "Build My Life" },
      { id: "song-a", title: "Great I Am (Live)" },
    ],
    [
      { title: "Great I Am", sections: [{ offsetSeconds: 0, label: "Intro" }] },
      { title: "Build My Life", sections: [{ offsetSeconds: 48, label: "Chorus" }] },
    ],
  );

  assert.deepEqual(matched.itemIds, ["song-b", "song-a"]);
  assert.deepEqual(matched.cues, [
    { serviceFlowItemId: "song-b", offsetSeconds: 48, body: "Chorus" },
    { serviceFlowItemId: "song-a", offsetSeconds: 0, body: "Intro" },
  ]);
});

test("gives a repeated song title the next matching marker", () => {
  const matched = matchSectionsToFlowSongs(
    [
      { id: "first", title: "Holy" },
      { id: "second", title: "Holy" },
    ],
    [
      { title: "Holy", sections: [{ offsetSeconds: 0, label: "Intro" }] },
      { title: "Holy", sections: [{ offsetSeconds: 12, label: "Verse" }] },
    ],
  );

  assert.equal(matched.cues[0].serviceFlowItemId, "first");
  assert.equal(matched.cues[0].body, "Intro");
  assert.equal(matched.cues[1].serviceFlowItemId, "second");
  assert.equal(matched.cues[1].body, "Verse");
});

test("falls back to marker order when no titles match", () => {
  const matched = matchSectionsToFlowSongs(
    [
      { id: "one", title: "Something Else" },
      { id: "two", title: "Another Song" },
    ],
    [
      { title: "Great I Am", sections: [{ offsetSeconds: 4, label: "Verse" }] },
      { title: "Build My Life", sections: [{ offsetSeconds: 9, label: "Chorus" }] },
    ],
  );

  assert.deepEqual(
    matched.cues.map((cue) => cue.serviceFlowItemId),
    ["one", "two"],
  );
});

test("does not borrow another song's cues when some titles already match", () => {
  const matched = matchSectionsToFlowSongs(
    [
      { id: "known", title: "Build My Life" },
      { id: "unknown", title: "Something Else" },
    ],
    [
      { title: "Great I Am", sections: [{ offsetSeconds: 4, label: "Verse" }] },
      { title: "Build My Life", sections: [{ offsetSeconds: 9, label: "Chorus" }] },
    ],
  );

  assert.deepEqual(matched.itemIds, ["known"]);
  assert.equal(matched.cues.length, 1);
  assert.equal(matched.cues[0].body, "Chorus");
});
