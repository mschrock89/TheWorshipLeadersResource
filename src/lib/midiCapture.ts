import { parseMidiNoteOns, type MidiNoteEvent } from "./serviceFlowMidi.ts";

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

let grantedAccess: Promise<MIDIAccess> | null = null;
let softwareAccess: Promise<MIDIAccess> | null = null;
const softwareListeners = new Set<(access: MIDIAccess) => void>();

function midiRequest() {
  const request = navigator.requestMIDIAccess?.bind(navigator);
  return request ?? null;
}

/** Uses the MIDI permission Chrome already shows as allowed. */
function requestGrantedAccess() {
  const request = midiRequest();
  if (!request) return Promise.reject(new DOMException("This browser cannot read MIDI.", "NotSupportedError"));
  if (!grantedAccess) {
    grantedAccess = request().catch((error: unknown) => {
      grantedAccess = null;
      throw error;
    });
  }
  return grantedAccess;
}

/**
 * Call this from the MIDI button click. Virtual ports such as Mesh need this
 * option, and a refusal must not replace an access Chrome has already granted.
 */
export function requestSoftwareMidiAccess() {
  const request = midiRequest();
  if (!request || softwareAccess) return;
  try {
    softwareAccess = request({ software: true });
  } catch (error) {
    softwareAccess = Promise.reject(error);
  }
  softwareAccess.then((access) => {
    for (const listener of softwareListeners) listener(access);
  }, () => {
    softwareAccess = null;
  });
}

function blockedMessage(error: unknown) {
  const name = error instanceof DOMException ? error.name : "";
  const message = error instanceof Error ? error.message : "";
  if (!name && !message) return "MIDI access was blocked.";
  return `MIDI access was blocked (${[name, message].filter(Boolean).join(": ")}).`;
}

export function startMidiCapture(handlers: MidiCaptureHandlers) {
  let stopped = false;
  const ports = new Set<MIDIInput>();

  const detach = () => {
    for (const port of ports) port.onmidimessage = null;
    ports.clear();
  };

  const bind = (access: MIDIAccess) => {
    if (stopped) return;
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
        for (const note of parseMidiNoteOns(message.data)) handlers.onNote(note);
      };
      void port.open?.();
      ports.add(port);
    }
    handlers.onStatus("listening");
  };

  if (!midiRequest()) {
    handlers.onStatus("error", "This browser cannot read MIDI.");
    return () => {};
  }

  requestGrantedAccess().then(bind, (error: unknown) => {
    if (!stopped) handlers.onStatus("error", blockedMessage(error));
  });
  const onSoftware = (access: MIDIAccess) => bind(access);
  softwareListeners.add(onSoftware);
  softwareAccess?.then(onSoftware, () => {});

  return () => {
    stopped = true;
    softwareListeners.delete(onSoftware);
    detach();
  };
}
