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

/** Call this inside a click. Chrome ignores MIDI permission requests that start on page load. */
export function openMidiAccess() {
  if (!navigator.requestMIDIAccess) {
    return Promise.reject(new DOMException("This browser cannot read MIDI.", "NotSupportedError"));
  }
  const request = navigator.requestMIDIAccess.bind(navigator);
  return request({ software: true }).catch((error: unknown) => {
    const name = error instanceof DOMException ? error.name : "";
    // Another call from the rejection is no longer part of the click, so Chrome blocks it.
    if (name === "SecurityError" || name === "NotAllowedError" || name === "InvalidStateError") throw error;
    return request();
  });
}

export function readMidiPermission() {
  const permissions = navigator.permissions;
  if (!permissions?.query) return Promise.resolve("unknown" as const);
  return permissions
    .query({ name: "midi" as PermissionName })
    .then((status) => status.state)
    .catch(() => "unknown" as const);
}

export function startMidiCapture(handlers: MidiCaptureHandlers & { accessPromise?: Promise<MIDIAccess> | null }) {
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
        for (const note of parseMidiNoteOns(message.data)) handlers.onNote(note);
      };
      void port.open?.();
      ports.add(port);
    }
    handlers.onStatus("listening");
  };

  const fail = () => {
    if (!stopped) handlers.onStatus("error", "MIDI access was blocked.");
  };

  const listen = (access: MIDIAccess) => {
    if (stopped) return;
    bind(access);
    access.onstatechange = () => {
      if (!stopped) bind(access);
    };
  };

  if (!navigator.requestMIDIAccess) {
    handlers.onStatus("error", "This browser cannot read MIDI.");
    return () => {};
  }

  // Mesh is a virtual port. Browsers hide those unless software ports are requested.
  const pending = handlers.accessPromise ?? openMidiAccess();
  pending.then(listen, (error: unknown) => {
    if (stopped) return;
    const name = error instanceof DOMException ? error.name : "";
    if (name === "SecurityError" || name === "NotAllowedError") {
      handlers.onStatus("error", "MIDI access was blocked. Allow MIDI for this site, then open MIDI again.");
      return;
    }
    fail();
  });

  return () => {
    stopped = true;
    detach();
  };
}
