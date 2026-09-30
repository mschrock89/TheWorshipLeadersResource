export type SystemAudioInput = {
  deviceId: string;
  label: string;
};

const HIDDEN_DEVICE_IDS = new Set(["default", "communications"]);
const PROBE_SIZES = [64, 32, 24, 16, 8];

export async function listSystemAudioInputs(requestPermission = false): Promise<SystemAudioInput[]> {
  if (!navigator.mediaDevices?.enumerateDevices) {
    throw new Error("This browser cannot see audio inputs.");
  }
  if (requestPermission) {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
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
  const opened = await openInput(context, deviceId, { ideal: PROBE_SIZES[0] });
  if (opened.channelCount > 2) {
    opened.release();
    return opened.channelCount;
  }
  opened.release();

  for (const size of PROBE_SIZES) {
    try {
      const exact = await openInput(context, deviceId, { exact: size });
      exact.release();
      return exact.channelCount;
    } catch {
      // This browser or device refused that channel count.
    }
  }

  const fallback = await openInput(context, deviceId, { ideal: 2 });
  fallback.release();
  return fallback.channelCount;
}

async function openInput(
  context: AudioContext,
  deviceId: string,
  channelCount: { ideal: number } | { exact: number },
) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: { exact: deviceId },
      channelCount,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });
  if (context.state === "suspended") await context.resume();
  const source = context.createMediaStreamSource(stream);
  const settings = stream.getAudioTracks()[0]?.getSettings();
  const count = Math.max(source.channelCount || 1, settings?.channelCount || 1);
  return {
    channelCount: count,
    release: () => {
      source.disconnect();
      stream.getTracks().forEach((track) => track.stop());
    },
  };
}
