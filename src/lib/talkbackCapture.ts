import { rmsFromTimeDomain } from "./liveMode.ts";
import { captureUsesWorklet, createTalkbackTap, ensureTalkbackTap, openSystemInput, splitterChannelCount, type OpenedSystemInput } from "./systemAudioInputs.ts";
import { nextNoiseFloor, phraseLevelIsVoice, shouldTranscribePhrase, talkbackMeterLevel } from "./talkbackPhrase.ts";

export type TalkbackCaptureChannel = {
  id: string;
  deviceId: string;
  channelIndex: number;
};

export type TalkbackCaptureStatus = "listening" | "hearing" | "error";

const LEVEL_INTERVAL_MS = 80;
const WAV_RATE = 16000;
const MAX_WAV_SAMPLES = Math.floor((350_000 - 44) / 2);

type CaptureHandlers = {
  audioContext: AudioContext;
  channels: TalkbackCaptureChannel[];
  transcribe: (blob: Blob) => Promise<string>;
  onTranscript: (channelId: string, text: string) => void;
  onLevel: (channelId: string, level: number) => void;
  onStatus: (channelId: string, status: TalkbackCaptureStatus, message?: string) => void;
};

type ActiveUtterance = {
  recorder: MediaRecorder;
  chunks: Blob[];
  startedAt: number;
  lastVoiceAt: number;
};

type TapMessage = {
  channelCount?: number;
  rate?: number;
  channels?: Array<{ index: number; rms: number; peak?: number; samples: Float32Array }>;
};

async function watchTalkbackTap(
  context: AudioContext,
  source: MediaStreamAudioSourceNode,
  inputCount: number,
  channels: TalkbackCaptureChannel[],
  handlers: CaptureHandlers,
  isStopped: () => boolean,
  cleanups: Array<() => void>,
  timers: number[],
) {
  if (!(await ensureTalkbackTap(context))) return false;
  const needed = channels.reduce((max, channel) => Math.max(max, channel.channelIndex + 1), 1);
  const node = createTalkbackTap(context, Math.max(inputCount, needed));
  const silent = context.createGain();
  silent.gain.value = 0;
  source.connect(node);
  node.connect(silent);
  silent.connect(context.destination);
  node.port.postMessage({ watch: channels.map((channel) => channel.channelIndex) });

  const floors = new Map<string, number>();
  const phrases = new Map<string, ChannelPhrase>();
  const phase = new Map<string, TalkbackCaptureStatus>();
  let seenChannels = 0;

  const setPhase = (channelId: string, next: TalkbackCaptureStatus, message?: string) => {
    if (phase.get(channelId) === next && !message) return;
    phase.set(channelId, next);
    handlers.onStatus(channelId, next, message);
  };

  for (const channel of channels) {
    phase.set(channel.id, "listening");
    handlers.onStatus(channel.id, "listening");
  }

  const flush = (channelId: string, phrase: ChannelPhrase) => {
    phrases.delete(channelId);
    const wav = encodeMonoWav(concatFloats(phrase.chunks), WAV_RATE);
    if (wav.size < 1500 || isStopped()) return;
    void handlers
      .transcribe(wav)
      .then((text) => {
        if (!isStopped() && text.trim()) handlers.onTranscript(channelId, text);
      })
      .catch((error: unknown) => {
        if (isStopped()) return;
        const message = error instanceof Error ? error.message : "Transcription failed.";
        setPhase(channelId, "error", message);
      });
  };

  node.port.onmessage = (event: MessageEvent<TapMessage>) => {
    if (isStopped()) return;
    const count = event.data?.channelCount || 0;
    if (count > seenChannels) seenChannels = count;
    const rate = event.data?.rate || context.sampleRate || 48000;
    const now = performance.now();
    for (const heard of event.data?.channels || []) {
      const channel = channels.find((entry) => entry.channelIndex === heard.index);
      if (!channel) continue;
      const level = heard.rms || 0;
      const open = phrases.get(channel.id);
      const floor = floors.get(channel.id) || 0;
      const speaking = phraseLevelIsVoice(level, Boolean(open), floor);
      if (!speaking) floors.set(channel.id, nextNoiseFloor(floor, level, false));
      handlers.onLevel(channel.id, talkbackMeterLevel(heard.peak || level));
      if (speaking) {
        setPhase(channel.id, "hearing");
        const piece = downsampleMono(heard.samples, rate, WAV_RATE);
        if (!open) phrases.set(channel.id, { chunks: [piece], startedAt: now, lastVoiceAt: now });
        else {
          open.chunks.push(piece);
          open.lastVoiceAt = now;
        }
      }
      const phrase = phrases.get(channel.id);
      if (!phrase) {
        if (!speaking && phase.get(channel.id) === "hearing") setPhase(channel.id, "listening");
        continue;
      }
      if (shouldTranscribePhrase(now - phrase.startedAt, now - phrase.lastVoiceAt)) {
        flush(channel.id, phrase);
        if (!speaking) setPhase(channel.id, "listening");
      }
    }
  };

  timers.push(
    window.setTimeout(() => {
      if (isStopped() || seenChannels < 1) return;
      for (const channel of channels) {
        if (channel.channelIndex < seenChannels) continue;
        setPhase(
          channel.id,
          "error",
          `This browser can only separate the first ${seenChannels} inputs on this interface.`,
        );
      }
    }, 500),
  );

  cleanups.push(() => {
    node.port.onmessage = null;
    node.disconnect();
    silent.disconnect();
  });
  return true;
}

function preferredMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) return "audio/webm;codecs=opus";
  if (MediaRecorder.isTypeSupported("audio/webm")) return "audio/webm";
  if (MediaRecorder.isTypeSupported("audio/mp4")) return "audio/mp4";
  return "";
}

export function startTalkbackCapture(handlers: CaptureHandlers): () => void {
  let stopped = false;
  const streams: MediaStream[] = [];
  const timers: number[] = [];
  const readers: ReadableStreamDefaultReader<AudioPlaneFrame>[] = [];
  const cleanups: Array<() => void> = [];
  const recorders = new Map<string, ActiveUtterance>();
  const context = handlers.audioContext;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    for (const timer of timers) window.clearInterval(timer);
    for (const utterance of recorders.values()) {
      try {
        if (utterance.recorder.state !== "inactive") utterance.recorder.stop();
      } catch {
        // The audio context may already be closed.
      }
    }
    recorders.clear();
    for (const cleanup of cleanups) {
      try {
        cleanup();
      } catch {
        // The audio graph is already closed.
      }
    }
    for (const reader of readers) void reader.cancel().catch(() => undefined);
    for (const stream of streams) stream.getTracks().forEach((track) => track.stop());
  };

  void (async () => {
    const mimeType = preferredMimeType();
    if (!mimeType) {
      for (const channel of handlers.channels) {
        handlers.onStatus(channel.id, "error", "This browser cannot record talkback audio.");
      }
      return;
    }

    const byDevice = new Map<string, TalkbackCaptureChannel[]>();
    for (const channel of handlers.channels) {
      const group = byDevice.get(channel.deviceId) || [];
      group.push(channel);
      byDevice.set(channel.deviceId, group);
    }

    for (const [deviceId, channels] of byDevice) {
      if (stopped) return;
      const needed = Math.max(...channels.map((channel) => channel.channelIndex)) + 1;
      try {
        const opened = await openSystemInput(context, deviceId);
        if (stopped) {
          opened.release();
          return;
        }
        const useWorklet = Boolean(
          opened.source && captureUsesWorklet(opened.heardChannelCount, opened.channelCount, needed),
        );
        if (useWorklet && opened.source && (await watchTalkbackTap(context, opened.source, opened.channelCount, channels, handlers, () => stopped, cleanups, timers))) {
          cleanups.push(opened.release);
          continue;
        }
        const heardRaw = await monitorOpenedChannels(opened, handlers, channels, () => stopped, readers);
        if (heardRaw || stopped) continue;
        const trackLive = opened.stream.getAudioTracks().some((track) => track.readyState === "live");
        let source = trackLive ? opened.source : null;
        let reported = opened.channelCount;
        let available = splitterChannelCount(reported, opened.nodeChannelCount);
        if (!source || needed > available) {
          opened.release();
          const fallback = await openSystemInput(context, deviceId);
          if (stopped) {
            fallback.release();
            return;
          }
          source = fallback.source;
          reported = fallback.channelCount;
          available = splitterChannelCount(reported, fallback.nodeChannelCount);
          streams.push(fallback.stream);
        } else {
          streams.push(opened.stream);
        }
        if (!source) {
          for (const channel of channels) {
            handlers.onStatus(channel.id, "error", "Could not open that audio input.");
          }
          continue;
        }
        const splitter = context.createChannelSplitter(Math.max(available, 1));
        source.connect(splitter);

        for (const channel of channels) {
          if (channel.channelIndex >= available) {
            handlers.onStatus(
              channel.id,
              "error",
              reported > available
                ? `This browser can only separate the first ${available} of ${reported} inputs.`
                : available <= 2
                  ? "This browser opened that interface as stereo. Set it to 48 channels at 48 kHz in Audio MIDI Setup, then reload in Safari."
                  : `This input only has ${available} channel${available === 1 ? "" : "s"}.`,
            );
            continue;
          }

          const gain = context.createGain();
          splitter.connect(gain, channel.channelIndex);
          const analyser = context.createAnalyser();
          analyser.fftSize = 1024;
          gain.connect(analyser);
          const destination = context.createMediaStreamDestination();
          gain.connect(destination);
          const silent = context.createGain();
          silent.gain.value = 0;
          analyser.connect(silent);
          silent.connect(context.destination);

          const samples = new Uint8Array(analyser.fftSize);
          let phase: TalkbackCaptureStatus = "listening";
          handlers.onStatus(channel.id, "listening");

          const setPhase = (next: TalkbackCaptureStatus, message?: string) => {
            if (phase === next && !message) return;
            phase = next;
            handlers.onStatus(channel.id, next, message);
          };

          const flush = (utterance: ActiveUtterance) => {
            recorders.delete(channel.id);
            const recorder = utterance.recorder;
            recorder.onstop = () => {
              const blob = new Blob(utterance.chunks, { type: recorder.mimeType || mimeType });
              if (blob.size < 1500 || stopped) return;
              void handlers
                .transcribe(blob)
                .then((text) => {
                  if (!stopped && text.trim()) handlers.onTranscript(channel.id, text);
                })
                .catch((error: unknown) => {
                  if (stopped) return;
                  const message = error instanceof Error ? error.message : "Transcription failed.";
                  setPhase("error", message);
                });
            };
            if (recorder.state !== "inactive") recorder.stop();
          };

          const timer = window.setInterval(() => {
            if (stopped) return;
            analyser.getByteTimeDomainData(samples);
            const level = rmsFromTimeDomain(samples);
            handlers.onLevel(channel.id, level);
            const now = performance.now();
            let utterance = recorders.get(channel.id);
            const speaking = phraseLevelIsVoice(level, Boolean(utterance));

            if (speaking) {
              setPhase("hearing");
              if (!utterance) {
                const chunks: Blob[] = [];
                const recorder = new MediaRecorder(destination.stream, { mimeType });
                recorder.ondataavailable = (event) => {
                  if (event.data.size > 0) chunks.push(event.data);
                };
                recorder.start();
                utterance = { recorder, chunks, startedAt: now, lastVoiceAt: now };
                recorders.set(channel.id, utterance);
              } else {
                utterance.lastVoiceAt = now;
              }
            }

            utterance = recorders.get(channel.id);
            if (!utterance) {
              if (!speaking && phase === "hearing") setPhase("listening");
              return;
            }
            const elapsed = now - utterance.startedAt;
            const quietFor = now - utterance.lastVoiceAt;
            if (shouldTranscribePhrase(elapsed, quietFor)) {
              flush(utterance);
              if (!speaking) setPhase("listening");
            }
          }, LEVEL_INTERVAL_MS);
          timers.push(timer);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not open that audio input.";
        for (const channel of channels) handlers.onStatus(channel.id, "error", message);
      }
    }
  })();

  return stop;
}

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

