// Section calls spoken on a Tracks MP3 ("Intro", "Verse 2", "Chorus", "Instrumental").
// Song markers already say where each song starts; these cues are offsets inside that window.

export const SECTION_CUE_PROMPT =
  "Spoken worship guide cues. The voice calls sections by name: Intro, Verse, Verse 2, Pre-Chorus, Chorus, Bridge, Instrumental, Turnaround, Tag, Outro, Ending, Vamp, Channel, Breakdown.";

const SAME_CUE_GAP_SECONDS = 4;
const DISTINCT_CUE_GAP_SECONDS = 1.2;
const CUE_PAUSE_SECONDS = 0.4;
const COUNT_GAP_SECONDS = 1.15;
const LEADING_CUE_GAP_SECONDS = 1.5;
const LAST_SONG_FALLBACK_SECONDS = 7200;

export type SectionTranscript = {
  segments: Array<{ start: number; end: number; text: string }>;
  words?: Array<{ word: string; start: number; end: number }>;
};

export type SongMarkerSpan = {
  title: string;
  timestampSeconds: number;
  sequenceOrder?: number;
};

export type DetectedSongSections = {
  title: string;
  sections: Array<{ offsetSeconds: number; label: string }>;
};

type ParsedPhrase = {
  label: string;
  tokensUsed: number;
  strong: boolean;
};

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
};

const LEADING_ORDINALS: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
};

const CHORUS_MODIFIERS: Record<string, string> = {
  pre: "Pre-Chorus",
  post: "Post-Chorus",
  big: "Big Chorus",
  down: "Down Chorus",
  half: "Half Chorus",
  last: "Last Chorus",
  final: "Final Chorus",
};

const STRONG_BASES: Record<string, string> = {
  intro: "Intro",
  introduction: "Intro",
  verse: "Verse",
  verses: "Verse",
  chorus: "Chorus",
  choruses: "Chorus",
  bridge: "Bridge",
  instrumental: "Instrumental",
  instrumentals: "Instrumental",
  interlude: "Instrumental",
  outro: "Outro",
  turnaround: "Turnaround",
  vamp: "Vamp",
  refrain: "Refrain",
  breakdown: "Breakdown",
  prechorus: "Pre-Chorus",
  postchorus: "Post-Chorus",
};

const WEAK_BASES: Record<string, string> = {
  tag: "Tag",
  ending: "Ending",
  end: "Ending",
  channel: "Channel",
  hook: "Hook",
  coda: "Coda",
  build: "Build",
};

const STRONG_TOKENS = new Set(Object.keys(STRONG_BASES));
const NUMBERED_LABELS = new Set(["Verse", "Chorus", "Bridge", "Tag"]);
const COUNT_TOKENS = new Set(["one", "two", "three", "four", "five", "six", "1", "2", "3", "4", "5", "6"]);

function tokenize(text: string): string[] {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function readTrailingNumber(token: string | undefined): number | null {
  if (!token) return null;
  if (NUMBER_WORDS[token]) return NUMBER_WORDS[token];
  const digits = /^(\d)(?:st|nd|rd|th)?$/.exec(token);
  if (!digits) return null;
  const value = Number(digits[1]);
  return value >= 1 ? value : null;
}

function withCount(label: string, count: number | null, allow: boolean): { label: string; extra: number } {
  if (!allow || count == null) return { label, extra: 0 };
  return { label: `${label} ${count}`, extra: 1 };
}

function baseOf(token: string): { label: string; strong: boolean } | null {
  if (STRONG_BASES[token]) return { label: STRONG_BASES[token], strong: true };
  if (WEAK_BASES[token]) return { label: WEAK_BASES[token], strong: false };
  return null;
}

function parsePhrase(tokens: string[]): ParsedPhrase | null {
  if (tokens.length === 0) return null;

  const ordinal = LEADING_ORDINALS[tokens[0]];
  const ordinalBase = ordinal ? baseOf(tokens[1] || "") : null;
  if (ordinal && ordinalBase && NUMBERED_LABELS.has(ordinalBase.label)) {
    return { label: `${ordinalBase.label} ${ordinal}`, tokensUsed: 2, strong: true };
  }

  const modifier = CHORUS_MODIFIERS[tokens[0]];
  if (modifier && (tokens[1] === "chorus" || tokens[1] === "choruses")) {
    const numbered = withCount(modifier, readTrailingNumber(tokens[2]), true);
    return { label: numbered.label, tokensUsed: 2 + numbered.extra, strong: true };
  }

  if (tokens[0] === "turn" && tokens[1] === "around") {
    return { label: "Turnaround", tokensUsed: 2, strong: true };
  }
  if (tokens[0] === "break" && tokens[1] === "down") {
    return { label: "Breakdown", tokensUsed: 2, strong: true };
  }

  const base = baseOf(tokens[0]);
  if (!base) return null;
  const numbered = withCount(base.label, readTrailingNumber(tokens[1]), NUMBERED_LABELS.has(base.label));
  return { label: numbered.label, tokensUsed: 1 + numbered.extra, strong: base.strong };
}

function strongHits(tokens: string[]): number {
  let hits = 0;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (CHORUS_MODIFIERS[token] && (tokens[index + 1] === "chorus" || tokens[index + 1] === "choruses")) {
      hits += 1;
      index += 1;
      if (readTrailingNumber(tokens[index + 1]) != null) index += 1;
      continue;
    }
    const ordinalBase = LEADING_ORDINALS[token] ? baseOf(tokens[index + 1] || "") : null;
    if (ordinalBase && NUMBERED_LABELS.has(ordinalBase.label)) {
      hits += 1;
      index += 1;
      continue;
    }
    if (token === "turn" && tokens[index + 1] === "around") {
      hits += 1;
      index += 1;
      continue;
    }
    if (token === "break" && tokens[index + 1] === "down") {
      hits += 1;
      index += 1;
      continue;
    }
    if (STRONG_TOKENS.has(token)) hits += 1;
  }
  return hits;
}

