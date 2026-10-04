import { nextNoiseFloor, phraseLevelIsVoice, shouldTranscribePhrase } from "./talkbackPhrase.ts";
import { concatFloats, downsampleMono, encodeMonoWavBytes, rmsFloat } from "./talkbackPcm.ts";

const WAV_RATE = 16000;
const LIVE_RATE = 24000;
const LIVE_WINDOW = Math.round(LIVE_RATE * 0.08);
const LEVEL_INTERVAL_MS = 80;

type WorkerChannel = {
  id: string;
  channelIndex: number;
};

type AudioPlaneFrame = {
  numberOfChannels: number;
  numberOfFrames: number;
  sampleRate: number;
  copyTo: (destination: Float32Array, options: { planeIndex: number; format?: string }) => void;
  close: () => void;
};

type ChannelPhrase = {
  chunks: Float32Array[];
  startedAt: number;
  lastVoiceAt: number;
  live: Float32Array[];
  liveSamples: number;
};

type WorkerGlobal = {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};

const scope = globalThis as unknown as WorkerGlobal;

function readPlane(frame: AudioPlaneFrame, channelIndex: number, reuse: Float32Array | null) {
  if (channelIndex >= frame.numberOfChannels || frame.numberOfFrames < 1) return null;
  const planar = reuse && reuse.length === frame.numberOfFrames ? reuse : new Float32Array(frame.numberOfFrames);
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
  try {
    const interleaved = new Float32Array(frame.numberOfFrames * frame.numberOfChannels);
    frame.copyTo(interleaved, { planeIndex: 0, format: "f32" });
    for (let index = 0; index < frame.numberOfFrames; index += 1) {
      planar[index] = interleaved[index * frame.numberOfChannels + channelIndex];
    }
    return planar;
  } catch {
    return null;
  }
}

function postPhrase(channelId: string, phrase: ChannelPhrase) {
  const wav = encodeMonoWavBytes(concatFloats(phrase.chunks), WAV_RATE);
  scope.postMessage({ type: "phrase", channelId, wav }, [wav]);
}

function flushLive(channelId: string, phrase: ChannelPhrase) {
  if (!phrase.liveSamples) return;
  const merged = concatFloats(phrase.live);
  phrase.live = [];
  phrase.liveSamples = 0;
  scope.postMessage({ type: "audio", channelId, rate: LIVE_RATE, pcm: merged.buffer }, [merged.buffer]);
}

function rememberLive(phrase: ChannelPhrase, samples: Float32Array, rate: number) {
  const converted = downsampleMono(samples, rate, LIVE_RATE);
  const copy = converted === samples ? new Float32Array(samples) : converted;
  phrase.live.push(copy);
  phrase.liveSamples += copy.length;
}

async function run(readable: ReadableStream<AudioPlaneFrame>, channels: WorkerChannel[], isStopped: () => boolean) {
  const reader = readable.getReader();
  const phrases = new Map<string, ChannelPhrase>();
  const lastLevelAt = new Map<string, number>();
  const floors = new Map<string, number>();
  const phase = new Map<string, string>();
  const planes = new Map<number, Float32Array>();

  const setPhase = (channelId: string, next: string, message?: string) => {
    if (phase.get(channelId) === next) return;
    phase.set(channelId, next);
    scope.postMessage({ type: "status", channelId, phase: next, message });
  };

  for (const channel of channels) {
    phase.set(channel.id, "listening");
    scope.postMessage({ type: "status", channelId: channel.id, phase: "listening" });
  }

  const onFrame = (frame: AudioPlaneFrame) => {
    const rate = frame.sampleRate || 48000;
    const now = performance.now();
    const levels: Array<{ channelId: string; level: number }> = [];
    let sawChannel = false;
    let readOne = false;
    for (const channel of channels) {
      if (channel.channelIndex >= frame.numberOfChannels) {
        setPhase(
          channel.id,
          "error",
          `This browser only passed through ${frame.numberOfChannels} of the interface channels.`,
        );
        continue;
      }
      sawChannel = true;
      const samples = readPlane(frame, channel.channelIndex, planes.get(channel.channelIndex) || null);
      if (!samples) continue;
      planes.set(channel.channelIndex, samples);
      readOne = true;
      const level = rmsFloat(samples);
      if ((lastLevelAt.get(channel.id) || 0) + LEVEL_INTERVAL_MS <= now) {
        lastLevelAt.set(channel.id, now);
        levels.push({ channelId: channel.id, level });
      }
      const open = phrases.get(channel.id);
      const floor = floors.get(channel.id) || 0;
      const speaking = phraseLevelIsVoice(level, Boolean(open), floor);
      if (!speaking) floors.set(channel.id, nextNoiseFloor(floor, level, false));
      if (speaking) {
        setPhase(channel.id, "hearing");
        const piece = downsampleMono(samples, rate, WAV_RATE);
        const stored = piece === samples ? new Float32Array(piece) : piece;
        if (!open) phrases.set(channel.id, { chunks: [stored], startedAt: now, lastVoiceAt: now, live: [], liveSamples: 0 });
        else {
          open.chunks.push(stored);
          open.lastVoiceAt = now;
        }
        const current = phrases.get(channel.id);
        if (current) {
          rememberLive(current, samples, rate);
          if (current.liveSamples >= LIVE_WINDOW) flushLive(channel.id, current);
        }
      }
      const phrase = phrases.get(channel.id);
      if (!phrase) {
        if (!speaking && phase.get(channel.id) === "hearing") setPhase(channel.id, "listening");
        continue;
      }
      if (shouldTranscribePhrase(now - phrase.startedAt, now - phrase.lastVoiceAt)) {
        phrases.delete(channel.id);
        flushLive(channel.id, phrase);
        postPhrase(channel.id, phrase);
        if (!speaking) setPhase(channel.id, "listening");
      }
    }
    if (levels.length) scope.postMessage({ type: "levels", levels });
    if (sawChannel && !readOne) return false;
    return true;
  };

  try {
    const first = await reader.read();
    if (isStopped()) return;
    if (!first.value || onFrame(first.value) === false) {
      first.value?.close();
      scope.postMessage({ type: "unsupported" });
      return;
    }
    first.value.close();
    scope.postMessage({ type: "ready" });
    while (!isStopped()) {
      const next = await reader.read();
      if (next.done || !next.value) break;
      onFrame(next.value);
      next.value.close();
    }
  } catch {
    if (isStopped()) return;
    scope.postMessage({ type: "unsupported" });
    return;
  } finally {
    void reader.cancel().catch(() => undefined);
  }
  scope.postMessage({ type: "done" });
}

let stopped = false;

scope.onmessage = (event: MessageEvent) => {
  const data = event.data as { type?: string; readable?: ReadableStream<AudioPlaneFrame>; channels?: WorkerChannel[] };
  if (data?.type === "stop") {
    stopped = true;
    return;
  }
  if (data?.type !== "start" || !data.readable || !data.channels) return;
  void run(data.readable, data.channels, () => stopped);
};
