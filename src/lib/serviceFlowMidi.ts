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
  const octave = Math.floor(note / 12) - 1;
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
  const note = (Number(match[3]) + 1) * 12 + semitone + offset;
  return note >= 0 && note <= 127 ? note : null;
}

export function parseMidiNoteOn(data: ArrayLike<number>): MidiNoteEvent | null {
  if (data.length < 3) return null;
  const status = data[0];
  const note = data[1];
  const velocity = data[2];
  if ((status & 0xf0) !== 0x90) return null;
  if (note < 0 || note > 127 || velocity <= 0 || velocity > 127) return null;
  return { channel: (status & 0x0f) + 1, note, velocity };
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
  for (const item of items) {
    if (item.item_type === "header") continue;
    const cue = parseNoteMidi(item.notes);
    if (cue && midiCueMatches(cue, event, channel)) return item;
  }
  return null;
}

export function readMidiFollowSettings(): MidiFollowSettings {
  if (typeof window === "undefined") return { channel: 1, inputId: null };
  try {
    const raw = JSON.parse(window.localStorage.getItem(MIDI_SETTINGS_KEY) || "");
    const channel = Number(raw?.channel);
    return {
      channel: channel >= 1 && channel <= 16 ? channel : 1,
      inputId: typeof raw?.inputId === "string" && raw.inputId ? raw.inputId : null,
    };
  } catch {
    return { channel: 1, inputId: null };
  }
}

export function writeMidiFollowSettings(settings: MidiFollowSettings) {
  window.localStorage.setItem(MIDI_SETTINGS_KEY, JSON.stringify(settings));
}

export const MIDI_NOTE_OPTIONS = Array.from({ length: 128 }, (_, note) => ({
  note,
  label: midiNoteName(note),
}));

export function gatePlaybackSong(state: PlaybackGate, matchedSongId: string | null) {
  if (!matchedSongId) {
    return { ...state, take: false as const };
  }
  if (state.hold) {
    if (state.lastSongId && matchedSongId !== state.lastSongId) {
      return { currentId: matchedSongId, lastSongId: matchedSongId, hold: false, take: true as const };
    }
    return {
      currentId: state.currentId,
      lastSongId: state.lastSongId ?? matchedSongId,
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