function isolateCueTokens(tokens: string[]): string[] {
  if (tokens.length !== 1) return tokens;
  return [normalizeCueToken(tokens[0])];
}

function normalizeCueToken(token: string): string {
  if (token === "versus") return "verse";
  if (token === "intra") return "intro";
  if (token === "course" || token === "choruse") return "chorus";
  if (token === "inst") return "instrumental";
  return token;
}

function cueStart(
  segment: { start: number; end: number },
  token: string,
  words: SectionTranscript["words"],
): number {
  const match = (words || []).find((word) => {
    const spoken = tokenize(word.word)[0];
    return spoken === token && word.start >= segment.start - 0.8 && word.start <= segment.end + 0.35;
  });
  return match?.start ?? segment.start;
}

type HeardCue = { at: number; label: string };

type TimedToken = { token: string; start: number; end: number };

function wordsToTokens(words: SectionTranscript["words"]): TimedToken[] {
  const tokens: TimedToken[] = [];
  for (const word of words || []) {
    const pieces = tokenize(word.word).map(normalizeCueToken);
    pieces.forEach((token, index) => {
      const start = word.start + index * 0.01;
      const end = index === pieces.length - 1 ? Math.max(word.end, start) : start;
      tokens.push({ token, start, end });
    });
  }
  return tokens.filter((token) => Number.isFinite(token.start));
}

function countRunLength(tokens: TimedToken[], start: number, previousEnd: number): number {
  let length = 0;
  let cursor = start;
  let end = previousEnd;
  while (cursor < tokens.length && COUNT_TOKENS.has(tokens[cursor].token)) {
    if (tokens[cursor].start - end > COUNT_GAP_SECONDS) break;
    end = tokens[cursor].end;
    length += 1;
    cursor += 1;
  }
  return length;
}

function stripCountNumber(label: string): string {
  return label.replace(/\s+\d+$/, "");
}

/** Guide calls are their own words, often followed by a count-in or the first lyric. */
function hearCuesFromWords(words: SectionTranscript["words"]): HeardCue[] {
  const tokens = wordsToTokens(words);
  const heard: HeardCue[] = [];
  let index = 0;

  while (index < tokens.length) {
    const phrase = parsePhrase(tokens.slice(index).map((token) => token.token));
    if (!phrase) {
      index += 1;
      continue;
    }

    const used = phrase.tokensUsed;
    let label = phrase.label;
    const phraseEnd = tokens[index + used - 1];
    const followingCounts = countRunLength(tokens, index + used, phraseEnd.end);
    if (followingCounts > 0 && /\s\d+$/.test(label)) {
      label = stripCountNumber(label);
    }
    const span = used + followingCounts;
    const last = tokens[index + span - 1];
    const previous = index > 0 ? tokens[index - 1] : null;
    const next = tokens[index + span];
    const gapBefore = previous ? tokens[index].start - previous.end : Number.POSITIVE_INFINITY;
    const gapAfter = next ? next.start - last.end : Number.POSITIVE_INFINITY;
    const countBefore = previous != null && COUNT_TOKENS.has(previous.token) && gapBefore <= COUNT_GAP_SECONDS;
    const countAfter = followingCounts > 0;
    const pausedBefore = gapBefore >= CUE_PAUSE_SECONDS || countBefore;
    const pausedAfter = gapAfter >= CUE_PAUSE_SECONDS || countAfter;
    const weakEnough = phrase.strong || (gapBefore >= 0.8 && gapAfter >= 0.8);

    if (pausedBefore && pausedAfter && weakEnough && label.trim()) {
      heard.push({ at: tokens[index].start, label });
      index += span;
      continue;
    }
    index += 1;
  }

  return heard;
}

