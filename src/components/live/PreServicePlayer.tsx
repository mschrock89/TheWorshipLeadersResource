import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, Pause, Play, RotateCcw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { liveStationLabel, type LiveStation } from "@/lib/liveMode";
import {
  PRE_SERVICE_FADE_MS,
  formatTrackOffset,
  playlistPeriodLabel,
  playlistPlaybackPlan,
} from "@/lib/preServicePlaylist";
import type { PreServiceTrack } from "@/hooks/usePreServicePlaylist";

type PreServicePlayerProps = {
  station: LiveStation;
  year: number;
  trimester: number;
  serviceYear: number;
  serviceTrimester: number;
  tracks: PreServiceTrack[];
  isLoading: boolean;
  schemaMissing: boolean;
  uploading: boolean;
  uploadLabel: string | null;
  preRollAtMs: number | null;
  preRollLabel: string | null;
  fadeAt: number | null;
  restartAt: number | null;
  onPeriodChange: (period: { year: number; trimester: number }) => void;
  onUpload: (files: File[]) => Promise<void>;
  onRemove: (track: PreServiceTrack) => Promise<void>;
  onMove: (trackId: string, direction: -1 | 1) => Promise<void>;
};

type PlaybackPhase = "idle" | "playing" | "fading" | "done";

const VOLUME_KEY = "wlr-preservice-volume";

function readVolume() {
  if (typeof window === "undefined") return 0.85;
  const storedText = window.localStorage.getItem(VOLUME_KEY);
  if (storedText == null || storedText === "") return 0.85;
  const stored = Number(storedText);
  return Number.isFinite(stored) && stored >= 0 && stored <= 1 ? stored : 0.85;
}

function clockLabel(ms: number) {
  return new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function waitForMetadata(audio: HTMLAudioElement) {
  if (audio.readyState >= 1 && Number.isFinite(audio.duration)) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("The song took too long to load."));
    }, 12_000);
    const ready = () => {
      cleanup();
      resolve();
    };
    const failed = () => {
      cleanup();
      reject(new Error("Could not load that song."));
    };
    const cleanup = () => {
      window.clearTimeout(timer);
      audio.removeEventListener("loadedmetadata", ready);
      audio.removeEventListener("error", failed);
    };
    audio.addEventListener("loadedmetadata", ready);
    audio.addEventListener("error", failed);
  });
}

function seekTo(audio: HTMLAudioElement, seconds: number) {
  return new Promise<void>((resolve) => {
    if (Math.abs(audio.currentTime - seconds) < 0.25) {
      resolve();
      return;
    }
    const done = () => {
      audio.removeEventListener("seeked", done);
      resolve();
    };
    audio.addEventListener("seeked", done);
    try {
      audio.currentTime = seconds;
    } catch {
      audio.removeEventListener("seeked", done);
      resolve();
    }
  });
}

