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
