import assert from "node:assert/strict";
import test from "node:test";
import { splitterChannelCount, talkbackTapAttempts, talkbackTapOptionSets, talkbackTapOptions, widenInputSource } from "./systemAudioInputs.ts";
import { nextNoiseFloor, phraseLevelIsVoice, shouldTranscribePhrase, talkbackMeterLevel } from "./talkbackPhrase.ts";
import { downsampleMono, encodeMonoWav } from "./talkbackCapture.ts";

test("holds a phrase open through a mid-phrase pause", () => {
  assert.equal(shouldTranscribePhrase(2000, 700), false);
  assert.equal(shouldTranscribePhrase(2000, 1199), false);
});

test("sends the phrase once the speaker has finished", () => {
  assert.equal(shouldTranscribePhrase(1800, 1200), true);
  assert.equal(shouldTranscribePhrase(400, 1200), false);
});

test("cuts only after the phrase has run the full safety limit", () => {
  assert.equal(shouldTranscribePhrase(11999, 0), false);
  assert.equal(shouldTranscribePhrase(12000, 0), true);
});

test("keeps soft speech inside an open phrase", () => {
  assert.equal(phraseLevelIsVoice(0.015, false), false);
  assert.equal(phraseLevelIsVoice(0.015, true), true);
  assert.equal(phraseLevelIsVoice(0.009, true), false);
});

test("ignores hiss that never rises above the channel noise floor", () => {
  assert.equal(phraseLevelIsVoice(0.02, false, 0.01), false);
  assert.equal(phraseLevelIsVoice(0.04, false, 0.01), true);
  assert.equal(nextNoiseFloor(0.01, 0.01, true), 0.01);
});

test("widens a node only when it can hold every reported channel", () => {
  const source = {
    channelCount: 2,
    maxChannelCount: 32,
    channelCountMode: "max",
    channelInterpretation: "speakers",
  };
  assert.equal(widenInputSource(source as unknown as AudioNode, 16), 16);
  assert.equal(source.channelCount, 16);
  assert.equal(source.channelCountMode, "explicit");
  assert.equal(source.channelInterpretation, "discrete");
});

test("does not clamp a 48-channel track onto a smaller explicit count", () => {
  const source = {
    channelCount: 2,
    maxChannelCount: 32,
    channelCountMode: "max",
    channelInterpretation: "speakers",
  };
  assert.equal(widenInputSource(source as unknown as AudioNode, 48), 2);
  assert.equal(source.channelCount, 2);
  assert.equal(source.channelCountMode, "max");
});

test("keeps the node stereo when it refuses a wider channel count", () => {
  let count = 2;
  const source = {
    maxChannelCount: 2,
    channelCountMode: "max",
    channelInterpretation: "speakers",
    get channelCount() {
      return count;
    },
    set channelCount(value: number) {
      if (value > 2) throw new Error("IndexSizeError");
      count = value;
    },
  };
  assert.equal(widenInputSource(source as unknown as AudioNode, 48), 2);
  assert.equal(source.channelCountMode, "max");
  assert.equal(source.channelInterpretation, "speakers");
});

test("splits a MADI tap one-to-one before it will mix channels down", () => {
  assert.deepEqual(talkbackTapAttempts(48), [48, 32, 24, 16, 8, 2, 1]);
  const options = talkbackTapOptions(48);
  assert.equal(options.channelCount, 48);
  assert.equal(options.channelCountMode, "explicit");
  assert.equal(options.channelInterpretation, "discrete");
  assert.deepEqual(options.outputChannelCount, [48]);
  const [first] = talkbackTapOptionSets(48);
  assert.equal(first.channelCountMode, "max");
  assert.equal(first.channelInterpretation, "discrete");
  assert.deepEqual(first.outputChannelCount, [48]);
});

test("shows talkback level instead of the gap above the noise floor", () => {
  assert.equal(talkbackMeterLevel(0), 0);
  assert.equal(talkbackMeterLevel(0.125), 0.5);
  assert.equal(talkbackMeterLevel(0.5), 1);
});

test("splits a 48-input track even when the audio node still says stereo", () => {
  assert.equal(splitterChannelCount(48, 2), 32);
  assert.equal(splitterChannelCount(2, 2), 2);
});

test("downsamples a multichannel frame to the transcription rate", () => {
  const samples = new Float32Array([0, 0.5, 1, 0.5, 0, -0.5]);
  const down = downsampleMono(samples, 48000, 16000);
  assert.equal(down.length, 2);
});

test("writes a mono wav small enough to transcribe", async () => {
  const wav = encodeMonoWav(new Float32Array(16000), 16000);
  const bytes = new Uint8Array(await wav.arrayBuffer());
  assert.equal(String.fromCharCode(...bytes.slice(0, 4)), "RIFF");
  assert.equal(wav.type, "audio/wav");
  assert.equal(wav.size, 44 + 32000);
});
