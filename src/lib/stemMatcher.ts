import { StemType, STEM_TYPES } from "@/hooks/useSetlistStems";

/**
 * Keywords used to fuzzy-match a filename to a stem slot.
 * Listed in priority order within each group — first match wins.
 * More specific terms (e.g. "sub_bass") are checked before general ones (e.g. "bass").
 */
const STEM_KEYWORDS: Record<StemType, string[]> = {
  sub_bass: ["sub_bass", "subbass", "sub bass", "sub-bass", "808", "sub"],
  drums:    ["drum", "drums", "kick", "snare", "overheads", "ohds", "room"],
  perc:     ["perc", "percussion", "shaker", "tamb", "tambourine", "clap"],
  bass:     ["bass guitar", "bass_gtr", "bass gtr", "electric bass", "bass"],
  guitars:  ["guitar", "gtr", "gtrs", "guitars", "elec gtr", "electric"],
  piano:    ["piano", "grand piano", "pno", "upright"],
  keys:     ["keys", "keyboard", "kbd", "synth", "pad", "organ", "wurli", "rhodes"],
  aux:      ["aux", "auxiliary", "extra", "fx chain", "effects", "sfx"],
  vocals:   ["vocals", "vocal", "vox", "lead vox", "bgv", "bkg", "harmony", "choir", "voice"],
  click:    ["click", "clk", "metronome", "cue", "tempo", "guide", "scratch", "reference vocal", "ref vox", "ref", "scratch vox"],
};

const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "aif", "aiff", "ogg", "m4a", "flac", "aac"]);

function normalize(str: string): string {
  return str
    .toLowerCase()
    .replace(/[_\-\.]/g, " ")  // treat separators as spaces
    .replace(/\s+/g, " ")
    .trim();
}

function isAudioFile(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return AUDIO_EXTENSIONS.has(ext) && !filename.startsWith("__MACOSX") && !filename.startsWith(".");
}

export interface StemMatch {
  stemType: StemType;
  filename: string;
  file: File;
  confidence: "exact" | "keyword" | "partial";
}

export interface ZipMatchResult {
  matched: StemMatch[];
  unmatched: File[];   // audio files that didn't match any stem
  duplicates: { stemType: StemType; files: File[] }[];
}

/**
 * Given an array of audio Files extracted from a ZIP, match each one to a stem slot.
 * Returns matched stems, unmatched files, and any slots with more than one candidate.
 */
export function matchFilesToStems(files: File[]): ZipMatchResult {
  const audioFiles = files.filter((f) => isAudioFile(f.name));
  const candidates: Map<StemType, { file: File; score: number }[]> = new Map();

  for (const stemType of STEM_TYPES) {
    candidates.set(stemType, []);
  }

  for (const file of audioFiles) {
    // Strip path prefix (files inside sub-folders)
    const basename = file.name.split("/").pop() ?? file.name;
    const normalized = normalize(basename.replace(/\.[^.]+$/, "")); // strip extension too

    let bestStem: StemType | null = null;
    let bestScore = 0;

    for (const stemType of STEM_TYPES) {
      const keywords = STEM_KEYWORDS[stemType];
      for (let i = 0; i < keywords.length; i++) {
        const kw = normalize(keywords[i]);

        let score = 0;
        if (normalized === kw) {
          // Exact match on normalized name
          score = 100 - i;
        } else if (normalized.startsWith(kw + " ") || normalized.endsWith(" " + kw)) {
          score = 80 - i;
        } else if (normalized.includes(" " + kw + " ") || normalized.includes(kw)) {
          score = 60 - i;
        }

        if (score > bestScore) {
          bestScore = score;
          bestStem = stemType;
        }
      }
    }

    if (bestStem !== null && bestScore > 0) {
      candidates.get(bestStem)!.push({ file, score: bestScore });
    }
  }

  const matched: StemMatch[] = [];
  const usedFiles = new Set<File>();
  const duplicates: ZipMatchResult["duplicates"] = [];

  for (const stemType of STEM_TYPES) {
    const list = candidates.get(stemType)!.sort((a, b) => b.score - a.score);
    if (list.length === 0) continue;

    if (list.length > 1) {
      duplicates.push({ stemType, files: list.map((c) => c.file) });
    }

    // Take the best match
    const best = list[0];
    const basename = best.file.name.split("/").pop() ?? best.file.name;
    const normalized = normalize(basename.replace(/\.[^.]+$/, ""));
    const exactKw = normalize(STEM_KEYWORDS[stemType][0]);

    matched.push({
      stemType,
      filename: basename,
      file: best.file,
      confidence: normalized === exactKw ? "exact" : best.score >= 80 ? "keyword" : "partial",
    });
    usedFiles.add(best.file);
  }

  const unmatched = audioFiles.filter((f) => !usedFiles.has(f));

  return { matched, unmatched, duplicates };
}
