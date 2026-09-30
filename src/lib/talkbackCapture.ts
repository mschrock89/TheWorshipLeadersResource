import { rmsFromTimeDomain } from "@/lib/liveMode";

export type TalkbackCaptureChannel = {
  id: string;
  deviceId: string;
  channelIndex: number;
};

export type TalkbackCaptureStatus = "listening" | "hearing" | "error";

const SPEECH_THRESHOLD = 0.02;
const SILENCE_MS = 700;
const MIN_UTTERANCE_MS = 450;
const MAX_UTTERANCE_MS = 8000;
const LEVEL_INTERVAL_MS = 80;

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
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: { exact: deviceId },
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: { ideal: needed },
          },
        });
        if (stopped) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streams.push(stream);

        if (context.state === "suspended") await context.resume();
        const source = context.createMediaStreamSource(stream);
        const available = Math.max(source.channelCount || 1, 1);
        const splitter = context.createChannelSplitter(available);
        source.connect(splitter);

        for (const channel of channels) {
          if (channel.channelIndex >= available) {
            handlers.onStatus(
              channel.id,
              "error",
              `This input only has ${available} channel${available === 1 ? "" : "s"}.`,
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
            const speaking = level >= SPEECH_THRESHOLD;
            let utterance = recorders.get(channel.id);

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
            if (elapsed >= MAX_UTTERANCE_MS || (elapsed >= MIN_UTTERANCE_MS && quietFor >= SILENCE_MS)) {
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