function hearCues(transcription: SectionTranscript): HeardCue[] {
  if ((transcription.words || []).length > 0) {
    return hearCuesFromWords(transcription.words).sort((left, right) => left.at - right.at);
  }

  const segments = transcription.segments
    .filter((segment) => segment.text.trim().length > 0 && Number.isFinite(segment.start))
    .slice()
    .sort((left, right) => left.start - right.start);
  const heard: HeardCue[] = [];

  segments.forEach((segment, index) => {
    const tokens = isolateCueTokens(tokenize(segment.text));
    const phrase = parsePhrase(tokens);
    if (!phrase) return;
    let consumed = phrase.tokensUsed;
    if (tokens[consumed] === "section") consumed += 1;
    const exact = consumed === tokens.length;
    const gapBefore = index === 0 ? Number.POSITIVE_INFINITY : segment.start - segments[index - 1].end;
    const leading = phrase.strong && strongHits(tokens) === 1 && tokens.length - consumed <= 1 && gapBefore >= LEADING_CUE_GAP_SECONDS;
    if (!exact && !leading) return;
    heard.push({
      at: cueStart(segment, tokens[0], transcription.words),
      label: phrase.label,
    });
  });

  return heard.sort((left, right) => left.at - right.at);
}

type SongWindow = {
  title: string;
  startSeconds: number;
  endSeconds: number;
};

function songWindows(markers: SongMarkerSpan[], durationSeconds?: number | null): SongWindow[] {
  const sorted = markers
    .filter((marker) => marker.title.trim() && Number.isFinite(marker.timestampSeconds))
    .slice()
    .sort((left, right) => {
      const order = (left.sequenceOrder ?? 0) - (right.sequenceOrder ?? 0);
      if (order !== 0) return order;
      return left.timestampSeconds - right.timestampSeconds;
    });

  return sorted
    .map((marker, index) => {
      const next = sorted[index + 1];
      const end = next
        ? next.timestampSeconds
        : durationSeconds && durationSeconds > marker.timestampSeconds
          ? durationSeconds
          : marker.timestampSeconds + LAST_SONG_FALLBACK_SECONDS;
      return {
        title: marker.title.trim(),
        startSeconds: marker.timestampSeconds,
        endSeconds: end,
      };
    })
    .filter((window) => window.endSeconds > window.startSeconds);
}

export function detectSongSectionGroups(
  transcription: SectionTranscript,
  markers: SongMarkerSpan[],
  durationSeconds?: number | null,
): DetectedSongSections[] {
  const windows = songWindows(markers, durationSeconds);
  const groups: DetectedSongSections[] = windows.map((window) => ({ title: window.title, sections: [] }));
  const lastKept = windows.map(() => null as { offset: number; label: string } | null);

  for (const cue of hearCues(transcription)) {
    const index = windows.findIndex((window) => cue.at >= window.startSeconds && cue.at < window.endSeconds);
    if (index < 0) continue;
    const window = windows[index];
    const length = Math.min(LAST_SONG_FALLBACK_SECONDS, Math.max(0, Math.round(window.endSeconds - window.startSeconds)));
    const offsetSeconds = Math.min(length, Math.max(0, Math.round(cue.at - window.startSeconds)));
    const previous = lastKept[index];
    if (previous && offsetSeconds - previous.offset < DISTINCT_CUE_GAP_SECONDS) continue;
    if (previous && previous.label === cue.label && offsetSeconds - previous.offset < SAME_CUE_GAP_SECONDS) continue;
    lastKept[index] = { offset: offsetSeconds, label: cue.label };
    groups[index].sections.push({ offsetSeconds, label: cue.label });
  }

  return groups;
}