async function monitorOpenedChannels(
  opened: OpenedSystemInput,
  handlers: CaptureHandlers,
  channels: TalkbackCaptureChannel[],
  isStopped: () => boolean,
  readers: ReadableStreamDefaultReader<AudioPlaneFrame>[],
) {
  if (isStopped()) {
    opened.release();
    return true;
  }
  const track = opened.stream.getAudioTracks()[0];
  const processor = track ? trackProcessor(track) : null;
  if (!processor) return false;

  const reader = processor.readable.getReader();
  readers.push(reader);
  const phrases = new Map<string, ChannelPhrase>();
  const lastLevelAt = new Map<string, number>();
  const phase = new Map<string, TalkbackCaptureStatus>();
  for (const channel of channels) {
    phase.set(channel.id, "listening");
    handlers.onStatus(channel.id, "listening");
  }

  const setPhase = (channelId: string, next: TalkbackCaptureStatus, message?: string) => {
    if (phase.get(channelId) === next) return;
    phase.set(channelId, next);
    handlers.onStatus(channelId, next, message);
  };

  const flush = (channelId: string, phrase: ChannelPhrase) => {
    phrases.delete(channelId);
    const wav = encodeMonoWav(concatFloats(phrase.chunks), WAV_RATE);
    if (wav.size < 1500 || isStopped()) return;
    void handlers
      .transcribe(wav)
      .then((text) => {
        if (!isStopped() && text.trim()) handlers.onTranscript(channelId, text);
      })
      .catch((error: unknown) => {
        if (isStopped()) return;
        const message = error instanceof Error ? error.message : "Transcription failed.";
        setPhase(channelId, "error", message);
      });
  };

  const onFrame = (frame: AudioPlaneFrame) => {
    const rate = frame.sampleRate || 48000;
    const now = performance.now();
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
      const samples = readPlane(frame, channel.channelIndex);
      if (!samples) continue;
      readOne = true;
      const level = rmsFloat(samples);
      if ((lastLevelAt.get(channel.id) || 0) + LEVEL_INTERVAL_MS <= now) {
        lastLevelAt.set(channel.id, now);
        handlers.onLevel(channel.id, level);
      }
      const open = phrases.get(channel.id);
      const speaking = phraseLevelIsVoice(level, Boolean(open));
      if (speaking) {
        setPhase(channel.id, "hearing");
        const piece = downsampleMono(samples, rate, WAV_RATE);
        if (!open) phrases.set(channel.id, { chunks: [piece], startedAt: now, lastVoiceAt: now });
        else {
          open.chunks.push(piece);
          open.lastVoiceAt = now;
        }
      }
      const phrase = phrases.get(channel.id);
      if (!phrase) {
        if (!speaking && phase.get(channel.id) === "hearing") setPhase(channel.id, "listening");
        continue;
      }
      if (shouldTranscribePhrase(now - phrase.startedAt, now - phrase.lastVoiceAt)) {
        flush(channel.id, phrase);
        if (!speaking) setPhase(channel.id, "listening");
      }
    }
    if (sawChannel && !readOne) return false;
    return true;
  };

  try {
    const first = await reader.read();
    if (isStopped()) return true;
    if (!first.value || onFrame(first.value) === false) {
      first.value?.close();
      return false;
    }
    first.value.close();
    while (!isStopped()) {
      const next = await reader.read();
      if (next.done || !next.value) break;
      onFrame(next.value);
      next.value.close();
    }
    return true;
  } catch {
    return isStopped();
  } finally {
    opened.release();
  }
}

