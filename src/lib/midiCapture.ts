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

const listeners = new Set<(access: MIDIAccess) => void>();
const failures = new Set<(error: unknown) => void>();
let accessPromise: Promise<MIDIAccess> | null = null;
let sharedAccess: MIDIAccess | null = null;

function midiRequest() {
  const request = navigator.requestMIDIAccess?.bind(navigator);
  return request ?? null;
}

/**
 * Chrome on Mac creates one CoreMIDI client. A second requestMIDIAccess while
 * that client is still starting — including a plain request plus `{ software: true }`
 * — rejects both with InvalidStateError: "Platform dependent initialization failed."
 * Virtual ports such as Mesh only appear when software ports are requested, so
 * that option has to be the one session, with a fallback only after it settles.
 */
async function openSession() {
  const request = midiRequest();
  if (!request) throw new DOMException("This browser cannot read MIDI.", "NotSupportedError");

  const attempt = async () => {
    try {
      return await request({ software: true });
    } catch (softwareError) {
      // A failed platform startup must not be followed by another request.
      // That second call is what leaves CoreMIDI unable to start.
      if (softwareError instanceof DOMException && softwareError.name === "InvalidStateError") {
        throw softwareError;
      }
      return request();
    }
  };

  try {
    return await attempt();
  } catch (error) {
    if (!(error instanceof DOMException) || error.name !== "InvalidStateError") throw error;
    await new Promise((resolve) => window.setTimeout(resolve, 500));
    return attempt();
  }
}

function primeMidiAccess() {
  if (sharedAccess) return Promise.resolve(sharedAccess);
  if (!accessPromise) {
    accessPromise = openSession().then(
      (access) => {
        sharedAccess = access;
        access.onstatechange = () => {
          for (const listener of listeners) listener(access);
        };
        for (const listener of listeners) listener(access);
        return access;
      },
      (error: unknown) => {
        accessPromise = null;
        for (const notify of failures) notify(error);
        throw error;
      },
    );
  }
  return accessPromise;
}

async function midiPermission(): Promise<"granted" | "prompt" | "denied" | "unknown"> {
  try {
    const status = await navigator.permissions?.query({ name: "midi" } as PermissionDescriptor);
    if (status?.state === "granted" || status?.state === "prompt" || status?.state === "denied") {
      return status.state;
    }
  } catch {
    // The Permissions API can be missing. A direct request is still valid.
  }
  return "unknown";
}

/** Call this from the MIDI button click so a refused startup can be tried again. */
export function requestSoftwareMidiAccess() {
  if (!midiRequest() || sharedAccess || accessPromise) return;
  void primeMidiAccess().catch(() => {});
}

function blockedMessage(error: unknown) {
  const name = error instanceof DOMException ? error.name : "";
  const message = error instanceof Error ? error.message : "";
  if (name === "InvalidStateError") {
    return "MIDI could not start in this browser. Quit the browser completely, reopen it, and tap MIDI.";
  }
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
      const opening = port.open?.();
      if (opening) void opening.catch(() => {});
      ports.add(port);
    }
    handlers.onStatus("listening");
  };

  const fail = (error: unknown) => {
    if (!stopped) handlers.onStatus("error", blockedMessage(error));
  };

  if (!midiRequest()) {
    handlers.onStatus("error", "This browser cannot read MIDI.");
    return () => {};
  }

  listeners.add(bind);
  failures.add(fail);
  if (sharedAccess) bind(sharedAccess);
  else if (!accessPromise) {
    void midiPermission().then((state) => {
      if (stopped || sharedAccess || accessPromise) return;
      if (state === "prompt" || state === "denied") {
        handlers.onStatus("error", "Tap MIDI to let this browser hear notes.");
        return;
      }
      void primeMidiAccess().catch(() => {});
    });
  }

  return () => {
    stopped = true;
    listeners.delete(bind);
    failures.delete(fail);
    detach();
  };
}
