import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Clock3,
  Headphones,
  Loader2,
  Music2,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { CompactSelectValue } from "@/components/ui/compact-select-value";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useCampuses } from "@/hooks/useCampuses";
import { usePreServicePlaylist } from "@/hooks/usePreServicePlaylist";
import { cn } from "@/lib/cn";
import {
  fallbackPlaylistPeriod,
  formatTrackOffset,
  playlistPeriodLabel,
  type PreServiceStation,
} from "@/lib/preServicePlaylist";

const CAMPUS_KEY = "pre-service-playlist-admin-campus";

export default function PreServicePlaylistsAdmin() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const { isAdmin, isLoading: authLoading } = useAuth();
  const { data: campuses = [], isLoading: campusesLoading } = useCampuses();
  const currentPeriod = fallbackPlaylistPeriod(new Date().toISOString().slice(0, 10));
  const [campusId, setCampusId] = useState(() => localStorage.getItem(CAMPUS_KEY) || "");
  const [station, setStation] = useState<PreServiceStation>("foh");
  const [year, setYear] = useState(currentPeriod.year);
  const [trimester, setTrimester] = useState<1 | 2 | 3>(currentPeriod.trimester);
  const [dragging, setDragging] = useState(false);
  const selectedCampusId = campuses.some((campus) => campus.id === campusId)
    ? campusId
    : campuses[0]?.id || "";

  useEffect(() => {
    if (!authLoading && !isAdmin) navigate("/dashboard");
  }, [authLoading, isAdmin, navigate]);

  const playlist = usePreServicePlaylist({
    campusId: selectedCampusId,
    station,
    serviceDate: `${year}-${String((trimester - 1) * 4 + 1).padStart(2, "0")}-01`,
    enabled: isAdmin && Boolean(selectedCampusId),
    selectedPeriod: { year, trimester },
  });

  const chooseCampus = (value: string) => {
    setCampusId(value);
    localStorage.setItem(CAMPUS_KEY, value);
  };

  const upload = (files: FileList | File[]) => {
    const selected = Array.from(files);
    if (selected.length > 0) void playlist.uploadFiles(selected);
  };

  if (authLoading || campusesLoading) {
    return (
      <div className="mx-auto w-full max-w-4xl py-2 sm:py-8">
        <Skeleton className="mb-6 h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!isAdmin) return null;

  const totalDuration = formatTrackOffset(playlist.durationMs);
  const years = Array.from({ length: 5 }, (_, index) => currentPeriod.year - 1 + index);

  return (
    <div className="mx-auto w-full max-w-4xl py-0 sm:py-4">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate("/admin-tools")}
        className="mb-4 -ml-2 gap-2 text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Admin Tools
      </Button>

      <div className="mb-7">
        <h1 className="font-display text-3xl font-bold text-foreground">Pre-Service Playlists</h1>
        <p className="mt-2 text-muted-foreground">
          Build the FOH and broadcast playlists that play before service. Each campus and trimester has its own list.
        </p>
      </div>

      <section className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem_auto] sm:items-end">
          <div className="space-y-2">
            <Label>Campus</Label>
            <Select value={selectedCampusId} onValueChange={chooseCampus}>
              <SelectTrigger>
                <CompactSelectValue
                  label={campuses.find((campus) => campus.id === selectedCampusId)?.name}
                  placeholder="Select campus"
                />
              </SelectTrigger>
              <SelectContent>
                {campuses.map((campus) => (
                  <SelectItem key={campus.id} value={campus.id}>
                    {campus.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Year</Label>
            <Select value={String(year)} onValueChange={(value) => setYear(Number(value))}>
              <SelectTrigger>
                <CompactSelectValue label={String(year)} placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                {years.map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Trimester</Label>
            <div className="flex h-10 rounded-lg bg-muted p-1" role="group" aria-label="Trimester">
              {([1, 2, 3] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setTrimester(option)}
                  className={cn(
                    "rounded-md px-3 text-sm font-semibold transition-colors",
                    trimester === option
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  T{option}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 flex gap-2 border-b border-border">
          {(["foh", "bcast"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setStation(option)}
              className={cn(
                "-mb-px flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold",
                station === option
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Headphones className="h-4 w-4" />
              {option === "foh" ? "FOH" : "Broadcast"}
            </button>
          ))}
        </div>

        {playlist.schemaMissing ? (
          <div className="mt-5 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <p className="font-semibold text-destructive">Playlist database is not installed</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Apply the latest Supabase migration, then refresh this page.
            </p>
          </div>
        ) : (
          <button
            type="button"
            disabled={playlist.uploading || !selectedCampusId}
            onClick={() => fileRef.current?.click()}
            onDragEnter={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              event.preventDefault();
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              upload(event.dataTransfer.files);
            }}
            className={cn(
              "mt-5 flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors",
              dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/60 hover:bg-muted/30",
              "disabled:cursor-not-allowed disabled:opacity-60",
            )}
          >
            {playlist.uploading ? (
              <Loader2 className="mb-3 h-8 w-8 animate-spin text-primary" />
            ) : (
              <UploadCloud className="mb-3 h-8 w-8 text-primary" />
            )}
            <span className="font-semibold">
              {playlist.uploadLabel || "Drop MP3s here or choose files"}
            </span>
            <span className="mt-1 text-sm text-muted-foreground">
              Select multiple songs to add them in file order.
            </span>
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="audio/mpeg,.mp3"
          multiple
          className="hidden"
          onChange={(event) => {
            if (event.target.files) upload(event.target.files);
            event.target.value = "";
          }}
        />

        <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">
              {station === "foh" ? "FOH" : "Broadcast"} · {playlistPeriodLabel(year, trimester)}
            </h2>
            <p className="text-sm text-muted-foreground">
              {playlist.tracks.length} {playlist.tracks.length === 1 ? "song" : "songs"}
            </p>
          </div>
          {playlist.tracks.length > 0 ? (
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Clock3 className="h-4 w-4" />
              {totalDuration} total
            </span>
          ) : null}
        </div>

        {playlist.isLoading ? (
          <div className="mt-4 space-y-2">
            {[1, 2, 3].map((row) => (
              <Skeleton key={row} className="h-14 w-full" />
            ))}
          </div>
        ) : playlist.tracks.length === 0 ? (
          <div className="mt-4 rounded-lg bg-muted/40 px-4 py-10 text-center">
            <Music2 className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 font-medium">No songs in this playlist</p>
            <p className="mt-1 text-sm text-muted-foreground">Upload MP3s above to create it.</p>
          </div>
        ) : (
          <ol className="mt-4 divide-y divide-border rounded-lg border border-border">
            {playlist.tracks.map((track, index) => (
              <li key={track.id} className="flex items-center gap-3 px-3 py-3 sm:px-4">
                <span className="w-6 shrink-0 text-sm tabular-nums text-muted-foreground">{index + 1}</span>
                <Music2 className="h-4 w-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 truncate font-medium">{track.title}</span>
                <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                  {formatTrackOffset(track.durationMs)}
                </span>
                <div className="flex shrink-0 items-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={index === 0}
                    aria-label={`Move ${track.title} earlier`}
                    onClick={() => void playlist.moveTrack(track.id, -1)}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={index === playlist.tracks.length - 1}
                    aria-label={`Move ${track.title} later`}
                    onClick={() => void playlist.moveTrack(track.id, 1)}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    aria-label={`Remove ${track.title}`}
                    onClick={() => {
                      if (window.confirm(`Remove “${track.title}” from this playlist?`)) {
                        void playlist.removeTrack(track);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
