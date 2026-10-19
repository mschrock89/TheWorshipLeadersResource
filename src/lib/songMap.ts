export type SongMapKind = "note" | "mix";

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
  return kind === "mix" ? "Mix" : "Note";
}
