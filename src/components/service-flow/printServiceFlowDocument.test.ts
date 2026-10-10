import assert from "node:assert/strict";
import test from "node:test";
import { buildPrintHtml } from "./printServiceFlowDocument.ts";

test("printed service flow omits timecode and MIDI cues", () => {
  const html = buildPrintHtml({
    title: "Sunday",
    date: "2026-10-11",
    totalTime: "01:00:00",
    sections: [
      {
        id: "worship",
        title: "Worship",
        notes: "Hold the walk\nMIDI C4 127\nTC 01:00:00:00",
        items: [
          {
            id: "welcome",
            title: "Welcome",
            type: "other",
            duration: "05:00",
            smpte: "TC 01:10:00:00",
            notes: "Open with prayer\nMIDI D4 127\nTC 01:10:00:00",
          },
        ],
      },
    ],
  });

  assert.equal(html.includes("TC "), false);
  assert.equal(html.includes("MIDI"), false);
  assert.equal(html.includes("Hold the walk"), true);
  assert.equal(html.includes("Open with prayer"), true);
  assert.equal(html.includes("Welcome"), true);
});
