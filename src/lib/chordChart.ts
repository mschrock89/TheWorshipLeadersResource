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

function isChordOnlyLine(line: string): boolean {
  if (!line.includes("[")) return false;
  const stripped = stripBracketedChords(line).trim();
  if (!stripped) return true;
  return /^[A-Ga-g0-9#b/().+|:\s-]+$/.test(stripped);
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
  return chordChartText.split("\n").map((rawLine) => {
    const line = rawLine.replace(/\t/g, "  ");
    const trimmed = line.trim();

    if (!trimmed) {
      return { kind: "empty" } as RenderedLine;
    }

    if (isSectionHeader(trimmed)) {
      return { kind: "section", text: trimmed } as RenderedLine;
    }

    if (isChordOnlyLine(line)) {
      return { kind: "chords", text: stripBracketedChords(line).trimEnd() } as RenderedLine;
    }

    if (line.includes("[")) {
      const { lyric, chords } = buildLyricAndChordLine(line);
      if (lyric || chords) {
        return { kind: "lyricWithChords", lyric, chords } as RenderedLine;
      }
    }

    return { kind: "text", text: line.trimEnd() } as RenderedLine;
  });
}

export function getRenderedLineUnits(line: RenderedLine): number {
  if (line.kind === "lyricWithChords") return 2;
  if (line.kind === "empty") return 1;
  return 1;
}

type RenderedBlock = {
  lines: RenderedLine[];
  units: number;
  startsSection: boolean;
};

function buildRenderedBlocks(lines: RenderedLine[]): RenderedBlock[] {
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
    const isMinor = suffix.startsWith("m") && !suffix.startsWith("maj");
    addVote(rootIndex, positionWeight, rootVotes);
    addVote(rootIndex, isMinor ? 1 : 2, functionVotes);

    const dominantIndex = (rootIndex + 7) % 12;
    const subdominantIndex = (rootIndex + 5) % 12;
    addVote(dominantIndex, 0.4 * positionWeight, functionVotes);
    addVote(subdominantIndex, 0.3 * positionWeight, functionVotes);
  };

  chordChartText.split("\n").forEach((line) => {
    const tokens = Array.from(line.matchAll(tokenRegex)).map((match) => match[1]);
    tokens.forEach((token, index) => registerChordToken(token, index === 0 ? 2 : 1));
  });

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

export function getSignedSemitoneDelta(fromIndex: number, toIndex: number): number {
  let delta = (toIndex - fromIndex + 12) % 12;
  if (delta > 6) delta -= 12;
  return delta;
}