function readPlane(frame: AudioPlaneFrame, channelIndex: number) {
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
  try {
    const interleaved = new Float32Array(frame.numberOfFrames * frame.numberOfChannels);
    frame.copyTo(interleaved, { planeIndex: 0, format: "f32" });
    const channel = new Float32Array(frame.numberOfFrames);
    for (let index = 0; index < frame.numberOfFrames; index += 1) {
      channel[index] = interleaved[index * frame.numberOfChannels + channelIndex];
    }
    return channel;
  } catch {
    return null;
  }
}

function rmsFloat(samples: Float32Array) {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let index = 0; index < samples.length; index += 1) sum += samples[index] * samples[index];
  return Math.sqrt(sum / samples.length);
}

function concatFloats(chunks: Float32Array[]) {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

export function downsampleMono(samples: Float32Array, inputRate: number, outputRate: number) {
  if (samples.length === 0 || !inputRate || !outputRate || inputRate <= outputRate) return samples;
  const ratio = inputRate / outputRate;
  const length = Math.max(1, Math.floor(samples.length / ratio));
  const output = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    const position = index * ratio;
    const left = Math.floor(position);
    const mix = position - left;
    const start = samples[left] || 0;
    const end = samples[Math.min(left + 1, samples.length - 1)] || start;
    output[index] = start + (end - start) * mix;
  }
  return output;
}

export function encodeMonoWav(samples: Float32Array, sampleRate: number) {
  const pcm = samples.length > MAX_WAV_SAMPLES ? samples.subarray(0, MAX_WAV_SAMPLES) : samples;
  const buffer = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + pcm.length * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, pcm.length * 2, true);
  let offset = 44;
  for (let index = 0; index < pcm.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, pcm[index]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
}
