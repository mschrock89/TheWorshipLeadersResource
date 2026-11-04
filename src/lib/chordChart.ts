export type DisplayMode = "rendered" | "raw";

export type RenderedLine =
  | { kind: "empty" }
  | { kind: "section"; text: string }
  | { kind: "chords"; text: string }
  | { kind: "lyricWithChords"; lyric: string; chords: string }
  | { kind: "text"; text: string };

export const RENDERED_CHART_FONT_FAMILY =
  '"Helvetica Neue", Helvetica, Arial, sans-serif';

const NOTE_SEQUENCE_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const NOTE_SEQUENCE_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

export const KEY_LABELS_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export const KEY_LABELS_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

const NOTE_INDEX: Record<string, number> = {
  C: 0,
  "B#": 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  Fb: 4,
  F: 5,
  "E#": 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
  Cb: 11,
};

export function parseKeyIndex(keyLabel?: string | null): number | null {
  if (!keyLabel) return null;
  const rootMatch = keyLabel.trim().match(/^([A-G](?:#|b)?)/);
  if (!rootMatch) return null;
  const keyIndex = NOTE_INDEX[rootMatch[1]];
  return typeof keyIndex === "number" ? keyIndex : null;
}

function padToLength(input: string, targetLength: number): string {
  if (input.length >= targetLength) return input;
  return input + " ".repeat(targetLength - input.length);
}

function stripBracketedChords(line: string): string {
  return line.replace(/\[([^\]]+)\]/g, "$1");
}

function isSectionHeader(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (trimmed.includes("[") || trimmed.includes("]")) return false;
  if (isPlainChordLine(trimmed)) return false;
  if (/^(intro|verse(?:\s+\d+)?|chorus|bridge|tag|turnaround|pre[-\s]?chorus|outro|interlude|repeat chorus|ending|ending chorus|instrumental|refrain|hook)$/i.test(trimmed)) {
    return true;
  }

  const alphaOnly = trimmed.replace(/[^A-Za-z]/g, "");
  const upperOnly = trimmed.replace(/[^A-Z]/g, "");
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;

  // Treat short all-caps labels like VERSE, CHORUS, BRIDGE, TAG, etc. as identifiers.
  if (alphaOnly.length >= 3 && alphaOnly === upperOnly && wordCount <= 4) {
    return true;
  }

  return false;
}

const CHORD_ROOT_PATTERN = "[A-G](?:#|b)?";
const CHORD_SUFFIX_PATTERN = "(?:maj|min|dim|aug|sus|add|m|M|[0-9()#b+-])*";

const CHORD_ONLY_TOKEN_REGEX = new RegExp(
  `^${CHORD_ROOT_PATTERN}${CHORD_SUFFIX_PATTERN}(?:\\/${CHORD_ROOT_PATTERN})?$`,
);

// Captures: 1 = leading delimiter, 2 = root, 3 = suffix, 4 = bass note.
const CHORD_IN_TEXT_REGEX = new RegExp(
  `(^|[^A-Za-z0-9#.])(${CHORD_ROOT_PATTERN})(${CHORD_SUFFIX_PATTERN})(?:\\/(${CHORD_ROOT_PATTERN}))?(?=$|[^A-Za-z0-9#])`,
  "g",
);

function isChordToken(token: string): boolean {
  const unwrapped = token.replace(/^[(|[]+/, "").replace(/[)|\]]+$/, "");
  return CHORD_ONLY_TOKEN_REGEX.test(unwrapped);
}

function isChordSequence(text: string): boolean {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return false;
  return tokens.every(
    (token) => isChordToken(token) || /^[|:().x%\d-]+$/.test(token) || /^N\.?C\.?$/i.test(token),
  );
}

function isChordOnlyLine(line: string): boolean {
  if (!line.includes("[")) return false;
  const stripped = stripBracketedChords(line).trim();
  if (!stripped) return true;
  return isChordSequence(stripped);
}

// Chord lines typed without brackets, e.g. "G   D   Em   C" above a lyric line.
function isPlainChordLine(line: string): boolean {
  if (line.includes("[") || line.includes("]")) return false;
  const trimmed = line.trim();
  if (!trimmed) return false;
  return isChordSequence(trimmed);
}

function buildLyricAndChordLine(line: string): { lyric: string; chords: string } {
  const regex = /\[([^\]]+)\]/g;
  let match: RegExpExecArray | null;
  let cursor = 0;
  let lyricLine = "";
  let chordLine = "";

  while ((match = regex.exec(line)) !== null) {
    const lyricChunk = line.slice(cursor, match.index);
    lyricLine += lyricChunk;
    chordLine = padToLength(chordLine, lyricLine.length);

    const chord = match[1].trim();
    if (chord) {
      chordLine += chord;
    }

    cursor = regex.lastIndex;
  }

  const trailingLyrics = line.slice(cursor);
  lyricLine += trailingLyrics;
  chordLine = padToLength(chordLine, lyricLine.length);

  return {
    lyric: lyricLine,
    chords: chordLine,
  };
}

export function renderChordChartText(chordChartText: string): RenderedLine[] {
  const rawLines = chordChartText.split("\n").map((rawLine) => rawLine.replace(/\t/g, "  "));
  const result: RenderedLine[] = [];

  for (let index = 0; index < rawLines.length; index += 1) {
    const line = rawLines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      result.push({ kind: "empty" });
      continue;
    }

    if (isSectionHeader(trimmed)) {
      result.push({ kind: "section", text: trimmed });
      continue;
    }

    if (isChordOnlyLine(line)) {
      result.push({ kind: "chords", text: stripBracketedChords(line).trimEnd() });
      continue;
    }

    if (line.includes("[")) {
      const { lyric, chords } = buildLyricAndChordLine(line);
      if (lyric || chords) {
        result.push({ kind: "lyricWithChords", lyric, chords });
        continue;
      }
    }

    if (isPlainChordLine(line)) {
      // Pair a bare chord line with the lyric line below it (column-aligned
      // two-line charts) so chords stay attached to their words when wrapping.
      const nextLine = rawLines[index + 1];
      const nextTrimmed = nextLine?.trim() ?? "";
      const nextIsLyric =
        !!nextTrimmed &&
        !nextLine.includes("[") &&
        !isSectionHeader(nextTrimmed) &&
        !isPlainChordLine(nextLine);

      if (nextIsLyric) {
        result.push({ kind: "lyricWithChords", lyric: nextLine.trimEnd(), chords: line.trimEnd() });
        index += 1;
      } else {
        result.push({ kind: "chords", text: line.trimEnd() });
      }
      continue;
    }

    result.push({ kind: "text", text: line.trimEnd() });
  }

  return result;
}