export function PreServicePlayer({
  station,
  year,
  trimester,
  serviceYear,
  serviceTrimester,
  tracks,
  isLoading,
  schemaMissing,
  uploading,
  uploadLabel,
  preRollAtMs,
  preRollLabel,
  fadeAt,
  restartAt,
  onPeriodChange,
  onUpload,
  onRemove,
  onMove,
}: PreServicePlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;
  const volumeRef = useRef(readVolume());
  const phaseRef = useRef<PlaybackPhase>("idle");
  const indexRef = useRef(0);
  const loadedUrl = useRef("");
  const fadingRef = useRef(false);
  const pausedRef = useRef(false);
  const fadeFrame = useRef(0);
  const handledFade = useRef<number | null>(null);
  const handledRestart = useRef<number | null>(null);
  const resumePoint = useRef<{ trackId: string; offsetMs: number } | null>(null);
  const playFromRef = useRef<(index: number, offsetMs: number) => Promise<void>>(async () => {});
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [phase, setPhase] = useState<PlaybackPhase>("idle");
  const [trackIndex, setTrackIndex] = useState(0);
  const [volume, setVolume] = useState(volumeRef.current);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [manualPlayback, setManualPlayback] = useState(false);
  const [preRollHeld, setPreRollHeld] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  phaseRef.current = phase;
  volumeRef.current = volume;

  const currentTrack = tracks[trackIndex] || tracks[0] || null;

  const ensureAudio = () => {
    if (!audioRef.current) {
      const audio = new Audio();
      audio.preload = "auto";
      audio.setAttribute("playsinline", "true");
      audio.onended = () => {
        if (fadingRef.current) return;
        const trackCount = tracksRef.current.length;
        if (trackCount === 0) {
          setPhase("done");
          return;
        }
        const next = (indexRef.current + 1) % trackCount;
        void playFromRef.current(next, 0).catch(() => setPhase("idle"));
      };
      audioRef.current = audio;
    }
    return audioRef.current;
  };

  playFromRef.current = async (index: number, offsetMs: number) => {
    const track = tracksRef.current[index];
    const audio = ensureAudio();
    if (!track) return;
    window.cancelAnimationFrame(fadeFrame.current);
    fadingRef.current = false;
    pausedRef.current = false;
    audio.volume = volumeRef.current;
    if (loadedUrl.current !== track.url) {
      loadedUrl.current = track.url;
      audio.src = track.url;
      audio.load();
    }
    await waitForMetadata(audio);
    const duration = Number.isFinite(audio.duration) ? audio.duration : track.durationMs / 1000;
    const target = Math.min(Math.max(0, offsetMs / 1000), Math.max(0, duration - 0.05));
    await seekTo(audio, target);
    await audio.play();
    indexRef.current = index;
    setTrackIndex(index);
    setPhase("playing");
  };

  useEffect(() => {
    return () => {
      window.cancelAnimationFrame(fadeFrame.current);
      audioRef.current?.pause();
    };
  }, []);

  useEffect(() => {
    if (fadeAt == null || fadeAt === handledFade.current) return;
    handledFade.current = fadeAt;
    setPreRollHeld(true);
    const current = phaseRef.current;
    if (current === "idle") {
      ensureAudio().pause();
      setPhase("done");
      return;
    }
    if (current !== "playing") return;
    const audio = ensureAudio();
    setPhase("fading");
    fadingRef.current = true;
    const from = audio.volume;
    const started = performance.now();
    const step = (frame: number) => {
      const amount = Math.min(1, (frame - started) / PRE_SERVICE_FADE_MS);
      audio.volume = from * (1 - amount);
      if (amount < 1) {
        fadeFrame.current = window.requestAnimationFrame(step);
        return;
      }
      audio.pause();
      const track = tracksRef.current[indexRef.current];
      if (track) {
        resumePoint.current = {
          trackId: track.id,
          offsetMs: Math.round(audio.currentTime * 1000),
        };
      }
      audio.volume = volumeRef.current;
      fadingRef.current = false;
      pausedRef.current = false;
      setPhase("done");
    };
    fadeFrame.current = window.requestAnimationFrame(step);
  }, [fadeAt]);

  useEffect(() => {
    if (restartAt == null || restartAt === handledRestart.current) return;
    handledRestart.current = restartAt;
    window.cancelAnimationFrame(fadeFrame.current);
    fadingRef.current = false;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.volume = volumeRef.current;
    }
    setPreRollHeld(false);
    setManualPlayback(false);
    pausedRef.current = false;
    const held = resumePoint.current;
    let restartIndex = tracksRef.current[indexRef.current] ? indexRef.current : 0;
    let restartOffsetMs = 0;
    if (held) {
      const index = tracksRef.current.findIndex((track) => track.id === held.trackId);
      if (index >= 0) {
        restartIndex = index;
        restartOffsetMs = held.offsetMs;
        indexRef.current = index;
        setTrackIndex(index);
      } else {
        resumePoint.current = null;
      }
    }
    setPhase("idle");
    if (tracksRef.current[restartIndex]) {
      void playFromRef.current(restartIndex, restartOffsetMs)
        .then(() => {
          if (resumePoint.current === held) resumePoint.current = null;
        })
        .catch(() => setPhase("idle"));
    }
  }, [restartAt]);

  const arm = async () => {
    setManualPlayback(false);
    if (tracks.length === 0) {
      setLibraryOpen(true);
      return;
    }
    if (preRollHeld) {
      setPhase("done");
      return;
    }
    const audio = ensureAudio();
    if (pausedRef.current && !audio.ended) {
      await audio.play();
      pausedRef.current = false;
      setPhase("playing");
      return;
    }
    const held = resumePoint.current;
    if (held) {
      const heldIndex = tracks.findIndex((track) => track.id === held.trackId);
      if (heldIndex >= 0) {
        resumePoint.current = null;
        await playFromRef.current(heldIndex, held.offsetMs);
        return;
      }
      resumePoint.current = null;
    }
    const opener = tracks[trackIndex] || tracks[0];
    if (opener && loadedUrl.current !== opener.url) {
      loadedUrl.current = opener.url;
      audio.src = opener.url;
      audio.load();
    }
    audio.volume = 0;
    try {
      await audio.play();
      audio.pause();
    } catch {
      audio.volume = volumeRef.current;
    }
    audio.volume = volumeRef.current;
    const startIndex = tracks[trackIndex] ? trackIndex : 0;
    await playFromRef.current(startIndex, 0);
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (phase === "playing" && audio) {
      audio.pause();
      pausedRef.current = true;
      setPhase("idle");
      return;
    }
    void arm().catch(() => setPhase("idle"));
  };

  const resync = () => {
    setManualPlayback(false);
    if (preRollAtMs == null) {
      void playFromRef.current(0, 0).catch(() => setPhase("idle"));
      return;
    }
    const fresh = playlistPlaybackPlan(
      tracksRef.current.map((track) => track.durationMs),
      Date.now(),
      preRollAtMs,
    );
    if (fresh.finished) {
      audioRef.current?.pause();
      setPhase("done");
      return;
    }
    if (fresh.startAtMs > Date.now()) {
      audioRef.current?.pause();
      setPhase("idle");
      return;
    }
    void playFromRef.current(fresh.trackIndex, fresh.offsetMs).catch(() => setPhase("idle"));
  };

  const startTest = () => {
    if (tracks.length === 0) {
      setLibraryOpen(true);
      return;
    }
    setManualPlayback(true);
    resumePoint.current = null;
    void playFromRef.current(trackIndex, 0).catch(() => {
      setManualPlayback(false);
      setPhase("idle");
    });
  };

  const selectTrack = (index: number) => {
    window.cancelAnimationFrame(fadeFrame.current);
    fadingRef.current = false;
    audioRef.current?.pause();
    pausedRef.current = false;
    resumePoint.current = null;
    indexRef.current = index;
    setTrackIndex(index);
    setManualPlayback(false);
    if (!preRollHeld) setPhase("idle");
  };

  const changeVolume = (next: number) => {
    const level = Math.min(1, Math.max(0, next));
    setVolume(level);
    volumeRef.current = level;
    window.localStorage.setItem(VOLUME_KEY, String(level));
    if (audioRef.current && !fadingRef.current) audioRef.current.volume = level;
  };

  const years = [serviceYear - 1, serviceYear, serviceYear + 1];
  const status = describePlayback({
    phase,
    preRollAtMs,
    preRollLabel,
    trackCount: tracks.length,
    currentTitle: currentTrack?.title || null,
    manualPlayback,
  });
  const periodMatchesService = year === serviceYear && trimester === serviceTrimester;

  return (
    <section className="shrink-0 border-b border-border bg-card px-3 py-3" aria-label="Pre-service music">
      <div className="flex items-start gap-3">
        <Button
          type="button"
          size="icon"
          className="h-12 w-12 shrink-0 rounded-full"
          onClick={togglePlay}
          disabled={isLoading || schemaMissing || preRollHeld}
          aria-label={phase === "playing" || phase === "fading" ? "Pause pre-service music" : "Start pre-service music"}
        >
          {phase === "playing" || phase === "fading" ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
        </Button>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">
            Pre-service · {liveStationLabel(station)} · {playlistPeriodLabel(year, trimester)}
          </p>
          <p className="mt-0.5 truncate text-base font-semibold">
            {isLoading ? "Loading playlist…" : currentTrack?.title || "No songs in this playlist"}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">{status}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Vol
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(volume * 100)}
              aria-label="Pre-service volume"
              className="h-2 w-24 accent-primary"
              onChange={(event) => changeVolume(Number(event.target.value) / 100)}
            />
          </label>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-2"
              onClick={startTest}
              disabled={isLoading || schemaMissing || tracks.length === 0 || preRollHeld}
              title="Start this playlist from the first song without waiting for the schedule"
            >
              <Play className="h-3.5 w-3.5" />
              Test now
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-2"
              onClick={resync}
              disabled={tracks.length === 0 || preRollHeld}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Resync
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-2"
              onClick={() => setLibraryOpen((open) => !open)}
            >
              Playlist
            </Button>
          </div>
        </div>
      </div>

      {schemaMissing ? (
        <p className="mt-2 text-sm text-destructive">Playlist storage needs a database update before MP3s can be saved.</p>
      ) : null}

      {libraryOpen ? (
        <div className="mt-3 rounded-lg border border-border bg-background p-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              Year
              <select
                className="h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground"
                value={year}
                aria-label="Playlist year"
                onChange={(event) => onPeriodChange({ year: Number(event.target.value), trimester })}
              >
                {years.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex rounded-lg bg-muted p-0.5" role="group" aria-label="Trimester">
              {([1, 2, 3] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => onPeriodChange({ year, trimester: option })}
                  className={cn(
                    "rounded-md px-3 py-1 text-sm font-bold",
                    trimester === option ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
                  )}
                >
                  T{option}
                </button>
              ))}
            </div>
            <Button
              type="button"
              size="sm"
              className="h-8"
              disabled={uploading || schemaMissing}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {uploadLabel || "Upload MP3s"}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="audio/mpeg,.mp3"
              multiple
              className="hidden"
              onChange={(event) => {
                const files = Array.from(event.target.files || []);
                event.target.value = "";
                if (files.length > 0) void onUpload(files);
              }}
            />
          </div>
          {periodMatchesService ? null : (
            <p className="mt-2 text-xs text-muted-foreground">
              This service date is {playlistPeriodLabel(serviceYear, serviceTrimester)}. You are editing{" "}
              {playlistPeriodLabel(year, trimester)}.
            </p>
          )}
          {isLoading ? null : tracks.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Upload the {liveStationLabel(station)} pre-service playlist for {playlistPeriodLabel(year, trimester)}.
            </p>
          ) : (
            <ol className="mt-3 max-h-52 space-y-1 overflow-y-auto">
              {tracks.map((track, index) => (
                <li
                  key={track.id}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-1 py-1",
                    index === trackIndex && "bg-primary/10",
                  )}
                >
                  <span className="w-5 shrink-0 text-xs tabular-nums text-muted-foreground">{index + 1}</span>
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left text-sm font-medium hover:text-primary"
                    aria-label={`Start playlist with ${track.title}`}
                    onClick={() => selectTrack(index)}
                  >
                    {track.title}
                  </button>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {formatTrackOffset(track.durationMs)}
                  </span>
                  <button
                    type="button"
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                    aria-label={`Move ${track.title} earlier`}
                    disabled={index === 0}
                    onClick={() => void onMove(track.id, -1)}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                    aria-label={`Move ${track.title} later`}
                    disabled={index === tracks.length - 1}
                    onClick={() => void onMove(track.id, 1)}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="rounded px-1.5 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-destructive"
                    disabled={removingId === track.id}
                    onClick={() => {
                      setRemovingId(track.id);
                      void onRemove(track).finally(() => setRemovingId(null));
                    }}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ol>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            FOH and BCAST keep separate playlists for each trimester.
          </p>
        </div>
      ) : null}
    </section>
  );
}

