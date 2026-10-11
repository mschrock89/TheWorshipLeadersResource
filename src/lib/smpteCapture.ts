import {
  captureUsesWorklet,
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

type AudioPlaneFrame = {
  numberOfChannels: number;
  numberOfFrames: number;
  sampleRate: number;
  copyTo: (destination: Float32Array, options: { planeIndex: number; format?: string }) => void;
  close: () => void;
};

function trackProcessor(track: MediaStreamTrack) {
  const Processor = (
    globalThis as unknown as {
      MediaStreamTrackProcessor?: new (init: { track: MediaStreamTrack }) => {
        readable: ReadableStream<AudioPlaneFrame>;
      };
    }
  ).MediaStreamTrackProcessor;
  if (!Processor) return null;
  try {
    return new Processor({ track });
  } catch {
    return null;
  }
}

function copyPlane(frame: AudioPlaneFrame, channelIndex: number) {
  if (channelIndex >= frame.numberOfChannels || frame.numberOfFrames < 1) return null;
  const planar = new Float32Array(frame.numberOfFrames);
  const options = [
    { planeIndex: channelIndex, format: "f32-planar" },
    { planeIndex: channelIndex, format: "f32" },
    { planeIndex: channelIndex },
  ];
  for (const option of options) {
    try {
      frame.copyTo(planar, option);
      return planar;
    } catch {
      // This browser lays the frame out a different way.
    }
  }
  return null;
}

export function startSmpteCapture(handlers: SmpteCaptureHandlers): () => void {
  let stopped = false;
  const releases: Array<() => void> = [];
  const timeouts: number[] = [];
  const readers: Array<{ cancel: () => void }> = [];
  const context = handlers.audioContext;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    for (const timeout of timeouts) window.clearTimeout(timeout);
    for (const reader of readers) reader.cancel();
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
          const highest = Math.max(...group.map((listen) => listen.channelIndex));
          const needed = highest + 1;
          if (!opened.source || !captureUsesWorklet(opened.heardChannelCount, opened.channelCount, needed)) {
            const read = await readSmptePlanes(opened, group, handlers, readers, () => stopped);
            if (read) openedAny = true;
            else if (!stopped) {
              failed = true;
              handlers.onStatus(
                "error",
                "A SMPTE input did not appear. In Audio MIDI Setup, set the interface to 48 channels at 48 kHz, then reload Live.",
              );
            }
            continue;
          }
          const node = createTalkbackTap(context, Math.max(opened.channelCount, needed));
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

async function readSmptePlanes(
  opened: Awaited<ReturnType<typeof openSystemInput>>,
  group: SmpteListen[],
  handlers: SmpteCaptureHandlers,
  readers: Array<{ cancel: () => void }>,
  isStopped: () => boolean,
) {
  const track = opened.stream.getAudioTracks()[0];
  const processor = track ? trackProcessor(track) : null;
  if (!processor) {
    opened.release();
    return false;
  }
  const reader = processor.readable.getReader();
  let cancelled = false;
  readers.push({
    cancel: () => {
      cancelled = true;
      void reader.cancel().catch(() => undefined);
    },
  });

  const deliver = (frame: AudioPlaneFrame) => {
    const rate = frame.sampleRate || 48000;
    let saw = false;
    for (const listen of group) {
      if (listen.channelIndex >= frame.numberOfChannels) continue;
      const samples = copyPlane(frame, listen.channelIndex);
      if (!samples?.length) continue;
      saw = true;
      handlers.onSamples(listen.source, samples, rate);
    }
    return saw;
  };

  try {
    const first = await reader.read();
    if (isStopped() || cancelled || !first.value) {
      first.value?.close();
      opened.release();
      return false;
    }
    const saw = deliver(first.value);
    first.value.close();
    if (!saw) {
      opened.release();
      return false;
    }
    void (async () => {
      try {
        while (!isStopped() && !cancelled) {
          const next = await reader.read();
          if (next.done || !next.value) break;
          deliver(next.value);
          next.value.close();
        }
      } catch {
        // The reader was cancelled when listening stopped.
      } finally {
        opened.release();
      }
    })();
    return true;
  } catch {
    opened.release();
    return isStopped();
  }
}
