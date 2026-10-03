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
  const heard = Math.max(Math.floor(reported) || 0, Math.floor(nodeChannelCount) || 0, 1);
  return Math.min(heard, WEB_AUDIO_CHANNEL_LIMIT);
}

export function inputRequestAttempts(): MediaTrackConstraints[] {
  const exactProcessing = {
    echoCancellation: { exact: false },
    noiseSuppression: { exact: false },
    autoGainControl: { exact: false },
    sampleRate: { ideal: 48000 },
  } as const;
  const idealProcessing = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    sampleRate: { ideal: 48000 },
  } as const;
  const sizes = [48, 32, 16];
  return [
    ...sizes.map((size) => ({ ...exactProcessing, channelCount: { exact: size } })),
    ...sizes.map((size) => ({ ...idealProcessing, channelCount: { ideal: size } })),
    idealProcessing,
  ];
}

export async function openSystemInput(
  context: AudioContext,
  deviceId: string,
  options?: { raw?: boolean },
): Promise<OpenedSystemInput> {
  let best: { stream: MediaStream; reported: number; heard: number } | null = null;

  for (const audio of inputRequestAttempts()) {
    let stream: MediaStream;
    try {
      stream = await requestInput(deviceId, audio);
    } catch {
      continue;
    }
    await unprocessTrack(stream.getAudioTracks()[0]);
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

async function unprocessTrack(track: MediaStreamTrack | undefined) {
  if (!track?.applyConstraints) return;
  try {
    await track.applyConstraints({
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    });
  } catch {
    // This browser keeps its current processing settings.
  }
  try {
    await track.applyConstraints({ voiceIsolation: false } as MediaTrackConstraints);
  } catch {
    // Voice isolation is not a setting on this input.
  }
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
        const channels = [];
        const transfers = [];
        for (const index of this.watch) {
          const data = list[index];
          if (!data || data.length === 0) continue;
          let sum = 0;
          for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
          const samples = new Float32Array(data);
          channels.push({ index, rms: Math.sqrt(sum / data.length), samples });
          transfers.push(samples.buffer);
        }
        if (channels.length) {
          this.port.postMessage({ channelCount: list.length, rate: sampleRate, channels }, transfers);
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
  const node = new AudioWorkletNode(context, TAP_NAME);
  node.channelCountMode = "max";
  node.channelInterpretation = "discrete";
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
  const nodeChannelCount = heard > 2 ? widenInputSource(source, heard) : source.channelCount || 1;
  return {
    stream,
    source,
    channelCount: Math.max(reported, heard, nodeChannelCount, 1),
    nodeChannelCount,
    heardChannelCount: Math.max(heard, nodeChannelCount, 0),
    release: () => {
      source.disconnect();
      releaseStream();
    },
  };
}
