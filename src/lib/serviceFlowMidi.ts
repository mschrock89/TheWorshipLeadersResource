export type FlowMidiCue = {
  note: number;
  velocity: number | null;
};

export type MidiNoteEvent = {
  channel: number;
  note: number;
  velocity: number;
};

export type MidiFollowSettings = {
  channel: number;
  inputId: string | null;
  /** Note that starts the pre-service playlist. Null waits until a note is chosen. */
  preServiceCue: FlowMidiCue | null;
  /** Note that starts the end-of-service prayer track. */
  endServiceCue: FlowMidiCue | null;
};

export type PlaybackGate = {
  currentId: string | null;
  lastSongId: string | null;
  hold: boolean;
};

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
const MIDI_CUE_PATTERN = /\bMIDI\s+([A-G][#b]?-?\d+|\d{1,3})(?:\s+(\d{1,3}))?/i;
const MIDI_SETTINGS_KEY = "wlr-service-flow-midi";

export function midiNoteName(note: number) {
  const pitch = ((note % 12) + 12) % 12;
  // Playback calls middle C (note 60) C3, one octave below the C4 convention.
  const octave = Math.floor(note / 12) - 2;
  return `${NOTE_NAMES[pitch]}${octave}`;
}

export function midiNoteNumber(token: string) {
  const trimmed = token.trim();
  if (/^\d{1,3}$/.test(trimmed)) {
    const value = Number(trimmed);
    return value >= 0 && value <= 127 ? value : null;
  }
  const match = trimmed.match(/^([A-G])([#b])?(-?\d+)$/i);
  if (!match) return null;
  const letter = match[1].toUpperCase();
  const accidental = (match[2] || "").toLowerCase();
  const semitone = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[letter];
  if (semitone == null) return null;
  const offset = accidental === "#" ? 1 : accidental === "b" ? -1 : 0;
  const note = (Number(match[3]) + 2) * 12 + semitone + offset;
  return note >= 0 && note <= 127 ? note : null;
}

function noteOn(status: number, note: number, velocity: number): MidiNoteEvent | null {
  if ((status & 0xf0) !== 0x90) return null;
  if (note < 0 || note > 127 || velocity <= 0 || velocity > 127) return null;
  return { channel: (status & 0x0f) + 1, note, velocity };
}

/** Every note-on in the buffer. A packet often starts with a clock, a note-off, or an earlier cue. */
export function parseMidiNoteOns(data: ArrayLike<number>): MidiNoteEvent[] {
  const notes: MidiNoteEvent[] = [];
  let index = 0;
  let running: number | null = null;
  while (index < data.length) {
    const byte = data[index];
    if (byte >= 0xf8) {
      index += 1;
      continue;
    }
    let status: number;
    if (byte >= 0x80) {
      status = byte;
      running = status < 0xf0 ? status : null;
      index += 1;
    } else if (running == null) {
      break;
    } else {
      status = running;
    }
    if (status >= 0xf0) {
      if (status === 0xf0) {
        while (index < data.length && data[index] !== 0xf7) index += 1;
        if (index < data.length) index += 1;
      } else if (status === 0xf2) {
        index += 2;
      } else if (status === 0xf1 || status === 0xf3) {
        index += 1;
      }
      continue;
    }
    const size = (status & 0xf0) === 0xc0 || (status & 0xf0) === 0xd0 ? 1 : 2;
    if (index + size > data.length) break;
    const note = noteOn(status, data[index], size === 2 ? data[index + 1] : 0);
    if (note) notes.push(note);
    index += size;
  }
  return notes;
}

export function parseMidiNoteOn(data: ArrayLike<number>): MidiNoteEvent | null {
  return parseMidiNoteOns(data)[0] ?? null;
}

export function parseNoteMidi(notes: string | null | undefined): FlowMidiCue | null {
  if (!notes) return null;
  const match = notes.match(MIDI_CUE_PATTERN);
  if (!match) return null;
  const note = midiNoteNumber(match[1]);
  if (note == null) return null;
  if (match[2] == null) return { note, velocity: null };
  const velocity = Number(match[2]);
  if (!Number.isInteger(velocity) || velocity < 1 || velocity > 127) return { note, velocity: null };
  return { note, velocity };
}

export function formatStoredMidiCue(cue: FlowMidiCue) {
  const name = midiNoteName(cue.note);
  return cue.velocity == null ? `MIDI ${name}` : `MIDI ${name} ${cue.velocity}`;
}

export function formatMidiCueLabel(cue: FlowMidiCue) {
  const name = midiNoteName(cue.note);
  return cue.velocity == null ? `${name} · Any` : `${name} · ${cue.velocity}`;
}

export function notesWithoutMidiCue(notes: string | null | undefined) {
  if (!notes) return "";
  return notes
    .replace(new RegExp(MIDI_CUE_PATTERN.source, "gi"), "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function notesWithMidiCue(notes: string | null | undefined, cue: FlowMidiCue | null) {
  const stripped = notesWithoutMidiCue(notes);
  if (!cue) return stripped || null;
  const token = formatStoredMidiCue(cue);
  return stripped ? `${stripped}\n${token}` : token;
}

/** Playback's Live map: G1, value 1 on the first line, then 2, 3, up through 12. */
export const LIVE_DEFAULT_MIDI_NOTE = midiNoteNumber("G1") ?? 43;
export const LIVE_DEFAULT_MIDI_VELOCITIES = 12;

export function defaultLiveMidiCue(playableIndex: number): FlowMidiCue | null {
  const velocity = playableIndex + 1;
  if (!Number.isInteger(playableIndex) || velocity < 1 || velocity > LIVE_DEFAULT_MIDI_VELOCITIES) return null;
  return { note: LIVE_DEFAULT_MIDI_NOTE, velocity };
}

/** Saved on this screen until someone picks another note. Matches the old G1 value 1 restart. */
export const DEFAULT_PRE_SERVICE_MIDI_CUE: FlowMidiCue = {
  note: LIVE_DEFAULT_MIDI_NOTE,
  velocity: 1,
};

/** G1 value 1 returns Live to the first pre-service line after a service. */
export function isPreServiceRestartCue(event: MidiNoteEvent, channel: number) {
  return midiCueMatches(DEFAULT_PRE_SERVICE_MIDI_CUE, event, channel);
}

function storedMidiCue(value: unknown): FlowMidiCue | null {
  if (!value || typeof value !== "object") return null;
  const note = Number((value as { note?: unknown }).note);
  if (!Number.isInteger(note) || note < 0 || note > 127) return null;
  const velocity = (value as { velocity?: unknown }).velocity;
  if (velocity == null) return { note, velocity: null };
  const parsed = Number(velocity);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 127) return { note, velocity: null };
  return { note, velocity: parsed };
}

export function normalizeMidiFollowSettings(raw: unknown): MidiFollowSettings {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const channel = Number(record.channel);
  return {
    channel: channel >= 1 && channel <= 16 ? channel : 1,
    inputId: typeof record.inputId === "string" && record.inputId ? record.inputId : null,
    preServiceCue: Object.prototype.hasOwnProperty.call(record, "preServiceCue")
      ? storedMidiCue(record.preServiceCue)
      : { ...DEFAULT_PRE_SERVICE_MIDI_CUE },
    endServiceCue: Object.prototype.hasOwnProperty.call(record, "endServiceCue")
      ? storedMidiCue(record.endServiceCue)
      : null,
  };
}

export function effectiveMidiCue(notes: string | null | undefined, playableIndex: number): FlowMidiCue | null {
  return parseNoteMidi(notes) ?? defaultLiveMidiCue(playableIndex);
}

export function midiCueMatches(cue: FlowMidiCue, event: MidiNoteEvent, channel: number) {
  if (event.channel !== channel) return false;
  if (event.note !== cue.note) return false;
  return cue.velocity == null || event.velocity === cue.velocity;
}

export function findMidiCueItem<T extends { id: string; item_type: string; notes: string | null }>(
  items: T[],
  event: MidiNoteEvent,
  channel: number,
) {
  // Playback fires one note (often a low G) and uses velocity for the slide.
  // An earlier "any velocity" line must not swallow the exact cue after it.
  let wildcard: T | null = null;
  let fallback: T | null = null;
  let playableIndex = -1;
  for (const item of items) {
    if (item.item_type === "header") continue;
    playableIndex += 1;
    const explicit = parseNoteMidi(item.notes);
    const cue = explicit ?? defaultLiveMidiCue(playableIndex);
    if (!cue || !midiCueMatches({ note: cue.note, velocity: null }, event, channel)) continue;
    if (cue.velocity == null) {
      if (!wildcard) wildcard = item;
      continue;
    }
    if (event.velocity !== cue.velocity) continue;
    if (explicit) return item;
    if (!fallback) fallback = item;
  }
  return fallback ?? wildcard;
}

export function readMidiFollowSettings(): MidiFollowSettings {
  if (typeof window === "undefined") return normalizeMidiFollowSettings(null);
  try {
    return normalizeMidiFollowSettings(JSON.parse(window.localStorage.getItem(MIDI_SETTINGS_KEY) || "null"));
  } catch {
    return normalizeMidiFollowSettings(null);
  }
}

export function writeMidiFollowSettings(settings: MidiFollowSettings) {
  window.localStorage.setItem(MIDI_SETTINGS_KEY, JSON.stringify(settings));
}

export const MIDI_NOTE_OPTIONS = Array.from({ length: 128 }, (_, note) => ({
  note,
  label: midiNoteName(note),
}));

/**
 * A MIDI cue while Playback is still inside a song must stick.
 * Remember that song and hold until its timecode actually changes.
 */
export function playbackHoldForMidiCue<T extends { id: string; item_type: string }>(
  state: { playbackSongId: string | null; currentId: string | null },
  items: T[],
  match: { id: string; item_type: string },
) {
  const songId = (id: string | null) =>
    id != null && items.some((item) => item.id === id && item.item_type === "song") ? id : null;
  const playingId = songId(state.playbackSongId) || songId(state.currentId);
  if (playingId && playingId !== match.id) {
    return { playbackSongId: playingId, hold: true };
  }
  if (match.item_type === "song") {
    return { playbackSongId: match.id, hold: false };
  }
  return { playbackSongId: state.playbackSongId, hold: true };
}

export function gatePlaybackSong(state: PlaybackGate, matchedSongId: string | null) {
  if (!matchedSongId) {
    return { ...state, take: false as const };
  }
  if (state.hold && state.lastSongId === matchedSongId) {
    return {
      currentId: state.currentId,
      lastSongId: state.lastSongId,
      hold: true,
      take: false as const,
    };
  }
  return {
    currentId: matchedSongId,
    lastSongId: matchedSongId,
    hold: false,
    take: matchedSongId !== state.currentId,
  };
}
