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

const CHORD_ONLY_TOKEN_REGEX =
  /^[A-G](?:#|b)?(?:(?:m|maj|min|dim|aug|sus|add)?[0-9()#b+-]*)*(?:\/[A-G](?:#|b)?)?$/;

function isChordSequence(text: string): boolean {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return false;
  return tokens.every((token) => CHORD_ONLY_TOKEN_REGEX.test(token) || /^[|:().x%\d-]+$/.test(token));
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

function transposeChordToken(
  token: string,
  semitones: number,
  accidentalPreference: "sharps" | "flats",
): string {
  if (!token || semitones === 0) return token;

  const [mainPart, bassPart] = token.split("/");
  const mainMatch = mainPart.match(/^([A-G](?:#|b)?)(.*)$/);
  if (!mainMatch) return token;

  const transposedMainRoot = transposeNoteWithPreference(mainMatch[1], semitones, accidentalPreference);
  const transposedMain = `${transposedMainRoot}${mainMatch[2] || ""}`;

  if (!bassPart) return transposedMain;

  const bassMatch = bassPart.match(/^([A-G](?:#|b)?)(.*)$/);
  if (!bassMatch) return transposedMain;
  const transposedBassRoot = transposeNoteWithPreference(bassMatch[1], semitones, accidentalPreference);
  return `${transposedMain}/${transposedBassRoot}${bassMatch[2] || ""}`;
}

export function transposeChordChartText(
  chordChartText: string,
  semitones: number,
  accidentalPreference: "sharps" | "flats",
): string {
  if (semitones === 0) return chordChartText;

  const transposeFreeChordTokens = (input: string): string =>
    input.replace(
      /\b([A-G](?:#|b)?(?:maj|min|m|sus|add|dim|aug|[0-9()+-]*)?(?:\/[A-G](?:#|b)?)?)\b/g,
      (match) => transposeChordToken(match, semitones, accidentalPreference),
    );

  return chordChartText
    .split("\n")
    .map((line) => {
      if (line.includes("[")) {
        return line.replace(/\[([^\]]+)\]/g, (_, token: string) => {
          const transposed = transposeChordToken(token.trim(), semitones, accidentalPreference);
          return `[${transposed}]`;
        });
      }
      return transposeFreeChordTokens(line);
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

  const tokenRegex = /\b([A-G](?:#|b)?(?:maj|min|m|sus|add|dim|aug|[0-9()+-]*)?(?:\/[A-G](?:#|b)?)?)\b/g;
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

    const suffix = (rootMatch[2] || "").toLowerCase();
    const isMinor =
      /^m(?!aj)/.test(suffix) ||
      /\bmin\b/.test(suffix) ||
      /-/.test(suffix);

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

    if (line.includes("[")) {
      const bracketRegex = /\[([^\]]+)\]/g;
      let bracketMatch: RegExpExecArray | null;
      while ((bracketMatch = bracketRegex.exec(line)) !== null) {
        registerChordToken(bracketMatch[1].trim(), weight);
      }
      continue;
    }

    if (isChordOnlyLine(line)) {
      let tokenMatch: RegExpExecArray | null;
      while ((tokenMatch = tokenRegex.exec(line)) !== null) {
        registerChordToken(tokenMatch[1], weight);
      }
      tokenRegex.lastIndex = 0;
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
