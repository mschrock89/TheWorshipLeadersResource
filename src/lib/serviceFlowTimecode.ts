import { formatSmpte, smpteSortKey, type SmpteParts } from "./smpteLtc.ts";

export type TimecodeFlowItem = {
  id: string;
  item_type: string;
  notes: string | null;
  duration_seconds: number | null;
  title?: string | null;
};

export type NoteTimecode = {
  start: SmpteParts;
  end: SmpteParts | null;
};

export type TimecodeWindow = {
  itemId: string;
  start: number;
  end: number;
};

const CUE_PATTERN =
  /\b(?:TC|SMPTE|TIMECODE)\s+(\d{1,2})\s*:\s*(\d{2})\s*:\s*(\d{2})(?:\s*:\s*(\d{2}))?(?:\s*[-–—]\s*(\d{1,2})\s*:\s*(\d{2})\s*:\s*(\d{2})(?:\s*:\s*(\d{2}))?)?/i;

function parts(hours: string, minutes: string, seconds: string, frames?: string): SmpteParts | null {
  const stamp = {
    hours: Number(hours),
    minutes: Number(minutes),
    seconds: Number(seconds),
    frames: frames == null ? 0 : Number(frames),
  };
  if (
    stamp.hours > 23 ||
    stamp.minutes > 59 ||
    stamp.seconds > 59 ||
    stamp.frames > 29 ||
    [stamp.hours, stamp.minutes, stamp.seconds, stamp.frames].some((value) => !Number.isFinite(value))
  ) {
    return null;
  }
  return stamp;
}

export function parseNoteTimecode(notes: string | null | undefined): NoteTimecode | null {
  if (!notes) return null;
  const match = notes.match(CUE_PATTERN);
  if (!match) return null;
  const start = parts(match[1], match[2], match[3], match[4]);
  if (!start) return null;
  const end = match[5] ? parts(match[5], match[6], match[7], match[8]) : null;
  return { start, end };
}

export function formatNoteTimecode(cue: NoteTimecode) {
  if (!cue.end) return formatSmpte(cue.start);
  return `${formatSmpte(cue.start)}–${formatSmpte(cue.end)}`;
}

export function flowTimecodeLabel(cue: NoteTimecode) {
  return `TC ${formatNoteTimecode(cue)}`;
}

export function notesWithoutTimecodeCue(notes: string | null | undefined) {
  if (!notes) return "";
  return notes
    .replace(CUE_PATTERN, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const PLAYBACK_SONG_STEP_MINUTES = 10;

export function playbackTimecodeForSong(songIndex: number): SmpteParts {
  const minutesFromOrigin = Math.max(0, songIndex) * PLAYBACK_SONG_STEP_MINUTES;
  return {
    hours: 1 + Math.floor(minutesFromOrigin / 60),
    minutes: minutesFromOrigin % 60,
    seconds: 0,
    frames: 0,
  };
}

export function propresenterVideoTimecode(title: string | null | undefined): SmpteParts | null {
  const normalized = (title || "").toLowerCase();
  if (/\bpre[-\s]?roll\b/.test(normalized)) {
    return { hours: 2, minutes: 0, seconds: 0, frames: 0 };
  }
  if (/\bpsa\b/.test(normalized)) {
    return { hours: 2, minutes: 10, seconds: 0, frames: 0 };
  }
  return null;
}

export function flowTimecodeCues(items: TimecodeFlowItem[]) {
  const cues = new Map<string, NoteTimecode>();
  let songIndex = 0;
  for (const item of items) {
    if (item.item_type === "header") continue;
    const explicit = parseNoteTimecode(item.notes);
    if (explicit) {
      cues.set(item.id, explicit);
      if (item.item_type === "song") songIndex += 1;
      continue;
    }
    if (item.item_type === "song") {
      cues.set(item.id, { start: playbackTimecodeForSong(songIndex), end: null });
      songIndex += 1;
      continue;
    }
    const video = propresenterVideoTimecode(item.title);
    if (video) cues.set(item.id, { start: video, end: null });
  }
  return cues;
}

export function flowTimecodeLabels(items: TimecodeFlowItem[]) {
  const labels = new Map<string, string>();
  for (const [id, cue] of flowTimecodeCues(items)) labels.set(id, flowTimecodeLabel(cue));
  return labels;
}

export function buildTimecodeWindows(items: TimecodeFlowItem[], fps: number): TimecodeWindow[] {
  const rate = fps > 0 ? fps : 30;
  const cues = flowTimecodeCues(items);
  const anchored = items.flatMap((item) => {
    const cue = cues.get(item.id);
    if (!cue) return [];
    return [{ item, cue, start: smpteSortKey(cue.start, rate) }];
  });
  anchored.sort((left, right) => left.start - right.start || left.item.id.localeCompare(right.item.id));

  return anchored.map((entry, index) => {
    const next = anchored[index + 1];
    let end = entry.start + 24 * 3600 * rate;
    if (entry.cue.end) end = smpteSortKey(entry.cue.end, rate);
    else if (entry.item.duration_seconds && entry.item.duration_seconds > 0) {
      end = entry.start + Math.round(entry.item.duration_seconds * rate);
    } else if (next) end = next.start;
    if (next && end > next.start) end = next.start;
    if (end <= entry.start) end = entry.start + 1;
    return { itemId: entry.item.id, start: entry.start, end };
  });
}

export function matchTimecodeWindow(windows: TimecodeWindow[], key: number) {
  let best: TimecodeWindow | null = null;
  for (const window of windows) {
    if (key < window.start || key >= window.end) continue;
    if (!best || window.start >= best.start) best = window;
  }
  if (!best) return null;
  const span = Math.max(1, best.end - best.start);
  return {
    itemId: best.itemId,
    progress: Math.min(1, Math.max(0, (key - best.start) / span)),
  };
}