export type ChordLyricFragment = {
  chord: string | null;
  text: string;
};

// A "word" is a run of fragments with no internal whitespace. Line wrapping may
// only happen between words so chords stay attached to their syllables.
export type ChordLyricWord = ChordLyricFragment[];

export function buildChordLyricWords(lyric: string, chords: string): ChordLyricWord[] {
  const chordTokens: Array<{ position: number; chord: string }> = [];
  const tokenRegex = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(chords)) !== null) {
    chordTokens.push({ position: match.index, chord: match[0] });
  }

  const paddedLyric = padToLength(lyric, chords.length);
  const fragments: ChordLyricFragment[] = [];
  let cursor = 0;
  chordTokens.forEach((token, index) => {
    if (token.position > cursor) {
      fragments.push({ chord: null, text: paddedLyric.slice(cursor, token.position) });
    }
    const end = chordTokens[index + 1]?.position ?? paddedLyric.length;
    fragments.push({ chord: token.chord, text: paddedLyric.slice(token.position, end) });
    cursor = end;
  });
  if (cursor < paddedLyric.length) {
    fragments.push({ chord: null, text: paddedLyric.slice(cursor) });
  }

  const words: ChordLyricWord[] = [];
  let currentWord: ChordLyricFragment[] = [];
  const closeWord = () => {
    if (currentWord.length) {
      words.push(currentWord);
      currentWord = [];
    }
  };

  for (const fragment of fragments) {
    const pieces = fragment.text.split(/(\s+)/).filter((piece) => piece.length > 0);
    if (!pieces.length) pieces.push("");
    pieces.forEach((piece, pieceIndex) => {
      const chord = pieceIndex === 0 ? fragment.chord : null;
      if (/^\s+$/.test(piece)) {
        if (chord) {
          currentWord.push({ chord, text: "" });
        }
        closeWord();
        return;
      }
      currentWord.push({ chord, text: piece });
    });
  }
  closeWord();

  return words;
}

export function getRenderedLineUnits(line: RenderedLine): number {
  if (line.kind === "lyricWithChords") return 2;
  if (line.kind === "empty") return 1;
  return 1;
}

export type RenderedBlock = {
  lines: RenderedLine[];
  units: number;
  startsSection: boolean;
};

