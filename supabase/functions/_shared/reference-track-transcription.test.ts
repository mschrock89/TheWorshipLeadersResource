import assert from "node:assert/strict";
import test from "node:test";
import { chunkRanges } from "./reference-track-transcription.ts";

function frameAt(bytes: Uint8Array, index: number) {
  bytes[index] = 0xff;
  bytes[index + 1] = 0xfb;
  bytes[index + 2] = 0x90;
  bytes[index + 3] = 0x00;
}

test("an mp3 split starts the next piece on a frame", () => {
  const bytes = new Uint8Array(1000);
  frameAt(bytes, 0);
  frameAt(bytes, 420);
  frameAt(bytes, 860);

  const ranges = chunkRanges(bytes, 500, "audio/mpeg");

  assert.deepEqual(ranges, [
    { start: 0, end: 420 },
    { start: 420, end: 860 },
    { start: 860, end: 1000 },
  ]);
  assert.equal(bytes[ranges[1].start], 0xff);
  assert.equal(bytes[ranges[2].start], 0xff);
});

test("a short file stays one piece", () => {
  const bytes = new Uint8Array(40);
  frameAt(bytes, 0);
  assert.deepEqual(chunkRanges(bytes, 500, "audio/mpeg"), [{ start: 0, end: 40 }]);
});
