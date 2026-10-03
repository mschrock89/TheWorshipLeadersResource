import assert from "node:assert/strict";
import test from "node:test";
import { widenInputSource } from "./systemAudioInputs.ts";
import { phraseLevelIsVoice, shouldTranscribePhrase } from "./talkbackPhrase.ts";
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

test("widens a stereo input node to the interface channel count", () => {
  const source = {
    channelCount: 2,
    maxChannelCount: 32,
    channelCountMode: "max",
    channelInterpretation: "speakers",
  };
  assert.equal(widenInputSource(source as unknown as AudioNode, 48), 32);
  assert.equal(source.channelCount, 32);
  assert.equal(source.channelCountMode, "explicit");
  assert.equal(source.channelInterpretation, "discrete");
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
