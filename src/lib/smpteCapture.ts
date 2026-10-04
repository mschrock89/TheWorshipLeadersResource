import {
  createTalkbackTap,
  ensureTalkbackTap,
  openSystemInput,
} from "./systemAudioInputs.ts";

export type SmpteCaptureStatus = "listening" | "error";

type SmpteCaptureHandlers = {
  audioContext: AudioContext;
  deviceId: string;
  channelIndex: number;
  onSamples: (samples: Float32Array, sampleRate: number) => void;
  onStatus: (status: SmpteCaptureStatus, message?: string) => void;
};

type TapMessage = {
  smpte?: boolean;
  rate?: number;
  samples?: Float32Array;
  channelCount?: number;
};

export function startSmpteCapture(handlers: SmpteCaptureHandlers): () => void {
  let stopped = false;
  let release = () => {};
  const context = handlers.audioContext;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    try {
      release();
    } catch {
      // The audio graph is already closed.
    }
  };

  void (async () => {
    try {
      if (!(await ensureTalkbackTap(context)) || stopped) {
        if (!stopped) handlers.onStatus("error", "This browser cannot read a SMPTE input.");
        return;
      }
      const opened = await openSystemInput(context, handlers.deviceId);
      if (stopped) {
        opened.release();
        return;
      }
      if (!opened.source) {
        opened.release();
        handlers.onStatus("error", "Could not open the SMPTE input.");
        return;
      }
      const node = createTalkbackTap(context, Math.max(opened.channelCount, handlers.channelIndex + 1));
      const silent = context.createGain();
      silent.gain.value = 0;
      opened.source.connect(node);
      node.connect(silent);
      silent.connect(context.destination);
      node.port.postMessage({ watch: [], smpte: handlers.channelIndex });
      let sawChannel = false;
      const timeout = window.setTimeout(() => {
        if (stopped || sawChannel) return;
        handlers.onStatus(
          "error",
          "That SMPTE input did not appear. In Audio MIDI Setup, set the interface to 48 channels at 48 kHz, then reload Live.",
        );
      }, 1600);
      node.port.onmessage = (event: MessageEvent<TapMessage>) => {
        if (stopped) return;
        const count = event.data?.channelCount || 0;
        if (count > handlers.channelIndex) {
          sawChannel = true;
          window.clearTimeout(timeout);
        }
        if (!event.data?.smpte || !event.data.samples?.length) return;
        handlers.onSamples(event.data.samples, event.data.rate || context.sampleRate || 48000);
      };
      release = () => {
        window.clearTimeout(timeout);
        node.port.onmessage = null;
        node.disconnect();
        silent.disconnect();
        opened.release();
      };
      handlers.onStatus("listening");
    } catch (error) {
      if (stopped) return;
      const message = error instanceof Error ? error.message : "Could not open the SMPTE input.";
      handlers.onStatus("error", message);
    }
  })();

  return stop;
}
