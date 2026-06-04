import { useState, useRef } from "react";
import { Play, Pause, Square, SkipBack, Pencil, Check, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useStemPlayer } from "@/hooks/useStemPlayer";
import { StemSongMarker } from "@/hooks/useSetlistStems";
import { SetlistSong } from "./ReferenceTrackMarkerInput";

interface StemTransportProps {
  bpm?: number | null;
  stemCount: number;
  loadedCount: number;
  markers: StemSongMarker[];
  setlistSongs: SetlistSong[];
  canManage: boolean;
  onMarkersChange: (markers: StemSongMarker[]) => void;
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function parseTimeInput(raw: string): number | null {
  const str = raw.trim();
  const colonParts = str.split(":");
  if (colonParts.length === 2) {
    const m = parseInt(colonParts[0], 10);
    const s = parseInt(colonParts[1], 10);
    if (!isNaN(m) && !isNaN(s) && s < 60) return m * 60 + s;
  } else {
    const n = parseFloat(str);
    if (!isNaN(n)) return n;
  }
  return null;
}

export function StemTransport({
  bpm,
  stemCount,
  loadedCount,
  markers,
  setlistSongs,
  canManage,
  onMarkersChange,
}: StemTransportProps) {
  const { isPlaying, currentTime, duration, togglePlay, stop, seekTo } = useStemPlayer();
  const [isEditing, setIsEditing] = useState(false);
  const [editTimes, setEditTimes] = useState<Record<string, string>>({});

  const isReady = loadedCount > 0;
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const allLoaded = stemCount > 0 && loadedCount === stemCount;
  const sortedMarkers = [...markers].sort((a, b) => a.timestampSeconds - b.timestampSeconds);
  const hasMarkers = sortedMarkers.length > 0;

  // ── Editing helpers ───────────────────────────────────────────────────────

  const handleStartEdit = () => {
    const byId = new Map(markers.map((m) => [m.songId, m]));
    const times: Record<string, string> = {};
    for (const song of setlistSongs) {
      const marker = byId.get(song.id);
      times[song.id] = marker ? formatTime(marker.timestampSeconds) : "";
    }
    setEditTimes(times);
    setIsEditing(true);
  };

  const handleStamp = (songId: string) => {
    setEditTimes((prev) => ({ ...prev, [songId]: formatTime(currentTime) }));
  };

  const handleSave = () => {
    const byId = new Map(markers.map((m) => [m.songId, m]));
    const next: StemSongMarker[] = [];
    for (const song of setlistSongs) {
      const raw = editTimes[song.id];
      if (!raw) continue;
      const secs = parseTimeInput(raw);
      if (secs === null || secs < 0) continue;
      next.push({
        id: byId.get(song.id)?.id ?? crypto.randomUUID(),
        songId: song.id,
        songTitle: song.title,
        timestampSeconds: secs,
      });
    }
    onMarkersChange(next);
    setIsEditing(false);
  };


  return (
    <div className="relative flex flex-col bg-black/30 border-b border-border/30 rounded-t-lg">
      {/* ── Main controls block ── */}
      <div className="flex flex-col gap-2 px-3 py-2 mx-2 mt-2 mb-1 rounded-lg border-2 border-border/70 bg-black/20">
        {/* Title */}
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xl sm:text-2xl font-black tracking-widest uppercase leading-none whitespace-nowrap bg-gradient-to-r from-primary via-primary/80 to-primary/50 bg-clip-text text-transparent select-none">
            Stem Player
          </span>
          <span className="flex-1 h-1 rounded-full bg-primary/70" />
        </div>

        {/* Controls cluster */}
        <div className="flex items-center gap-3">
          {/* BPM */}
          {bpm && (
            <div className="hidden sm:flex items-center gap-1 bg-white/5 rounded px-2 py-1">
              <span className="text-[10px] text-muted-foreground font-medium">BPM</span>
              <span className="text-xs font-bold text-foreground">{bpm}</span>
            </div>
          )}

          {/* Loading indicator */}
          {stemCount > 0 && !allLoaded && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              <span className="text-[10px]">
                {loadedCount}/{stemCount}
              </span>
            </div>
          )}

          {/* Control pod */}
          <div className="flex items-center gap-1 rounded-full border border-border/50 bg-black/40 p-1 shadow-inner">
            {/* Stop */}
            <Button
              variant="ghost"
              size="icon"
              disabled={!isReady}
              onClick={stop}
              className="h-9 w-9 rounded-full text-muted-foreground hover:text-foreground hover:bg-white/5"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
            </Button>

            {/* Return to start */}
            <Button
              variant="ghost"
              size="icon"
              disabled={!isReady}
              onClick={() => seekTo(0)}
              className="h-9 w-9 rounded-full text-muted-foreground hover:text-foreground hover:bg-white/5"
            >
              <SkipBack className="h-3.5 w-3.5 fill-current" />
            </Button>

            {/* Play / Pause */}
            <Button
              size="icon"
              disabled={!isReady}
              onClick={togglePlay}
              className={cn(
                "h-10 w-10 rounded-full shadow-lg",
                "bg-primary hover:bg-primary/90 text-primary-foreground",
                "disabled:opacity-40"
              )}
            >
              {isPlaying ? (
                <Pause className="h-4 w-4 fill-current" />
              ) : (
                <Play className="h-4 w-4 fill-current ml-0.5" />
              )}
            </Button>
          </div>

          {/* Time display */}
          <div className="font-mono text-sm tabular-nums text-foreground/80 text-right whitespace-nowrap">
            {formatTime(currentTime)}
            <span className="text-muted-foreground"> / {formatTime(duration)}</span>
          </div>
        </div>
      </div>

      {/* ── Song chips row ── */}
      {(hasMarkers || (canManage && setlistSongs.length > 0)) && !isEditing && (
        <div className="flex flex-wrap items-center gap-1 px-3 pb-1.5">
          {sortedMarkers.map((marker, i) => (
            <button
              key={marker.id}
              onClick={() => seekTo(marker.timestampSeconds)}
              className={cn(
                "flex items-center justify-center px-2 py-0.5 rounded-md transition-all flex-shrink-0",
                "bg-primary/10 border border-primary/25 text-primary",
                "hover:bg-primary/20 hover:border-primary/50 hover:shadow-sm",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/60",
                "text-[11px] font-medium tabular-nums"
              )}
              title={`Jump to ${marker.songTitle}`}
            >
              Song {i + 1}
            </button>
          ))}
          {canManage && setlistSongs.length > 0 && (
            <button
              onClick={handleStartEdit}
              title={hasMarkers ? "Edit markers" : "Add markers"}
              className={cn(
                "flex items-center justify-center h-5 w-5 rounded transition-all flex-shrink-0",
                "text-muted-foreground/50 hover:text-muted-foreground",
              )}
            >
              <Pencil className="h-3 w-3" />
            </button>
          )}
        </div>
      )}

      {/* ── Song map section (marker timeline + editor) ── */}
      {(hasMarkers || (canManage && setlistSongs.length > 0)) && (
        <div className="px-3 pb-2 space-y-1.5">

          {/* ── Marker editor panel ── */}
          {isEditing && (
            <div className="mt-1 p-2.5 rounded-lg bg-black/40 border border-border/30 space-y-1.5">
              {/* Header */}
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Song Markers
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setIsEditing(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="h-6 px-2 text-xs gap-1"
                    onClick={handleSave}
                  >
                    <Check className="h-3 w-3" />
                    Save
                  </Button>
                </div>
              </div>

              <p className="text-[10px] text-muted-foreground/60 mb-1.5">
                Enter a time (m:ss) for each song, or play to a position and click Stamp.
              </p>

              {/* Song rows */}
              {setlistSongs.map((song, i) => (
                <div key={song.id} className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground/60 w-4 text-right flex-shrink-0 tabular-nums">
                    {i + 1}
                  </span>
                  <span className="text-xs text-foreground flex-1 truncate min-w-0">
                    {song.title}
                  </span>
                  <input
                    type="text"
                    placeholder="0:00"
                    value={editTimes[song.id] ?? ""}
                    onChange={(e) =>
                      setEditTimes((prev) => ({ ...prev, [song.id]: e.target.value }))
                    }
                    className={cn(
                      "w-14 text-center text-xs font-mono rounded px-1 py-0.5",
                      "bg-black/40 border border-border/40 text-foreground",
                      "placeholder:text-muted-foreground/40",
                      "focus:outline-none focus:border-primary/60"
                    )}
                  />
                  <button
                    onClick={() => handleStamp(song.id)}
                    disabled={!isReady || duration === 0}
                    className={cn(
                      "flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] flex-shrink-0 transition-all",
                      "bg-primary/10 border border-primary/25 text-primary",
                      "hover:bg-primary/20 hover:border-primary/50",
                      "disabled:opacity-30 disabled:cursor-not-allowed"
                    )}
                    title="Set to current playback time"
                  >
                    <Clock className="h-2.5 w-2.5" />
                    Stamp
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Subtle progress stripe at very bottom */}
      <div
        className="absolute bottom-0 left-0 h-[2px] bg-primary/20 pointer-events-none transition-none"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
