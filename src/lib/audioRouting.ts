const INTERFACE_KEY = "wlr-live-audio-interface";
const CHANNEL_COUNT_KEY = "wlr-live-audio-channel-count";
export const PROPRESENTER_SMPTE_ROUTE_ID = "smpte-propresenter";
export const PLAYBACK_SMPTE_ROUTE_ID = "smpte-playback";
export const SMPTE_INPUT_FALLBACK_COUNT = 48;

export type SmpteSource = "propresenter" | "playback";

const SMPTE_ROUTE_IDS: Record<SmpteSource, string> = {
  propresenter: PROPRESENTER_SMPTE_ROUTE_ID,
  playback: PLAYBACK_SMPTE_ROUTE_ID,
};

export function smpteRouteId(source: SmpteSource) {
  return SMPTE_ROUTE_IDS[source];
}

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

export function readAudioChannelCount(): number | null {
  if (typeof window === "undefined") return null;
  const count = Number(window.localStorage.getItem(CHANNEL_COUNT_KEY));
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : null;
}

export function writeAudioChannelCount(count: number) {
  window.localStorage.setItem(CHANNEL_COUNT_KEY, String(Math.max(1, Math.floor(count))));
}

export function readSmpteBinding(
  store: RoutingStore,
  source: SmpteSource,
): { deviceId: string; channelIndex: number } | null {
  return store.byChannelId[smpteRouteId(source)] || null;
}

export function readSmpteListens(store: RoutingStore) {
  return (["propresenter", "playback"] as const).flatMap((source) => {
    const binding = readSmpteBinding(store, source);
    return binding ? [{ source, deviceId: binding.deviceId, channelIndex: binding.channelIndex }] : [];
  });
}

export function visibleSmpteInputCount(probed: number | null, selectedChannelIndex: number | null) {
  const known = probed && probed > 0 ? Math.floor(probed) : SMPTE_INPUT_FALLBACK_COUNT;
  const selected = selectedChannelIndex != null && selectedChannelIndex >= 0 ? selectedChannelIndex + 1 : 0;
  return Math.max(known, selected, 1);
}

export function assignSmpteInput(
  store: RoutingStore,
  targets: RoutingTarget[],
  deviceId: string,
  channelIndex: number | null,
  source: SmpteSource,
): RoutingStore {
  const routeId = smpteRouteId(source);
  const withSmpte = (["propresenter", "playback"] as const).reduce((list, entry) => {
    const id = smpteRouteId(entry);
    return list.some((target) => target.id === id) ? list : [...list, { id, positionSlot: null }];
  }, targets);
  if (channelIndex == null) {
    const current = store.byChannelId[routeId];
    if (!current) return store;
    return patchInput(store, withSmpte, current.deviceId, current.channelIndex, null);
  }
  return patchInput(store, withSmpte, deviceId, channelIndex, routeId);
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