export function buildRenderedBlocks(lines: RenderedLine[]): RenderedBlock[] {
  if (lines.length === 0) return [];

  const blocks: RenderedBlock[] = [];
  let currentLines: RenderedLine[] = [];
  let currentUnits = 0;
  let currentStartsSection = false;

  const pushCurrent = () => {
    if (currentLines.length === 0) return;
    blocks.push({
      lines: currentLines,
      units: currentUnits,
      startsSection: currentStartsSection,
    });
    currentLines = [];
    currentUnits = 0;
    currentStartsSection = false;
  };

  for (const line of lines) {
    if (line.kind === "section") {
      pushCurrent();
      currentStartsSection = true;
    }

    currentLines.push(line);
    currentUnits += getRenderedLineUnits(line);
  }

  pushCurrent();
  return blocks;
}

export function paginateRenderedChordLines(
  lines: RenderedLine[],
  maxUnitsPerPage: number,
): RenderedLine[][] {
  if (lines.length === 0) return [[]];

  const blocks = buildRenderedBlocks(lines);
  if (blocks.length === 0) return [lines];

  const pages: RenderedLine[][] = [];
  let currentPage: RenderedLine[] = [];
  let usedUnits = 0;

  for (const block of blocks) {
    const blockUnits = block.units;

    if (currentPage.length > 0 && usedUnits + blockUnits > maxUnitsPerPage) {
      pages.push(currentPage);
      currentPage = [];
      usedUnits = 0;
    }

    if (blockUnits > maxUnitsPerPage) {
      for (const line of block.lines) {
        const nextUnits = getRenderedLineUnits(line);
        if (currentPage.length > 0 && usedUnits + nextUnits > maxUnitsPerPage) {
          pages.push(currentPage);
          currentPage = [];
          usedUnits = 0;
        }

        currentPage.push(line);
        usedUnits += nextUnits;
      }
      continue;
    }

    currentPage.push(...block.lines);
    usedUnits += blockUnits;
  }

  if (currentPage.length > 0) {
    pages.push(currentPage);
  }

  return pages;
}

function transposeNoteWithPreference(
  note: string,
  semitones: number,
  accidentalPreference: "sharps" | "flats",
): string {
  const index = NOTE_INDEX[note];
  if (index === undefined) return note;
  const wrapped = (((index + semitones) % 12) + 12) % 12;
  return accidentalPreference === "flats" ? NOTE_SEQUENCE_FLAT[wrapped] : NOTE_SEQUENCE_SHARP[wrapped];
}

function transposeChordsInText(
  text: string,
  semitones: number,
  accidentalPreference: "sharps" | "flats",
): string {
  return text.replace(
    CHORD_IN_TEXT_REGEX,
    (_match, lead: string, root: string, suffix: string, bass: string | undefined) => {
      const transposedRoot = transposeNoteWithPreference(root, semitones, accidentalPreference);
      const transposedBass = bass
        ? `/${transposeNoteWithPreference(bass, semitones, accidentalPreference)}`
        : "";
      return `${lead}${transposedRoot}${suffix}${transposedBass}`;
    },
  );
}

// Keeps each chord at its original column so it stays above the same syllable.
function transposePlainChordLine(
  line: string,
  semitones: number,
  accidentalPreference: "sharps" | "flats",
): string {
  let output = "";
  const tokenRegex = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(line)) !== null) {
    if (output.length < match.index) {
      output = padToLength(output, match.index);
    } else if (output.length > 0) {
      output += " ";
    }
    output += transposeChordsInText(match[0], semitones, accidentalPreference);
  }
  return output;
}

