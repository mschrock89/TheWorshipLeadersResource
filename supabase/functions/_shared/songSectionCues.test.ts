import assert from "node:assert/strict";
import test from "node:test";
import { detectSongSectionGroups, type SectionTranscript } from "./songSectionCues.ts";

const markers = [
  { title: "Great I Am", timestampSeconds: 10, sequenceOrder: 0 },
  { title: "Build My Life", timestampSeconds: 200, sequenceOrder: 1 },
];

function segments(entries: Array<[number, number, string]>): SectionTranscript {
  return {
    segments: entries.map(([start, end, text]) => ({ start, end, text })),
  };
}

test("drops spoken section calls inside each song marker window", () => {
  const groups = detectSongSectionGroups(
    segments([
      [12, 13, "Intro"],
      [40, 41, "Verse"],
      [41.2, 48, "You are the Lord"],
      [90, 91.2, "Pre-Chorus"],
      [120, 121, "Chorus"],
      [150, 151.4, "Instrumental"],
      [205, 206, "Intro"],
      [240, 241.2, "Verse two"],
    ]),
    markers,
    400,
  );

  assert.deepEqual(groups, [
    {
      title: "Great I Am",
      sections: [
        { offsetSeconds: 2, label: "Intro" },
        { offsetSeconds: 30, label: "Verse" },
        { offsetSeconds: 80, label: "Pre-Chorus" },
        { offsetSeconds: 110, label: "Chorus" },
        { offsetSeconds: 140, label: "Instrumental" },
      ],
    },
    {
      title: "Build My Life",
      sections: [
        { offsetSeconds: 5, label: "Intro" },
        { offsetSeconds: 40, label: "Verse 2" },
      ],
    },
  ]);
});

test("ignores section words buried in lyric lines", () => {
  const groups = detectSongSectionGroups(
    segments([
      [12, 16, "and the chorus of heaven sings"],
      [30, 33, "chorus of heaven"],
      [50, 51, "Chorus"],
    ]),
    [{ title: "Holy", timestampSeconds: 0, sequenceOrder: 0 }],
    120,
  );

  assert.deepEqual(groups[0].sections, [{ offsetSeconds: 50, label: "Chorus" }]);
});

test("keeps a cue glued to the first lyric word after a pause", () => {
  const groups = detectSongSectionGroups(
    segments([
      [8, 9, "ready"],
      [12, 14, "Chorus hallelujah"],
      [14.2, 16, "Chorus hallelujah"],
    ]),
    [{ title: "Holy", timestampSeconds: 0, sequenceOrder: 0 }],
    80,
  );

  assert.deepEqual(groups[0].sections, [{ offsetSeconds: 12, label: "Chorus" }]);
});

test("ignores a spoken list of section names", () => {
  const groups = detectSongSectionGroups(
    segments([[15, 18, "Intro verse chorus"]]),
    [{ title: "Holy", timestampSeconds: 0, sequenceOrder: 0 }],
    60,
  );

  assert.deepEqual(groups[0].sections, []);
});

test("collapses a cue whisper hears twice", () => {
  const groups = detectSongSectionGroups(
    segments([
      [40, 40.6, "Chorus"],
      [40.8, 41.2, "Chorus."],
      [70, 71, "Bridge"],
    ]),
    [{ title: "Holy", timestampSeconds: 0, sequenceOrder: 0 }],
    120,
  );

  assert.deepEqual(groups[0].sections, [
    { offsetSeconds: 40, label: "Chorus" },
    { offsetSeconds: 70, label: "Bridge" },
  ]);
});

test("a call before the first song marker is not a section", () => {
  const groups = detectSongSectionGroups(
    segments([
      [2, 3, "Intro"],
      [15, 16, "Verse"],
    ]),
    [{ title: "Holy", timestampSeconds: 10, sequenceOrder: 0 }],
    80,
  );

  assert.deepEqual(groups[0].sections, [{ offsetSeconds: 5, label: "Verse" }]);
});

