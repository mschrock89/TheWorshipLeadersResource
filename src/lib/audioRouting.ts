const INTERFACE_KEY = "wlr-live-audio-interface";
const CHANNEL_COUNT_KEY = "wlr-live-audio-channel-count";
const DEFAULT_KEY = "wlr-live-audio-routing-default";
const DEFAULT_APPLIED_KEY = "wlr-live-audio-routing-default-applied";
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

export type RoutingIdentity = RoutingTarget & {
  label?: string | null;
};

export type AudioRoutingAssignment = {
  key: string;
  channelIndex: number;
};

export type AudioRoutingDefault = {
  deviceId: string;
  channelCount: number | null;
  savedAt: string;
  assignments: AudioRoutingAssignment[];
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

function isSmpteRouteId(id: string) {
  return id === PROPRESENTER_SMPTE_ROUTE_ID || id === PLAYBACK_SMPTE_ROUTE_ID;
}

export function sessionRoutingIdentities(
  channels: Array<{ id: string; position_slot: string | null; label: string }>,
): RoutingIdentity[] {
  return [
    ...channels.map((channel) => ({
      id: channel.id,
      positionSlot: channel.position_slot,
      label: channel.label,
    })),
    { id: PROPRESENTER_SMPTE_ROUTE_ID, positionSlot: null, label: "ProPresenter SMPTE" },
    { id: PLAYBACK_SMPTE_ROUTE_ID, positionSlot: null, label: "Playback SMPTE" },
  ];
}

export function routingDefaultKey(target: RoutingIdentity): string | null {
  if (isSmpteRouteId(target.id)) return target.id;
  if (target.positionSlot) return `slot:${target.positionSlot}`;
  const label = target.label?.trim().toLowerCase();
  return label ? `label:${label}` : null;
}

function finiteChannelCount(value: unknown): number | null {
  const count = typeof value === "number" ? value : Number(value);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : null;
}

export function parseAudioRoutingDefault(value: unknown): AudioRoutingDefault | null {
  if (!value || typeof value !== "object") return null;
  const record = value as {
    deviceId?: unknown;
    channelCount?: unknown;
    savedAt?: unknown;
    assignments?: unknown;
  };
  if (typeof record.deviceId !== "string" || !record.deviceId.trim()) return null;
  if (typeof record.savedAt !== "string" || !record.savedAt) return null;
  const assignments = Array.isArray(record.assignments)
    ? record.assignments.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const row = entry as { key?: unknown; channelIndex?: unknown };
        if (typeof row.key !== "string" || !row.key) return [];
        if (typeof row.channelIndex !== "number" || !Number.isInteger(row.channelIndex) || row.channelIndex < 0) {
          return [];
        }
        return [{ key: row.key, channelIndex: row.channelIndex }];
      })
    : [];
  return {
    deviceId: record.deviceId,
    channelCount: finiteChannelCount(record.channelCount),
    savedAt: record.savedAt,
    assignments,
  };
}

export function readAudioRoutingDefault(): AudioRoutingDefault | null {
  if (typeof window === "undefined") return null;
  try {
    return parseAudioRoutingDefault(JSON.parse(window.localStorage.getItem(DEFAULT_KEY) || ""));
  } catch {
    return null;
  }
}

export function writeAudioRoutingDefault(saved: AudioRoutingDefault) {
  window.localStorage.setItem(DEFAULT_KEY, JSON.stringify(saved));
}

function readAppliedDefaults(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(DEFAULT_APPLIED_KEY) || "") as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter((entry) => typeof entry[0] === "string" && typeof entry[1] === "string"),
    );
  } catch {
    return {};
  }
}

export function routingDefaultAlreadyApplied(sessionId: string, savedAt: string) {
  return readAppliedDefaults()[sessionId] === savedAt;
}

export function markRoutingDefaultApplied(sessionId: string, savedAt: string) {
  const entries = Object.entries(readAppliedDefaults()).filter(([id]) => id !== sessionId);
  entries.push([sessionId, savedAt]);
  window.localStorage.setItem(
    DEFAULT_APPLIED_KEY,
    JSON.stringify(Object.fromEntries(entries.slice(-40))),
  );
}

export function captureAudioRoutingDefault(
  store: RoutingStore,
  targets: RoutingIdentity[],
  deviceId: string,
  channelCount: number | null,
  savedAt: string,
): AudioRoutingDefault {
  const seen = new Set<string>();
  const assignments: AudioRoutingAssignment[] = [];
  for (const target of targets) {
    const key = routingDefaultKey(target);
    if (!key || seen.has(key)) continue;
    const binding = store.byChannelId[target.id];
    if (!binding || binding.deviceId !== deviceId) continue;
    seen.add(key);
    assignments.push({ key, channelIndex: binding.channelIndex });
  }
  return {
    deviceId,
    channelCount: finiteChannelCount(channelCount),
    savedAt,
    assignments,
  };
}

export function applyAudioRoutingDefault(
  saved: AudioRoutingDefault,
  targets: RoutingIdentity[],
): RoutingStore {
  const byKey = new Map(saved.assignments.map((entry) => [entry.key, entry.channelIndex]));
  const routingTargets = targets.map((target) => ({
    id: target.id,
    positionSlot: target.positionSlot,
  }));
  return targets.reduce<RoutingStore>((store, target) => {
    const key = routingDefaultKey(target);
    if (!key || !byKey.has(key)) return store;
    return patchInput(store, routingTargets, saved.deviceId, byKey.get(key) as number, target.id);
  }, { byChannelId: {}, bySlot: {} });
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