const KEY_LINE_REGEX = /^(\s*key\s*[:=-]\s*)([A-G](?:#|b)?)/i;

export function transposeChordChartText(
  chordChartText: string,
  semitones: number,
  accidentalPreference: "sharps" | "flats",
): string {
  if (semitones === 0) return chordChartText;

  return chordChartText
    .split("\n")
    .map((line) => {
      if (line.includes("[")) {
        return line.replace(/\[([^\]]+)\]/g, (_, token: string) =>
          `[${transposeChordsInText(token, semitones, accidentalPreference)}]`,
        );
      }
      if (KEY_LINE_REGEX.test(line)) {
        return line.replace(KEY_LINE_REGEX, (_match, label: string, root: string) =>
          `${label}${transposeNoteWithPreference(root, semitones, accidentalPreference)}`,
        );
      }
      if (isPlainChordLine(line)) {
        return transposePlainChordLine(line, semitones, accidentalPreference);
      }
      return line;
    })
    .join("\n");
}

export function detectKeyIndexFromChart(chordChartText: string): number {
  const explicitKeyPatterns = [
    /\bkey\s*[:=-]\s*([A-G](?:#|b)?)/i,
    /\bcapo\s+\d+.*\bkey\s*[:=-]?\s*([A-G](?:#|b)?)/i,
  ];
  for (const pattern of explicitKeyPatterns) {
    const match = chordChartText.match(pattern);
    if (match?.[1]) {
      const idx = NOTE_INDEX[match[1]];
      if (typeof idx === "number") return idx;
    }
  }

  const rootVotes = new Map<number, number>();
  const functionVotes = new Map<number, number>();

  const addVote = (index: number, amount: number, target: Map<number, number>) => {
    target.set(index, (target.get(index) || 0) + amount);
  };

  const registerChordToken = (token: string, positionWeight = 1) => {
    const main = token.split("/")[0];
    const rootMatch = main.match(/^([A-G](?:#|b)?)(.*)$/);
    if (!rootMatch) return;
    const rootIndex = NOTE_INDEX[rootMatch[1]];
    if (rootIndex === undefined) return;

    const suffix = rootMatch[2] || "";
    const isMinor = /^(?:m(?!aj)|-)/.test(suffix);

    addVote(rootIndex, 2 * positionWeight, rootVotes);

    // Score likely tonal centers by diatonic-function fit.
    // Major: I, IV, V strongest, then ii/iii/vi.
    // Minor: i, iv, v strongest, then III/VI/VII.
    const majorCandidates = [
      { tonicOffset: 0, weight: 5 },  // I
      { tonicOffset: 5, weight: 4 },  // IV
      { tonicOffset: 7, weight: 4 },  // V
      { tonicOffset: 2, weight: 2 },  // ii
      { tonicOffset: 4, weight: 2 },  // iii
      { tonicOffset: 9, weight: 2 },  // vi
    ];
    const minorCandidates = [
      { tonicOffset: 0, weight: 5 },  // i
      { tonicOffset: 5, weight: 4 },  // iv
      { tonicOffset: 7, weight: 3 },  // v
      { tonicOffset: 3, weight: 2 },  // III
      { tonicOffset: 8, weight: 2 },  // VI
      { tonicOffset: 10, weight: 2 }, // VII
    ];

    const candidates = isMinor ? minorCandidates : majorCandidates;
    for (const candidate of candidates) {
      const tonic = (rootIndex - candidate.tonicOffset + 12) % 12;
      addVote(tonic, candidate.weight * positionWeight, functionVotes);
    }
  };

  const lines = chordChartText.split("\n");
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const weight = lineIndex < 6 ? 1.5 : 1;

    const chordSources = line.includes("[")
      ? Array.from(line.matchAll(/\[([^\]]+)\]/g), (bracketMatch) => bracketMatch[1])
      : isPlainChordLine(line)
        ? [line]
        : [];

    for (const source of chordSources) {
      for (const chordMatch of source.matchAll(CHORD_IN_TEXT_REGEX)) {
        registerChordToken(`${chordMatch[2]}${chordMatch[3]}`, weight);
      }
    }
  }

  if (functionVotes.size === 0 && rootVotes.size === 0) return 0;

  let bestIndex = 0;
  let bestScore = -Infinity;
  for (let tonic = 0; tonic < 12; tonic += 1) {
    const score = (functionVotes.get(tonic) || 0) * 3 + (rootVotes.get(tonic) || 0);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = tonic;
    }
  }

  return bestIndex;
}

export function upsertExplicitKeyLine(chordChartText: string, keyLabel: string): string {
  const keyLine = `Key: ${keyLabel}`;
  const lines = chordChartText.split("\n");
  const keyLineRegex = /^\s*key\s*[:=-]\s*[A-G](?:#|b)?\s*$/i;
  const existingIndex = lines.findIndex((line) => keyLineRegex.test(line));

  if (existingIndex >= 0) {
    lines[existingIndex] = keyLine;
    return lines.join("\n");
  }

  if (!chordChartText.trim()) {
    return `${keyLine}\n`;
  }

  return `${keyLine}\n${chordChartText}`;
}

export function getSignedSemitoneDelta(fromIndex: number, toIndex: number): number {
  let delta = (toIndex - fromIndex + 12) % 12;
  if (delta > 6) delta -= 12;
  return delta;
}
