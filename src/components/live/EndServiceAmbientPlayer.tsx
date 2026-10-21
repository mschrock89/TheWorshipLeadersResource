import { useEffect, useRef, useState } from "react";
import { Loader2, Pause, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EndServiceAmbientTrack } from "@/hooks/useEndServiceAmbientTrack";
import { formatTrackOffset } from "@/lib/preServicePlaylist";

const VOLUME_KEY = "wlr-end-service-ambient-volume";

function readVolume() {
  if (typeof window === "undefined") return 0.75;
  const storedText = window.localStorage.getItem(VOLUME_KEY);
  if (storedText == null || storedText === "") return 0.75;
  const stored = Number(storedText);
  return Number.isFinite(stored) && stored >= 0 && stored <= 1 ? stored : 0.75;
}

export function EndServiceAmbientPlayer({
  track,
  isLoading,
  schemaMissing,
  playAt = null,
}: {
  track: EndServiceAmbientTrack | null;
  isLoading: boolean;
  schemaMissing: boolean;
  playAt?: number | null;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [volume, setVolume] = useState(readVolume);
  const trackId = track?.id;
  const trackUrl = track?.url;
  const handledPlay = useRef<number | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    setPlaying(false);
    setElapsedMs(0);
    if (trackUrl) {
      audio.src = trackUrl;
      audio.load();
    } else {
      audio.removeAttribute("src");
      audio.load();
    }
  }, [trackId, trackUrl]);

  useEffect(() => {
    if (playAt == null || playAt === handledPlay.current) return;
    const audio = audioRef.current;
    if (!audio || !trackUrl) return;
    handledPlay.current = playAt;
    audio.currentTime = 0;
    setElapsedMs(0);
    void audio.play().catch(() => setPlaying(false));
  }, [playAt, trackUrl]);

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio || !track) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    try {
      await audio.play();
    } catch {
      setPlaying(false);
    }
  };

  const restart = () => {
    const audio = audioRef.current;
    if (!audio || !track) return;
    audio.currentTime = 0;
    setElapsedMs(0);
    void audio.play().catch(() => setPlaying(false));
  };

  const changeVolume = (next: number) => {
    const level = Math.min(1, Math.max(0, next));
    setVolume(level);
    window.localStorage.setItem(VOLUME_KEY, String(level));
    if (audioRef.current) audioRef.current.volume = level;
  };

  return (
    <section
      className="shrink-0 border-b border-border bg-card px-3 py-2"
      aria-label="End-of-service ambient track"
    >
      <audio
        ref={audioRef}
        preload="metadata"
        playsInline
        volume={volume}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(event) => setElapsedMs(Math.round(event.currentTarget.currentTime * 1000))}
        onEnded={() => {
          if (audioRef.current) audioRef.current.currentTime = 0;
          setPlaying(false);
          setElapsedMs(0);
        }}
      />
      <div className="flex min-w-0 items-center gap-2">
        <Button
          type="button"
          size="icon"
          className="h-9 w-9 shrink-0 rounded-full"
          onClick={() => void toggle()}
          disabled={!track || isLoading || schemaMissing}
          aria-label={playing ? "Pause end-of-service ambient track" : "Play end-of-service ambient track"}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : playing ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
        </Button>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">
            End-of-service prayer
          </p>
          <p className="truncate text-sm font-semibold">
            {schemaMissing
              ? "Ambient track needs a database update"
              : isLoading
                ? "Loading ambient track…"
                : track?.title || "No ambient track uploaded"}
          </p>
        </div>
        {track ? (
          <span className="hidden shrink-0 text-xs tabular-nums text-muted-foreground sm:inline">
            {formatTrackOffset(elapsedMs)} / {formatTrackOffset(track.durationMs)}
          </span>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          disabled={!track}
          onClick={restart}
          aria-label="Restart ambient track"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
        <label className="hidden shrink-0 items-center gap-1 text-[11px] text-muted-foreground md:flex">
          Vol
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(volume * 100)}
            aria-label="End-of-service ambient volume"
            className="h-2 w-20 accent-primary"
            onChange={(event) => changeVolume(Number(event.target.value) / 100)}
          />
        </label>
      </div>
    </section>
  );
}
