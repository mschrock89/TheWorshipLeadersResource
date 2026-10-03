export type SystemAudioInput = {
  deviceId: string;
  label: string;
};

const HIDDEN_DEVICE_IDS = new Set(["default", "communications"]);
export const WEB_AUDIO_CHANNEL_LIMIT = 32;

const PROCESSING_OFF = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
} as const;

export type OpenedSystemInput = {
  stream: MediaStream;
  source: MediaStreamAudioSourceNode | null;
  channelCount: number;
  nodeChannelCount: number;
  heardChannelCount: number;
  release: () => void;
};

export async function listSystemAudioInputs(requestPermission = false): Promise<SystemAudioInput[]> {
  if (!navigator.mediaDevices?.enumerateDevices) {
    throw new Error("This browser cannot see audio inputs.");
  }
  if (requestPermission) {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: PROCESSING_OFF,
    });
    stream.getTracks().forEach((track) => track.stop());
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((device) => device.kind === "audioinput" && device.deviceId && !HIDDEN_DEVICE_IDS.has(device.deviceId))
    .map((device, index) => ({
      deviceId: device.deviceId,
      label: device.label || `Audio input ${index + 1}`,
    }));
}

export async function probeInputChannelCount(deviceId: string, context: AudioContext): Promise<number> {
  const opened = await openSystemInput(context, deviceId);
  const count = opened.channelCount;
  opened.release();
  return count;
}

// The track can report every MADI channel while the Web Audio node still starts in stereo.
// Forcing a smaller explicit count than the track mutes the channels past that count.
export function widenInputSource(source: AudioNode, reported: number): number {
  const current = source.channelCount || 1;
  const wanted = Math.max(current, reported || current);
  const max = (source as AudioNode & { maxChannelCount?: number }).maxChannelCount || wanted;
  if (wanted <= current || wanted > max) return current;
  const previousMode = source.channelCountMode;
  try {
    source.channelInterpretation = "discrete";
    source.channelCountMode = "explicit";
    source.channelCount = wanted;
  } catch {
    try {
      source.channelCountMode = previousMode;
    } catch {
      // The node kept the mode it already accepted.
    }
    return source.channelCount || current;
  }
  if ((source.channelCount || 0) < wanted) {
    try {
      source.channelCountMode = previousMode;
    } catch {
      // The node kept the mode it already accepted.
    }
    return source.channelCount || current;
  }
  return source.channelCount;
}

export function splitterChannelCount(reported: number, nodeChannelCount: number) {
  const track = Math.max(Math.floor(reported) || 0, 0);
  const node = Math.max(Math.floor(nodeChannelCount) || 0, 0);
  // A stereo Web Audio node upmixed to 32 inputs is still one pair. Keep that
  // pair intact instead of inventing empty MADI channels past it.
  if (node > 0 && node <= 2 && track > node) return node;
  const heard = Math.max(track, node, 1);
  return Math.min(heard, WEB_AUDIO_CHANNEL_LIMIT);
}

export function createInputAudioContext() {
  const Context = window.AudioContext;
  try {
    return new Context({ sampleRate: 48000 });
  } catch {
    return new Context();
  }
}

// Ask for a 1:1 split at the full reported count first. A smaller explicit
// count on the source node mutes a 48-channel MADI stream, so the tap node
// is what gets clamped, and only if the browser refuses the wider layout.
export function talkbackTapAttempts(reported: number) {
  const wanted = Math.max(1, Math.floor(reported) || 1);
  const sizes = [wanted, 32, 24, 16, 8, 2, 1];
  return sizes.filter((size, index) => size <= wanted && sizes.indexOf(size) === index);
}

export function talkbackTapOptions(channelCount: number): AudioWorkletNodeOptions {
  const count = Math.max(1, Math.floor(channelCount) || 1);
  return {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [count],
    channelCount: count,
    channelCountMode: "explicit",
    channelInterpretation: "discrete",
  };
}

export function talkbackTapOptionSets(reported: number): AudioWorkletNodeOptions[] {
  return talkbackTapAttempts(reported).flatMap((count) => {
    const discrete = talkbackTapOptions(count);
    return [
      { ...discrete, channelCountMode: "max" as const },
      discrete,
    ];
  });
}

export function createTalkbackTap(context: AudioContext, reported: number) {
  for (const options of talkbackTapOptionSets(reported)) {
    try {
      return new AudioWorkletNode(context, TAP_NAME, options);
    } catch {
      // This browser cannot split that many channels in one node.
    }
  }
  const node = new AudioWorkletNode(context, TAP_NAME);
  try {
    node.channelCountMode = "max";
    node.channelInterpretation = "discrete";
  } catch {
    // The node keeps its default channel layout.
  }
  return node;
}

