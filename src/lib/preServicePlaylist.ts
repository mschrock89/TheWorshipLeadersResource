export const PRE_SERVICE_BUCKET = "pre-service-audio";
export const PRE_SERVICE_FADE_MS = 1_500;
export const PRE_SERVICE_FADE_IN_MS = 3_000;
export const PRE_SERVICE_STATIONS = ["foh", "bcast"] as const;
export type PreServiceStation = (typeof PRE_SERVICE_STATIONS)[number];

export type PlaylistPlaybackPlan = {
  trackIndex: number;
  offsetMs: number;
  /** Absolute time the first song should begin so the playlist ends as Pre-Roll starts. */
  startAtMs: number;
  finished: boolean;
  totalMs: number;
};

export function isPreServiceStation(station: string | null | undefined): station is PreServiceStation {
  return station === "foh" || station === "bcast";
}

/** Calendar fallback when no saved rotation period covers the service date. */
export function fallbackPlaylistPeriod(dateIso: string): { year: number; trimester: 1 | 2 | 3 } {
  const [yearText, monthText] = dateIso.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const trimester = month <= 4 ? 1 : month <= 8 ? 2 : 3;
  return { year: Number.isFinite(year) ? year : new Date().getFullYear(), trimester };
}

export function playlistPeriodLabel(year: number, trimester: number) {
  return `T${trimester} ${year}`;
}

/**
 * Where playback should be so the last song ends when Pre-Roll starts.
 * Before that window, the first song starts at the beginning after a wait.
 * Inside the window, this is a position in whichever song is still playing.
 */
export function playlistPlaybackPlan(
  durationsMs: number[],
  nowMs: number,
  preRollAtMs: number,
): PlaylistPlaybackPlan {
  const durations = durationsMs.map((duration) => Math.max(0, duration));
  const totalMs = durations.reduce((sum, duration) => sum + duration, 0);
  if (durations.length === 0 || totalMs <= 0 || !Number.isFinite(preRollAtMs) || !Number.isFinite(nowMs)) {
    return { trackIndex: 0, offsetMs: 0, startAtMs: nowMs, finished: true, totalMs };
  }

  const startAtMs = preRollAtMs - totalMs;
  if (nowMs >= preRollAtMs) {
    const last = durations.length - 1;
    return { trackIndex: last, offsetMs: durations[last], startAtMs, finished: true, totalMs };
  }
  if (nowMs <= startAtMs) {
    return { trackIndex: 0, offsetMs: 0, startAtMs, finished: false, totalMs };
  }

  let elapsed = nowMs - startAtMs;
  for (let index = 0; index < durations.length; index += 1) {
    const duration = durations[index];
    if (elapsed < duration) {
      return { trackIndex: index, offsetMs: elapsed, startAtMs, finished: false, totalMs };
    }
    elapsed -= duration;
  }

  const last = durations.length - 1;
  return { trackIndex: last, offsetMs: durations[last], startAtMs, finished: true, totalMs };
}

export function localServiceTimestamp(dateIso: string, secondsIntoDay: number) {
  const [year, month, day] = dateIso.split("-").map(Number);
  if (!year || !month || !day || !Number.isFinite(secondsIntoDay)) return null;
  const midnight = new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
  if (!Number.isFinite(midnight)) return null;
  return midnight + secondsIntoDay * 1000;
}

export function formatTrackOffset(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export const SERVICE_AUDIO_ACCEPT = "audio/mpeg,audio/mp3,.mp3,audio/mp4,audio/x-m4a,audio/m4a,.m4a";

export type ServiceAudioFile = {
  extension: "mp3" | "m4a";
  contentType: string;
};

/** MP3 and M4A files the Service Audio uploaders can store and play. */
export function serviceAudioFile(file: { name: string; type: string }): ServiceAudioFile | null {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  if (name.endsWith(".m4a") || type === "audio/x-m4a" || type === "audio/m4a") {
    return { extension: "m4a", contentType: "audio/mp4" };
  }
  if (name.endsWith(".mp3") || type === "audio/mpeg" || type === "audio/mp3") {
    return { extension: "mp3", contentType: "audio/mpeg" };
  }
  return null;
}

export function trackTitleFromFileName(fileName: string) {
  const base = fileName.replace(/^.*[/\\]/, "").replace(/\.(mp3|m4a)$/i, "").trim();
  return base.slice(0, 200) || "Untitled";
}
