import assert from "node:assert/strict";
import test from "node:test";
import { phraseLevelIsVoice, shouldTranscribePhrase } from "./talkbackPhrase.ts";

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