function describePlayback({
  phase,
  preRollAtMs,
  preRollLabel,
  trackCount,
  currentTitle,
  manualPlayback,
}: {
  phase: PlaybackPhase;
  preRollAtMs: number | null;
  preRollLabel: string | null;
  trackCount: number;
  currentTitle: string | null;
  manualPlayback: boolean;
}) {
  if (trackCount === 0) return "Upload MP3s to replace the iPod.";
  if (phase === "fading") {
    const endLabel = preRollLabel || (preRollAtMs == null ? null : clockLabel(preRollAtMs));
    return endLabel ? `Fading out for Pre-Roll at ${endLabel}.` : "Fading out for Pre-Roll.";
  }
  if (manualPlayback) {
    if (phase === "done") return "Manual test finished.";
    if (phase === "idle") return "Manual test paused.";
    return "Manual test playing from the top.";
  }
  if (preRollAtMs == null) return "Ready. Start the playlist manually.";
  const endLabel = preRollLabel || clockLabel(preRollAtMs);
  if (phase === "done") return `Pre-Roll at ${endLabel} has this playlist stopped.`;
  if (phase === "playing") {
    return currentTitle ? `Playing. Pre-Roll at ${endLabel} will fade it out.` : `Pre-Roll at ${endLabel} will fade it out.`;
  }
  return `Ready. Start manually; Pre-Roll at ${endLabel} will fade it out.`;
}
