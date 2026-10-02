const PHRASE_START_RMS = 0.02;
const PHRASE_HOLD_RMS = 0.01;
const PHRASE_END_SILENCE_MS = 1200;
const MIN_PHRASE_MS = 450;
const MAX_PHRASE_MS = 12000;

export function phraseLevelIsVoice(level: number, phraseOpen: boolean): boolean {
  return level >= (phraseOpen ? PHRASE_HOLD_RMS : PHRASE_START_RMS);
}

export function shouldTranscribePhrase(elapsedMs: number, quietMs: number): boolean {
  if (elapsedMs >= MAX_PHRASE_MS) return true;
  return elapsedMs >= MIN_PHRASE_MS && quietMs >= PHRASE_END_SILENCE_MS;
}
