export type SongMapKind = "note" | "mix" | "section";

export type SongMapCue = {
  id: string;
  serviceFlowItemId: string;
  offsetSeconds: number;
  body: string;
  kind: SongMapKind;
};

export function formatSongMapTime(totalSeconds: number) {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const remain = seconds % 60;
  return `${minutes}:${String(remain).padStart(2, "0")}`;
}

export function songMapOffsetFromRatio(ratio: number, durationSeconds: number) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0;
  const clamped = Math.min(1, Math.max(0, ratio));
  return Math.min(durationSeconds, Math.round(clamped * durationSeconds));
}

/** The latest cue the playhead has reached. */
export function activeSongMapCue<T extends { offsetSeconds: number }>(cues: T[], elapsedSeconds: number) {
  let active: T | null = null;
  for (const cue of cues) {
    if (cue.offsetSeconds > elapsedSeconds) continue;
    if (!active || cue.offsetSeconds >= active.offsetSeconds) active = cue;
  }
  return active;
}

export function songMapKindLabel(kind: SongMapKind) {
  if (kind === "mix") return "Mix";
  if (kind === "section") return "Section";
  return "Note";
}

const SECTION_ABBREV: Record<string, string> = {
  Intro: "Intro",
  Verse: "V",
  "Pre-Chorus": "Pre",
  Chorus: "C",
  Bridge: "Br",
  Instrumental: "Inst",
  Turnaround: "Turn",
  Tag: "Tag",
  Outro: "Out",
  Ending: "End",
  Vamp: "Vamp",
  Channel: "Ch",
  Breakdown: "Brk",
  Refrain: "Ref",
  "Big Chorus": "Big",
  "Down Chorus": "Down",
  "Half Chorus": "Half",
  "Last Chorus": "Last",
  "Final Chorus": "Final",
  "Post-Chorus": "Post",
  Hook: "Hook",
  Coda: "Coda",
  Build: "Build",
};

export function songMapSectionAbbrev(label: string) {
  const trimmed = label.trim();
  const numbered = /^(.*?)(?:\s+)(\d+)$/.exec(trimmed);
  if (!numbered) return SECTION_ABBREV[trimmed] || trimmed;
  const base = SECTION_ABBREV[numbered[1]] || numbered[1];
  return `${base}${numbered[2]}`;
}