test("the call at the next song marker belongs to that song", () => {
  const groups = detectSongSectionGroups(
    segments([[200, 201, "Intro"]]),
    markers,
    400,
  );

  assert.deepEqual(groups[0].sections, []);
  assert.deepEqual(groups[1].sections, [{ offsetSeconds: 0, label: "Intro" }]);
});

test("hears isolated misheard cue words and numbered calls", () => {
  const groups = detectSongSectionGroups(
    segments([
      [5, 6, "Course"],
      [20, 21, "Inst"],
      [40, 41.4, "first verse"],
      [70, 71.5, "Big chorus"],
      [100, 103, "of course we sing"],
    ]),
    [{ title: "Holy", timestampSeconds: 0, sequenceOrder: 0 }],
    140,
  );

  assert.deepEqual(groups[0].sections, [
    { offsetSeconds: 5, label: "Chorus" },
    { offsetSeconds: 20, label: "Instrumental" },
    { offsetSeconds: 40, label: "Verse 1" },
    { offsetSeconds: 70, label: "Big Chorus" },
  ]);
});

test("keeps a pre-chorus and chorus a few seconds apart", () => {
  const groups = detectSongSectionGroups(
    segments([
      [20, 21, "Pre-Chorus"],
      [24.2, 25, "Chorus"],
    ]),
    [{ title: "Holy", timestampSeconds: 0, sequenceOrder: 0 }],
    80,
  );

  assert.deepEqual(groups[0].sections, [
    { offsetSeconds: 20, label: "Pre-Chorus" },
    { offsetSeconds: 24, label: "Chorus" },
  ]);
});

test("reads guide calls from word timestamps, including a count-in", () => {
  const groups = detectSongSectionGroups(
    {
      segments: [{ start: 19, end: 99, text: "Verse one. Pre-chorus. Chorus. Hallelujah." }],
      words: [
        { word: "Verse", start: 19.3, end: 19.7 },
        { word: "one", start: 19.8, end: 20.1 },
        { word: "Pre-chorus", start: 71.9, end: 72.7 },
        { word: "Chorus", start: 98.2, end: 98.7 },
        { word: "Hallelujah", start: 102.4, end: 103.1 },
        { word: "Verse", start: 385.8, end: 386.3 },
        { word: "2", start: 386.8, end: 387.0 },
        { word: "3", start: 387.7, end: 387.9 },
        { word: "4", start: 388.5, end: 388.8 },
        { word: "and", start: 400, end: 400.2 },
        { word: "the", start: 400.3, end: 400.4 },
        { word: "chorus", start: 400.5, end: 400.8 },
        { word: "of", start: 400.9, end: 401 },
        { word: "heaven", start: 401.1, end: 401.4 },
      ],
    },
    [
      { title: "Wild Rushing Wind", timestampSeconds: 0, sequenceOrder: 0 },
      { title: "Grateful", timestampSeconds: 385, sequenceOrder: 1 },
    ],
    500,
  );

  assert.deepEqual(groups[0].sections, [
    { offsetSeconds: 19, label: "Verse 1" },
    { offsetSeconds: 72, label: "Pre-Chorus" },
    { offsetSeconds: 98, label: "Chorus" },
  ]);
  assert.deepEqual(groups[1].sections, [{ offsetSeconds: 1, label: "Verse" }]);
});

test("uses the word timestamp when the segment starts late", () => {
  const groups = detectSongSectionGroups(
    {
      segments: [{ start: 30.8, end: 31.6, text: "Chorus" }],
      words: [{ word: " Chorus", start: 30.1, end: 30.6 }],
    },
    [{ title: "Holy", timestampSeconds: 10, sequenceOrder: 0 }],
    90,
  );

  assert.deepEqual(groups[0].sections, [{ offsetSeconds: 20, label: "Chorus" }]);
});