export function inputRequestAttempts(channelLimit = 48): MediaTrackConstraints[] {
  const sizes = [channelLimit, 48, 32, 16, 8].filter(
    (size, index, all) => size >= 2 && all.indexOf(size) === index,
  );
  const processingOff = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    voiceIsolation: false,
  } as MediaTrackConstraints;
  const exactProcessingOff = {
    echoCancellation: { exact: false },
    noiseSuppression: { exact: false },
    autoGainControl: { exact: false },
  };
  return [
    ...sizes.map((size) => ({
      ...processingOff,
      sampleRate: { exact: 48000 },
      channelCount: { exact: size },
    })),
    ...sizes.map((size) => ({
      ...exactProcessingOff,
      sampleRate: { exact: 48000 },
      channelCount: { exact: size },
    })),
    ...sizes.map((size) => ({
      ...processingOff,
      sampleRate: { ideal: 48000 },
      channelCount: { ideal: size },
    })),
    { ...processingOff, sampleRate: { ideal: 48000 } },
  ];
}

export function captureUsesWorklet(heard: number, reported: number, needed: number) {
  if (reported > Math.max(heard, 2) && heard <= 2) return false;
  return heard >= needed;
}

export async function deviceChannelLimit(deviceId: string) {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const input = devices.find((device) => device.kind === "audioinput" && device.deviceId === deviceId);
    const max = input && "getCapabilities" in input
      ? (input as InputDeviceInfo).getCapabilities().channelCount?.max
      : undefined;
    if (typeof max === "number" && max > 2) return max;
  } catch {
    // Channel capabilities show up after the input permission exists.
  }
  return 48;
}

export async function alignContextSink(context: AudioContext, deviceId: string) {
  const sink = context as AudioContext & { setSinkId?: (sinkId: string) => Promise<void> };
  if (!sink.setSinkId) return;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const input = devices.find((device) => device.kind === "audioinput" && device.deviceId === deviceId);
    const output = devices.find(
      (device) => device.kind === "audiooutput" && Boolean(input?.groupId) && device.groupId === input?.groupId,
    );
    if (!output?.deviceId) return;
    await sink.setSinkId(output.deviceId);
  } catch {
    // Playback stays on the current speakers.
  }
}

export async function openSystemInput(
  context: AudioContext,
  deviceId: string,
  options?: { raw?: boolean },
): Promise<OpenedSystemInput> {
  await alignContextSink(context, deviceId);
  const channelLimit = await deviceChannelLimit(deviceId);
  let best: { stream: MediaStream; reported: number; heard: number } | null = null;

  for (const audio of inputRequestAttempts(channelLimit)) {
    let stream: MediaStream;
    try {
      stream = await requestInput(deviceId, audio);
    } catch {
      continue;
    }
    const reported = inputChannelCount(stream);
    const heard = options?.raw ? reported : await measureStreamChannels(context, stream);
    const score = heard;
    const better = !best || score > best.heard || (score === best.heard && reported > best.reported);
    if (better) {
      best?.stream.getTracks().forEach((track) => track.stop());
      best = { stream, reported: Math.max(reported, heard), heard };
    } else {
      stream.getTracks().forEach((track) => track.stop());
    }
    const requested = "channelCount" in audio ? audio.channelCount : undefined;
    const exact = requested && "exact" in requested ? requested.exact : 0;
    if (heard >= WEB_AUDIO_CHANNEL_LIMIT || (exact && heard >= exact)) break;
  }

  if (!best) throw new Error("Could not open that audio input.");
  return finishInput(context, best.stream, best.reported, best.heard, options?.raw);
}

function inputChannelCount(stream: MediaStream) {
  return stream.getAudioTracks()[0]?.getSettings().channelCount || 0;
}

async function requestInput(deviceId: string, audio: MediaTrackConstraints) {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      ...audio,
      deviceId: { exact: deviceId },
    },
  });
}

const TAP_NAME = "wlr-talkback-tap";
const tapReady = new WeakMap<AudioContext, Promise<boolean>>();

export function ensureTalkbackTap(context: AudioContext) {
  const existing = tapReady.get(context);
  if (existing) return existing;
  const loading = context.audioWorklet
    .addModule(tapModuleUrl())
    .then(() => true)
    .catch(() => false);
  tapReady.set(context, loading);
  return loading;
}

