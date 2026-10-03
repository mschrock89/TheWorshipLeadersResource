const PHRASE_START_RMS = 0.02;
const PHRASE_HOLD_RMS = 0.01;
const PHRASE_END_SILENCE_MS = 1200;
const MIN_PHRASE_MS = 450;
const MAX_PHRASE_MS = 12000;

export function phraseLevelIsVoice(level: number, phraseOpen: boolean, floor = 0): boolean {
  const absolute = phraseOpen ? PHRASE_HOLD_RMS : PHRASE_START_RMS;
  const aboveFloor = floor > 0 ? floor * (phraseOpen ? 2 : 3.5) : 0;
  return level >= Math.max(absolute, aboveFloor);
}

export function nextNoiseFloor(floor: number, level: number, speaking: boolean) {
  if (speaking) return floor;
  if (floor <= 0) return level;
  return floor * 0.92 + level * 0.08;
}

export function shouldTranscribePhrase(elapsedMs: number, quietMs: number): boolean {
  if (elapsedMs >= MAX_PHRASE_MS) return true;
  return elapsedMs >= MIN_PHRASE_MS && quietMs >= PHRASE_END_SILENCE_MS;
}
