export type SystemAudioInput = {
  deviceId: string;
  label: string;
};

const HIDDEN_DEVICE_IDS = new Set(["default", "communications"]);
const PROBE_SIZES = [64, 56, 48, 40, 32, 24, 16, 8];
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
// Leaving that node on an explicit stereo count folds the rest of the interface away.
export function widenInputSource(source: AudioNode, reported: number): number {
  const current = source.channelCount || 1;
  const wanted = Math.max(current, reported || current);
  try {
    source.channelInterpretation = "discrete";
  } catch {
    // This node keeps its current interpretation.
  }
  if (wanted <= current) return current;
  const max = (source as AudioNode & { maxChannelCount?: number }).maxChannelCount || wanted;
  const capped = Math.min(wanted, max, WEB_AUDIO_CHANNEL_LIMIT);
  const previousMode = source.channelCountMode;
  try {
    source.channelCountMode = "explicit";
  } catch {
    return source.channelCount || current;
  }
  for (const target of capped === wanted ? [wanted] : [capped, wanted]) {
    if (target <= current) continue;
    try {
      source.channelCount = target;
      if ((source.channelCount || 0) > current) return source.channelCount;
    } catch {
      // This node rejected that channel count.
    }
  }
  try {
    source.channelCountMode = previousMode;
  } catch {
    // The node kept the mode it already accepted.
  }
  return source.channelCount || current;
}

export function splitterChannelCount(reported: number, nodeChannelCount: number) {
  const heard = Math.max(Math.floor(reported) || 0, Math.floor(nodeChannelCount) || 0, 1);
  return Math.min(heard, WEB_AUDIO_CHANNEL_LIMIT);
}

export async function openSystemInput(
  context: AudioContext,
  deviceId: string,
  options?: { raw?: boolean },
): Promise<OpenedSystemInput> {
  const attempts: Array<{ exact: number } | undefined> = [
    undefined,
    ...PROBE_SIZES.map((size) => ({ exact: size })),
  ];
  let fallback: { exact: number } | undefined;
  let fallbackCount = 0;
  let openedAny = false;

  for (const channelCount of attempts) {
    let stream: MediaStream;
    try {
      stream = await requestInput(deviceId, channelCount);
    } catch {
      continue;
    }
    openedAny = true;
    const count = inputChannelCount(stream);
    const matched = channelCount ? count >= channelCount.exact : count > 2;
    if (matched) return finishInput(context, stream, count, options?.raw);
    stream.getTracks().forEach((track) => track.stop());
    if (count >= fallbackCount) {
      fallback = channelCount;
      fallbackCount = count;
    }
  }

  if (!openedAny) throw new Error("Could not open that audio input.");
  const stream = await requestInput(deviceId, fallback);
  return finishInput(context, stream, Math.max(inputChannelCount(stream), fallbackCount), options?.raw);
}

function inputChannelCount(stream: MediaStream) {
  return stream.getAudioTracks()[0]?.getSettings().channelCount || 0;
}

async function requestInput(deviceId: string, channelCount?: { exact: number }) {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: { exact: deviceId },
      ...PROCESSING_OFF,
      ...(channelCount ? { channelCount } : {}),
    },
  });
}

async function finishInput(
  context: AudioContext,
  stream: MediaStream,
  reported: number,
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
      release: releaseStream,
    };
  }

  const source = context.createMediaStreamSource(stream);
  const nodeChannelCount = widenInputSource(source, reported);
  return {
    stream,
    source,
    channelCount: Math.max(reported, nodeChannelCount, 1),
    nodeChannelCount,
    release: () => {
      source.disconnect();
      releaseStream();
    },
  };
}
