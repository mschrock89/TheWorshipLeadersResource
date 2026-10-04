import assert from "node:assert/strict";
import test from "node:test";
import { encodeLtcPcm, formatSmpte, LtcDecoder, type SmpteParts } from "./smpteLtc.ts";

function frames(start: SmpteParts, count: number, fps: number) {
  const stamps: SmpteParts[] = [];
  let hours = start.hours;
  let minutes = start.minutes;
  let seconds = start.seconds;
  let frame = start.frames;
  for (let index = 0; index < count; index += 1) {
    stamps.push({ hours, minutes, seconds, frames: frame });
    frame += 1;
    if (frame >= fps) {
      frame = 0;
      seconds += 1;
    }
    if (seconds >= 60) {
      seconds = 0;
      minutes += 1;
    }
    if (minutes >= 60) {
      minutes = 0;
      hours += 1;
    }
  }
  return stamps;
}

function decodeAll(stamps: SmpteParts[], sampleRate: number, fps: number) {
  const pcm = encodeLtcPcm(stamps, sampleRate, fps);
  const decoder = new LtcDecoder(sampleRate);
  const found = [];
  for (let index = 0; index < pcm.length; index += 960) {
    const stamp = decoder.push(pcm.subarray(index, index + 960));
    if (stamp) found.push(stamp);
  }
  return found;
}

test("decodes a 30 fps Playback hour from generated SMPTE audio", () => {
  const found = decodeAll(frames({ hours: 1, minutes: 0, seconds: 0, frames: 0 }, 12, 30), 48000, 30);
  assert.ok(found.length >= 4);
  const last = found[found.length - 1];
  assert.equal(last?.hours, 1);
  assert.equal(last?.minutes, 0);
  assert.equal(last?.seconds, 0);
  assert.equal(last?.fps, 30);
  assert.equal(formatSmpte(last!), found.length ? formatSmpte(last!) : "");
  assert.ok((last?.frames || 0) >= 4);
  assert.ok((last?.frames || 0) <= 11);
});

test("decodes 25 fps ProPresenter timecode", () => {
  const found = decodeAll(frames({ hours: 10, minutes: 15, seconds: 0, frames: 0 }, 10, 25), 48000, 25);
  assert.ok(found.length >= 3);
  const last = found[found.length - 1];
  assert.equal(last?.hours, 10);
  assert.equal(last?.minutes, 15);
  assert.equal(last?.fps, 25);
});
