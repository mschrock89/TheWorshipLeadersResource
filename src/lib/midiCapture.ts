import { parseMidiNoteOn, type MidiNoteEvent } from "./serviceFlowMidi.ts";

export type MidiInputInfo = {
  id: string;
  name: string;
};

type MidiCaptureHandlers = {
  inputId: string | null;
  onInputs: (inputs: MidiInputInfo[]) => void;
  onNote: (event: MidiNoteEvent) => void;
  onStatus: (status: "listening" | "error", message?: string) => void;
};

export function startMidiCapture(handlers: MidiCaptureHandlers) {
  let stopped = false;
  const ports = new Set<MIDIInput>();

  const detach = () => {
    for (const port of ports) port.onmidimessage = null;
    ports.clear();
  };

  const bind = (access: MIDIAccess) => {
    detach();
    const inputs = Array.from(access.inputs.values()).map((port) => ({
      id: port.id,
      name: port.name || "MIDI input",
    }));
    handlers.onInputs(inputs);
    const selected = handlers.inputId ? access.inputs.get(handlers.inputId) : null;
    const targets = selected ? [selected] : Array.from(access.inputs.values());
    if (targets.length === 0) {
      handlers.onStatus("error", "No MIDI input is connected.");
      return;
    }
    for (const port of targets) {
      port.onmidimessage = (message) => {
        if (stopped || !message.data) return;
        const note = parseMidiNoteOn(message.data);
        if (note) handlers.onNote(note);
      };
      ports.add(port);
    }
    handlers.onStatus("listening");
  };

  if (!navigator.requestMIDIAccess) {
    handlers.onStatus("error", "This browser cannot read MIDI.");
    return () => {};
  }

  navigator.requestMIDIAccess().then(
    (access) => {
      if (stopped) return;
      bind(access);
      access.onstatechange = () => {
        if (!stopped) bind(access);
      };
    },
    () => {
      if (!stopped) handlers.onStatus("error", "MIDI access was blocked.");
    },
  );

  return () => {
    stopped = true;
    detach();
  };
}
