const INTERFACE_KEY = "wlr-live-audio-interface";

type TalkbackBinding = {
  deviceId: string;
  channelIndex: number;
};

export type RoutingTarget = {
  id: string;
  positionSlot: string | null;
};

export type RoutingStore = {
  byChannelId: Record<string, TalkbackBinding>;
  bySlot: Record<string, TalkbackBinding>;
};

export type RoutingRow = {
  inputNumber: number;
  channelIndex: number;
  talkbackId: string | null;
};

export function readAudioInterfaceId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(INTERFACE_KEY);
}

export function writeAudioInterfaceId(deviceId: string) {
  window.localStorage.setItem(INTERFACE_KEY, deviceId);
}

export function routingRows(
  channelCount: number,
  targets: RoutingTarget[],
  store: RoutingStore,
  deviceId: string,
): RoutingRow[] {
  const count = Math.max(0, Math.floor(channelCount));
  return Array.from({ length: count }, (_, channelIndex) => {
    const match = targets.find((target) => {
      const binding = store.byChannelId[target.id];
      return binding?.deviceId === deviceId && binding.channelIndex === channelIndex;
    });
    return {
      inputNumber: channelIndex + 1,
      channelIndex,
      talkbackId: match?.id || null,
    };
  });
}

export function patchInput(
  store: RoutingStore,
  targets: RoutingTarget[],
  deviceId: string,
  channelIndex: number,
  talkbackId: string | null,
): RoutingStore {
  const byChannelId = { ...store.byChannelId };
  const bySlot = { ...store.bySlot };

  for (const target of targets) {
    const binding = byChannelId[target.id];
    const occupiesInput =
      binding?.deviceId === deviceId && binding.channelIndex === channelIndex;
    const isChosen = target.id === talkbackId;
    if (!occupiesInput && !isChosen) continue;
    delete byChannelId[target.id];
    const slot = target.positionSlot ? bySlot[target.positionSlot] : undefined;
    if (
      target.positionSlot &&
      slot?.deviceId === binding?.deviceId &&
      slot?.channelIndex === binding?.channelIndex
    ) {
      delete bySlot[target.positionSlot];
    }
  }

  if (talkbackId) {
    const target = targets.find((entry) => entry.id === talkbackId);
    const binding = { deviceId, channelIndex };
    byChannelId[talkbackId] = binding;
    if (target?.positionSlot) bySlot[target.positionSlot] = binding;
  }

  return { byChannelId, bySlot };
}

