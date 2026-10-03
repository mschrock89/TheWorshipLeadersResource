export const LIVE_STATIONS = ["foh", "mon"] as const;
export type LiveStation = (typeof LIVE_STATIONS)[number];

export const PRODUCTION_LIVE_MINISTRIES = [
  "production",
  "ms_hs_production",
  "hs_production",
] as const;

export const PRODUCTION_LIVE_POSITIONS = [
  "sound_tech",
  "mon",
  "producer",
  "lighting",
  "media",
  "broadcast",
  "audio_shadow",
] as const;

export const VIDEO_LIVE_MINISTRIES = ["video"] as const;

export const VIDEO_LIVE_POSITIONS = [
  "tri_pod_camera",
  "tri_pod_camera_1",
  "tri_pod_camera_2",
  "tri_pod_camera_3",
  "tri_pod_camera_4",
  "hand_held_camera",
  "hand_held_camera_1",
  "hand_held_camera_2",
  "hand_held_camera_3",
  "hand_held_camera_4",
  "director",
  "director_2",
  "director_3",
  "director_4",
  "graphics",
  "graphics_2",
  "graphics_3",
  "graphics_4",
  "switcher",
  "switcher_2",
  "switcher_3",
  "switcher_4",
] as const;

export const LIVE_CHAT_ROOMS = ["production", "video"] as const;
export type LiveChatRoom = (typeof LIVE_CHAT_ROOMS)[number];
export type LiveModeAudience = "production" | "video";

const BINDING_KEY = "wlr-live-audio-bindings";
const STATION_KEY = "wlr-live-station";
const CLIENT_KEY = "wlr-live-client-id";

export type TalkbackBinding = {
  deviceId: string;
  channelIndex: number;
};

type BindingStore = {
  byChannelId: Record<string, TalkbackBinding>;
  bySlot: Record<string, TalkbackBinding>;
};

const JUNK_EXACT = new Set([
  "thanks for watching",
  "thank you for watching",
  "thanks for listening",
  "please subscribe",
  "subtitles by",
  "subtitle",
  "subtitles",
  "blank audio",
  "blank_audio",
  "music",
  "applause",
  "silence",
  "you",
  "bye",
  "...",
  ".",
]);

export function sanitizeTalkbackTranscript(raw: string): string | null {
  const withoutTags = raw
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (withoutTags.length < 2 || withoutTags.length > 500) return null;
  if (/^[\s.。,!?'"\-–—]+$/u.test(withoutTags)) return null;

  const normalized = withoutTags.toLowerCase().replace(/[.!?]+$/g, "").trim();
  if (JUNK_EXACT.has(normalized)) return null;
  if (normalized.startsWith("thanks for watching")) return null;
  if (normalized.startsWith("subtitles by")) return null;
  return withoutTags;
}

export function rmsFromTimeDomain(samples: ArrayLike<number>): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const centered = (samples[index] - 128) / 128;
    sum += centered * centered;
  }
  return Math.sqrt(sum / samples.length);
}

export function shouldDropRepeat(
  previous: { text: string; at: number } | undefined,
  text: string,
  at: number,
  windowMs = 8000,
): boolean {
  if (!previous) return false;
  return previous.text === text && at - previous.at < windowMs;
}

export function buildLiveModeHref(params: {
  date: string;
  campusId?: string | null;
  ministryType?: string | null;
  draftSetId?: string | null;
  customServiceId?: string | null;
}) {
  const search = new URLSearchParams();
  search.set("date", params.date);
  if (params.campusId) search.set("campus", params.campusId);
  if (params.ministryType) search.set("ministry", params.ministryType);
  if (params.draftSetId) search.set("draftSetId", params.draftSetId);
  if (params.customServiceId) search.set("customServiceId", params.customServiceId);
  return `/live?${search.toString()}`;
}

export function liveStationLabel(station: LiveStation) {
  return station === "foh" ? "FOH" : "MON";
}

export function readLiveStation(): LiveStation {
  if (typeof window === "undefined") return "foh";
  const stored = window.localStorage.getItem(STATION_KEY);
  return stored === "mon" ? "mon" : "foh";
}

export function writeLiveStation(station: LiveStation) {
  window.localStorage.setItem(STATION_KEY, station);
}

export function getLiveClientId(): string {
  if (typeof window === "undefined") return "server";
  const existing = window.sessionStorage.getItem(CLIENT_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  window.sessionStorage.setItem(CLIENT_KEY, created);
  return created;
}

function emptyBindings(): BindingStore {
  return { byChannelId: {}, bySlot: {} };
}

export function readTalkbackBindings(): BindingStore {
  if (typeof window === "undefined") return emptyBindings();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(BINDING_KEY) || "") as BindingStore;
    return {
      byChannelId: parsed.byChannelId || {},
      bySlot: parsed.bySlot || {},
    };
  } catch {
    return emptyBindings();
  }
}

export function resolveTalkbackBinding(
  channelId: string,
  positionSlot: string | null | undefined,
): TalkbackBinding | null {
  const store = readTalkbackBindings();
  return (
    store.byChannelId[channelId] ||
    (positionSlot ? store.bySlot[positionSlot] : null) ||
    null
  );
}

export function writeTalkbackBinding(
  channelId: string,
  positionSlot: string | null | undefined,
  binding: TalkbackBinding,
) {
  const store = readTalkbackBindings();
  store.byChannelId[channelId] = binding;
  if (positionSlot) store.bySlot[positionSlot] = binding;
  window.localStorage.setItem(BINDING_KEY, JSON.stringify(store));
}

export function writeTalkbackBindingStore(store: {
  byChannelId: Record<string, TalkbackBinding>;
  bySlot: Record<string, TalkbackBinding>;
}) {
  window.localStorage.setItem(BINDING_KEY, JSON.stringify(store));
}

type LiveAssignmentRow = { ministry_type?: string | null; position?: string | null };

function matchesLiveAssignment(
  rows: LiveAssignmentRow[],
  ministries: ReadonlySet<string>,
  positions: ReadonlySet<string>,
) {
  return rows.some(
    (row) =>
      (row.ministry_type && ministries.has(row.ministry_type)) ||
      (row.position && positions.has(row.position)),
  );
}

export function hasProductionLiveAssignment(rows: LiveAssignmentRow[]) {
  return matchesLiveAssignment(
    rows,
    new Set<string>(PRODUCTION_LIVE_MINISTRIES),
    new Set<string>(PRODUCTION_LIVE_POSITIONS),
  );
}

export function hasVideoLiveAssignment(rows: LiveAssignmentRow[]) {
  return matchesLiveAssignment(
    rows,
    new Set<string>(VIDEO_LIVE_MINISTRIES),
    new Set<string>(VIDEO_LIVE_POSITIONS),
  );
}

export function liveChatRoomOf(message: { room?: string | null }): LiveChatRoom {
  return message.room === "video" ? "video" : "production";
}

export function resolveLiveAudience(input: {
  isAdmin: boolean;
  isProductionManager: boolean;
  isVideoDirector: boolean;
  rows: LiveAssignmentRow[];
}): LiveModeAudience | null {
  if (input.isAdmin || input.isProductionManager) return "production";
  if (input.isVideoDirector || hasVideoLiveAssignment(input.rows)) return "video";
  if (hasProductionLiveAssignment(input.rows)) return "production";
  return null;
}