function tapModuleUrl() {
  const source = `
    class WlrTalkbackTap extends AudioWorkletProcessor {
      constructor() {
        super();
        this.watch = [];
        this.seen = 0;
        this.port.onmessage = (event) => {
          if (Array.isArray(event.data?.watch)) this.watch = event.data.watch;
        };
      }
      process(inputs) {
        const list = (inputs && inputs[0]) || [];
        if (list.length > this.seen) {
          this.seen = list.length;
          this.port.postMessage({ channelCount: list.length, rate: sampleRate, channels: [] });
        }
        if (!this.watch.length || list.length === 0) return true;
        if (!this.buckets) this.buckets = {};
        if (!this.blocks) this.blocks = 0;
        this.blocks += 1;
        for (const index of this.watch) {
          const data = list[index];
          if (!data || data.length === 0) continue;
          let bucket = this.buckets[index];
          if (!bucket) {
            bucket = { sum: 0, count: 0, peak: 0, chunks: [] };
            this.buckets[index] = bucket;
          }
          let sum = 0;
          let peak = bucket.peak;
          for (let i = 0; i < data.length; i++) {
            const value = data[i];
            sum += value * value;
            const abs = value < 0 ? -value : value;
            if (abs > peak) peak = abs;
          }
          bucket.sum += sum;
          bucket.count += data.length;
          bucket.peak = peak;
          bucket.chunks.push(new Float32Array(data));
        }
        const interval = Math.max(1, Math.round(sampleRate * 0.08 / 128));
        if (this.blocks < interval) return true;
        this.blocks = 0;
        const channels = [];
        const transfers = [];
        for (const index of this.watch) {
          const bucket = this.buckets[index];
          if (!bucket || !bucket.count) continue;
          const length = bucket.chunks.reduce((total, chunk) => total + chunk.length, 0);
          const samples = new Float32Array(length);
          let offset = 0;
          for (const chunk of bucket.chunks) {
            samples.set(chunk, offset);
            offset += chunk.length;
          }
          channels.push({
            index,
            rms: Math.sqrt(bucket.sum / bucket.count),
            peak: bucket.peak,
            samples,
          });
          transfers.push(samples.buffer);
        }
        this.buckets = {};
        if (channels.length) {
          this.port.postMessage({ channelCount: this.seen, rate: sampleRate, channels }, transfers);
        }
        return true;
      }
    }
    registerProcessor("${TAP_NAME}", WlrTalkbackTap);
  `;
  return URL.createObjectURL(new Blob([source], { type: "application/javascript" }));
}

export async function measureStreamChannels(context: AudioContext, stream: MediaStream) {
  if (context.state === "suspended") await context.resume();
  if (!(await ensureTalkbackTap(context))) return 0;
  const source = context.createMediaStreamSource(stream);
  const reported = inputChannelCount(stream);
  if (reported > (source.channelCount || 1)) widenInputSource(source, reported);
  const node = createTalkbackTap(context, Math.max(reported, source.channelCount || 1));
  const silent = context.createGain();
  silent.gain.value = 0;
  source.connect(node);
  node.connect(silent);
  silent.connect(context.destination);
  const heard = await new Promise<number>((resolve) => {
    let best = 0;
    const finish = () => {
      node.port.onmessage = null;
      resolve(best);
    };
    const timer = window.setTimeout(finish, 200);
    node.port.onmessage = (event: MessageEvent<{ channelCount?: number }>) => {
      const count = event.data?.channelCount || 0;
      if (count > best) best = count;
      if (best >= WEB_AUDIO_CHANNEL_LIMIT) {
        window.clearTimeout(timer);
        finish();
      }
    };
  });
  source.disconnect();
  node.disconnect();
  silent.disconnect();
  return heard;
}

export const TALKBACK_TAP_NAME = TAP_NAME;

async function finishInput(
  context: AudioContext,
  stream: MediaStream,
  reported: number,
  heard: number,
  raw = false,
): Promise<OpenedSystemInput> {
  if (context.state === "suspended") await context.resume();
  const releaseStream = () => stream.getTracks().forEach((track) => track.stop());
  if (raw) {
    return {
      stream,
      source: null,
      channelCount: Math.max(reported, 1),
      nodeChannelCount: 0,
      heardChannelCount: Math.max(heard, 0),
      release: releaseStream,
    };
  }

  const source = context.createMediaStreamSource(stream);
  const nodeChannelCount = reported > (source.channelCount || 1)
    ? widenInputSource(source, reported)
    : source.channelCount || 1;
  return {
    stream,
    source,
    channelCount: Math.max(reported, heard, 1),
    nodeChannelCount,
    heardChannelCount: Math.max(heard, 0),
    release: () => {
      source.disconnect();
      releaseStream();
    },
  };
}
