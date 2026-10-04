import {
  createTalkbackTap,
  ensureTalkbackTap,
  openSystemInput,
} from "./systemAudioInputs.ts";

export type SmpteCaptureStatus = "listening" | "error";
export type SmpteCaptureSource = "propresenter" | "playback";

export type SmpteListen = {
  source: SmpteCaptureSource;
  deviceId: string;
  channelIndex: number;
};

type SmpteCaptureHandlers = {
  audioContext: AudioContext;
  listens: SmpteListen[];
  onSamples: (source: SmpteCaptureSource, samples: Float32Array, sampleRate: number) => void;
  onStatus: (status: SmpteCaptureStatus, message?: string) => void;
};

type TapMessage = {
  smpte?: boolean;
  channelIndex?: number;
  rate?: number;
  samples?: Float32Array;
  channelCount?: number;
};

export function startSmpteCapture(handlers: SmpteCaptureHandlers): () => void {
  let stopped = false;
  const releases: Array<() => void> = [];
  const timeouts: number[] = [];
  const context = handlers.audioContext;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    for (const timeout of timeouts) window.clearTimeout(timeout);
    for (const release of releases) {
      try {
        release();
      } catch {
        // The audio graph is already closed.
      }
    }
  };

  void (async () => {
    try {
      if (!(await ensureTalkbackTap(context)) || stopped) {
        if (!stopped) handlers.onStatus("error", "This browser cannot read a SMPTE input.");
        return;
      }
      const groups = new Map<string, SmpteListen[]>();
      for (const listen of handlers.listens) {
        const group = groups.get(listen.deviceId) || [];
        group.push(listen);
        groups.set(listen.deviceId, group);
      }
      let openedAny = false;
      let failed = false;
      for (const [deviceId, group] of groups) {
        if (stopped) return;
        try {
          const opened = await openSystemInput(context, deviceId);
          if (stopped) {
            opened.release();
            return;
          }
          if (!opened.source) {
            opened.release();
            failed = true;
            handlers.onStatus("error", "Could not open a SMPTE input.");
            continue;
          }
          const highest = Math.max(...group.map((listen) => listen.channelIndex));
          const node = createTalkbackTap(context, Math.max(opened.channelCount, highest + 1));
          const silent = context.createGain();
          silent.gain.value = 0;
          opened.source.connect(node);
          node.connect(silent);
          silent.connect(context.destination);
          node.port.postMessage({ watch: [], smpteChannels: group.map((listen) => listen.channelIndex) });
          const wanted = new Set(group.map((listen) => listen.channelIndex));
          let sawChannel = false;
          const timeout = window.setTimeout(() => {
            if (stopped || sawChannel) return;
            handlers.onStatus(
              "error",
              "A SMPTE input did not appear. In Audio MIDI Setup, set the interface to 48 channels at 48 kHz, then reload Live.",
            );
          }, 1600);
          timeouts.push(timeout);
          node.port.onmessage = (event: MessageEvent<TapMessage>) => {
            if (stopped) return;
            const count = event.data?.channelCount || 0;
            if ([...wanted].some((index) => count > index)) {
              sawChannel = true;
              window.clearTimeout(timeout);
            }
            if (!event.data?.smpte || !event.data.samples?.length || typeof event.data.channelIndex !== "number") return;
            const channelIndex = event.data.channelIndex;
            const rate = event.data.rate || context.sampleRate || 48000;
            for (const listen of group) {
              if (listen.channelIndex !== channelIndex) continue;
              handlers.onSamples(listen.source, event.data.samples, rate);
            }
          };
          releases.push(() => {
            window.clearTimeout(timeout);
            node.port.onmessage = null;
            node.disconnect();
            silent.disconnect();
            opened.release();
          });
          openedAny = true;
        } catch (error) {
          failed = true;
          const message = error instanceof Error ? error.message : "Could not open a SMPTE input.";
          handlers.onStatus("error", message);
        }
      }
      if (!stopped && openedAny && !failed) handlers.onStatus("listening");
    } catch (error) {
      if (stopped) return;
      const message = error instanceof Error ? error.message : "Could not open a SMPTE input.";
      handlers.onStatus("error", message);
    }
  })();

  return stop;
}
