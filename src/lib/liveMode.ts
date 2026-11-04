/** Mic captions and channel meters are parked. */
export const TALKBACK_TRANSCRIPT_ENABLED = false;

export const LIVE_STATIONS = ["foh", "mon", "bcast", "video"] as const;
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

/** Production crews are scheduled under their own ministry but run the worship service it supports. */
const LIVE_MINISTRY_BY_SCHEDULE_MINISTRY: Record<string, string> = {
  production: "weekend",
  video: "weekend",
  weekend_team: "weekend",
  sunday_am: "weekend",
  ms_hs_production: "ms_hs",
  hs_production: "encounter",
};

export function liveServiceMinistry(ministryType: string | null | undefined): string | null {
  if (!ministryType) return null;
  return LIVE_MINISTRY_BY_SCHEDULE_MINISTRY[ministryType] || ministryType;
}

/** A service stays current in Live until this long after its last start. */
export const LIVE_SERVICE_WINDOW_MINUTES = 120;

export type LiveServiceCandidate = {
  date: string;
  /** HH:MM start times for that date, any order. Empty when the time is unknown. */
  times: string[];
};

function clockMinutes(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * The soonest service that has not ended. Today's service ends
 * LIVE_SERVICE_WINDOW_MINUTES after its start; a date with unknown times
 * stays open all day and sorts after timed services on the same date.
 */
export function pickNextLiveService<T extends LiveServiceCandidate>(
  candidates: T[],
  today: string,
  nowMinutes: number,
): (T & { startTime: string | null }) | null {
  let best: (T & { startTime: string | null }) | null = null;
  let bestKey = "";
  for (const candidate of candidates) {
    if (candidate.date < today) continue;
    const starts = candidate.times
      .map((time) => ({ time: time.trim().slice(0, 5), minutes: clockMinutes(time) }))
      .filter((start): start is { time: string; minutes: number } => start.minutes !== null)
      .sort((a, b) => a.minutes - b.minutes);
    const open =
      candidate.date === today
        ? starts.filter((start) => start.minutes + LIVE_SERVICE_WINDOW_MINUTES > nowMinutes)
        : starts;
    if (starts.length > 0 && open.length === 0) continue;
    const startTime = open[0]?.time ?? null;
    const key = `${candidate.date}T${startTime ?? "99:99"}`;
    if (!best || key < bestKey) {
      best = { ...candidate, startTime };
      bestKey = key;
    }
  }
  return best;
}

const LIVE_STATION_LABELS: Record<LiveStation, string> = {
  foh: "FOH",
  mon: "MON",
  bcast: "BCAST",
  video: "VIDEO",
};

export function isLiveStation(value: string | null | undefined): value is LiveStation {
  return value === "foh" || value === "mon" || value === "bcast" || value === "video";
}

/** Talkback hosting stays on the audio positions. */
export function isListenerStation(value: string | null | undefined): value is Exclude<LiveStation, "video"> {
  return value === "foh" || value === "mon" || value === "bcast";
}

export function liveStationLabel(station: LiveStation) {
  return LIVE_STATION_LABELS[station];
}

/** FOH and BCAST play pre-service music. MON and VIDEO follow the rundown without a player. */
export function liveStationUsesPreServicePlayer(station: LiveStation) {
  return station === "foh" || station === "bcast";
}

const LISTENER_FRESH_MS = 20_000;

/** FOH, MON, or BCAST can host. A fresh heartbeat means that screen is the one listening. */
export function isListenerHosting(
  session: {
    listener_client_id?: string | null;
    listener_station?: string | null;
    listener_heartbeat?: string | null;
  } | null | undefined,
  nowMs: number,
) {
  if (!session?.listener_client_id || !session.listener_heartbeat) return false;
  if (!isListenerStation(session.listener_station)) return false;
  const heartbeat = new Date(session.listener_heartbeat).getTime();
  return Number.isFinite(heartbeat) && nowMs - heartbeat < LISTENER_FRESH_MS;
}

export function readLiveStation(): LiveStation {
  if (typeof window === "undefined") return "foh";
  const stored = window.localStorage.getItem(STATION_KEY);
  return isLiveStation(stored) ? stored : "foh";
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

/**
 * Private Live line notes. Role grants (admin, production manager, video
 * director) come from the permissions matrix. Production and video volunteers
 * qualify from their campus assignment, which is not a role. An explicit
 * revoke blocks both paths.
 */
export function canUseLiveLineNotes(input: {
  hasCapability: boolean;
  revoked: boolean;
  hasLiveTeamAssignment: boolean;
}) {
  if (input.revoked) return false;
  return input.hasCapability || input.hasLiveTeamAssignment;
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
