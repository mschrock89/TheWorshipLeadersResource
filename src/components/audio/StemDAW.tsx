import { useEffect, useState, useCallback } from "react";
import { Layers, Plus, Trash2, ChevronDown, ChevronUp, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  StemType,
  STEM_TYPES,
  Stem,
  StemSession,
  StemSongMarker,
  useSetlistStemSession,
  useDeleteStem,
  useDeleteStemSession,
  useUpdateStemMix,
  useUpdateStemSongMarkers,
} from "@/hooks/useSetlistStems";
import {
  StemPlayerProvider,
  useStemPlayer,
  StemPlayerTrack,
  isStemPlayerSupported,
} from "@/hooks/useStemPlayer";
import { MonitorSmartphone } from "lucide-react";
import { StemTrackRow } from "./StemTrackRow";
import { StemTransport } from "./StemTransport";
import { StemUploadDialog } from "./StemUploadDialog";
import { useAudioPlayerSafe } from "@/hooks/useAudioPlayer";
import { SetlistSong } from "./ReferenceTrackMarkerInput";

// ─── Inner DAW (needs StemPlayerProvider to be an ancestor) ──────────────────

interface StemDAWInnerProps {
  session: StemSession;
  playlistId: string;
  canManage: boolean;
  onUploadClick: (stemType?: StemType) => void;
  setlistSongs: SetlistSong[];
}

function StemDAWInner({ session, playlistId, canManage, onUploadClick, setlistSongs }: StemDAWInnerProps) {
  const { loadStems, stop, volumes, mutes, loadStates } = useStemPlayer();
  const deleteStem = useDeleteStem();
  const updateMix = useUpdateStemMix();
  const updateMarkers = useUpdateStemSongMarkers();
  const globalPlayer = useAudioPlayerSafe();

  const stemsMap = Object.fromEntries(session.stems.map((s) => [s.stem_type, s])) as Partial<Record<StemType, Stem>>;

  const loadedCount = STEM_TYPES.filter((t) => loadStates[t] === "ready").length;
  const stemCount = session.stems.length;

  // Load stems into player whenever session data changes
  useEffect(() => {
    if (session.stems.length === 0) return;

    const tracks: StemPlayerTrack[] = session.stems.map((s) => ({
      stemType: s.stem_type,
      audioUrl: s.audio_url,
      volume: s.volume,
      isMuted: s.is_muted,
    }));

    loadStems(tracks);
  }, [session.id, session.stems.length]);

  // Pause global player when DAW starts playing
  const { isPlaying } = useStemPlayer();
  useEffect(() => {
    if (isPlaying && globalPlayer?.isPlaying) {
      globalPlayer.pause();
    }
  }, [isPlaying]);

  // Cleanup on unmount
  useEffect(() => () => stop(), []);

  const handleDeleteStem = useCallback(
    (stem: Stem) => {
      deleteStem.mutate({ stemId: stem.id, audioUrl: stem.audio_url, playlistId });
    },
    [deleteStem, playlistId]
  );

  // Save mix state back to DB (persists volume + mute)
  const handleSaveMix = useCallback(async () => {
    for (const stem of session.stems) {
      const vol = volumes[stem.stem_type];
      const muted = mutes[stem.stem_type];
      if (vol !== undefined || muted !== undefined) {
        updateMix.mutate({
          stemId: stem.id,
          playlistId,
          volume: vol,
          isMuted: muted,
        });
      }
    }
  }, [session.stems, volumes, mutes, updateMix, playlistId]);

  const handleMarkersChange = useCallback(
    (markers: StemSongMarker[]) => {
      updateMarkers.mutate({ sessionId: session.id, playlistId, markers });
    },
    [updateMarkers, session.id, playlistId]
  );

  return (
    <div className="flex flex-col rounded-lg overflow-hidden border border-border/30 bg-[#0e0e12]">
      {/* Transport bar */}
      <div className="relative">
        <StemTransport
          bpm={session.bpm}
          stemCount={stemCount}
          loadedCount={loadedCount}
          markers={session.song_markers}
          setlistSongs={setlistSongs}
          canManage={canManage}
          onMarkersChange={handleMarkersChange}
        />
      </div>

      {/* Track rows */}
      <div className="flex flex-col divide-y divide-border/10">
        {STEM_TYPES.map((stemType) => (
          <div key={stemType} className="group relative">
            <StemTrackRow
              stemType={stemType}
              stem={stemsMap[stemType]}
              canManage={canManage}
              onUploadClick={onUploadClick}
              onDeleteStem={canManage ? handleDeleteStem : undefined}
            />
          </div>
        ))}
      </div>

      {/* Footer actions */}
      {canManage && (
        <div className="flex items-center justify-between px-3 py-2 bg-black/20 border-t border-border/20">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs text-muted-foreground hover:text-foreground h-7"
            onClick={() => onUploadClick()}
          >
            <Plus className="h-3.5 w-3.5" />
            Upload Stems
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs text-muted-foreground hover:text-green-400 h-7"
            onClick={handleSaveMix}
            disabled={updateMix.isPending}
          >
            <Save className="h-3.5 w-3.5" />
            Save Mix
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Phone fallback ───────────────────────────────────────────────────────────
//
// The multi-track stem mixer is disabled on phones — mixing many full stems
// reliably isn't achievable on phone browsers (memory limits + audio sync). It
// stays available on tablets (incl. iPad) and computers.

function StemPlayerUnavailableNotice() {
  return (
    <div className="flex flex-col items-center text-center gap-2 py-6 px-4 rounded-lg border border-border/30 bg-black/20">
      <MonitorSmartphone className="h-8 w-8 text-muted-foreground/50" />
      <p className="text-sm font-medium text-foreground/80">Stem mixer isn't available on phones</p>
      <p className="text-xs text-muted-foreground max-w-xs">
        Open this setlist on an iPad or computer to play and mix the stems.
      </p>
    </div>
  );
}

// ─── Outer shell (handles data, expand/collapse, upload dialog) ───────────────

interface StemDAWProps {
  playlistId: string;
  canManage: boolean;
  serviceDate: string;
  setlistSongs?: SetlistSong[];
  /** When true, renders without its own section header — for use inside a tab. */
  embedded?: boolean;
}

export function StemDAW({ playlistId, canManage, serviceDate, setlistSongs = [], embedded = false }: StemDAWProps) {
  const { data: session, isLoading } = useSetlistStemSession(playlistId);
  const deleteSession = useDeleteStemSession();
  const [isExpanded, setIsExpanded] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadTargetStem, setUploadTargetStem] = useState<StemType | undefined>();

  const hasStemSession = !!session;
  const stemCount = session?.stems.length ?? 0;
  const [playerSupported] = useState(isStemPlayerSupported);

  const handleUploadClick = useCallback((stemType?: StemType) => {
    setUploadTargetStem(stemType);
    setUploadOpen(true);
  }, []);

  const handleUploadComplete = useCallback(() => {
    // Auto-expand when first stems are uploaded
    setIsExpanded(true);
  }, []);

  if (isLoading) return null;

  // ── Embedded mode: no section header, mixer always shown ──────────────────
  if (embedded) {
    return (
      <>
        {hasStemSession ? (
          <div className="space-y-2">
            {canManage && (
              <div className="flex items-center justify-end gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 h-7 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => handleUploadClick()}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Stems
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Stem Session?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete all {stemCount} uploaded stem files for this setlist. This cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive hover:bg-destructive/90"
                        onClick={() => deleteSession.mutate({ sessionId: session!.id, playlistId })}
                      >
                        Delete All Stems
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
            {playerSupported ? (
              <StemPlayerProvider>
                <StemDAWInner
                  session={session}
                  playlistId={playlistId}
                  canManage={canManage}
                  onUploadClick={handleUploadClick}
                  setlistSongs={setlistSongs}
                />
              </StemPlayerProvider>
            ) : (
              <StemPlayerUnavailableNotice />
            )}
          </div>
        ) : (
          <div className="text-center py-10 text-muted-foreground">
            <Layers className="h-9 w-9 mx-auto mb-3 opacity-30" />
            <p className="text-sm max-w-xs mx-auto">
              {canManage
                ? "Upload individual stems to mix during rehearsal — drums, guitars, keys, and more."
                : "No stems uploaded for this setlist yet."}
            </p>
            {canManage && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-8 text-xs mt-4"
                onClick={() => handleUploadClick()}
              >
                <Plus className="h-3.5 w-3.5" />
                Add Stems
              </Button>
            )}
          </div>
        )}

        <StemUploadDialog
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          playlistId={playlistId}
          serviceDate={serviceDate}
          existingSession={session ?? null}
          onComplete={handleUploadComplete}
        />
      </>
    );
  }

  return (
    <>
      {/* Section header */}
      <div className="pt-4 mt-2 border-t border-border/40">
        <div className="flex items-center gap-2.5 mb-3">
          <button
            className="flex items-center justify-center h-7 w-7 rounded-full bg-violet-500/15 flex-shrink-0"
            onClick={() => setIsExpanded((prev) => !prev)}
          >
            <Layers className="h-4 w-4 text-violet-400" />
          </button>
          <button
            className="flex items-center gap-2"
            onClick={() => setIsExpanded((prev) => !prev)}
          >
            <p className="text-sm font-semibold text-violet-400">
              Stem Mixer
            </p>
          </button>
          {stemCount > 0 && (
            <Badge
              variant="secondary"
              className="text-[11px] font-semibold px-1.5 py-0 h-5 min-w-5 justify-center bg-violet-500/15 text-violet-400 border-0"
            >
              {stemCount}
            </Badge>
          )}
          <button onClick={() => setIsExpanded((prev) => !prev)}>
            {isExpanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>

          <div className="flex items-center gap-1 ml-auto">
            {canManage && !hasStemSession && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-7 text-xs"
                onClick={() => { setIsExpanded(true); handleUploadClick(); }}
              >
                <Plus className="h-3.5 w-3.5" />
                Add Stems
              </Button>
            )}

            {canManage && hasStemSession && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Stem Session?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete all {stemCount} uploaded stem files for this setlist. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive hover:bg-destructive/90"
                      onClick={() => deleteSession.mutate({ sessionId: session!.id, playlistId })}
                    >
                      Delete All Stems
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>

        {/* Empty state */}
        {!hasStemSession && (
          <div className="text-center py-4 text-muted-foreground">
            <Layers className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-xs">
              {canManage
                ? "Upload individual stems to mix during rehearsal — drums, guitars, keys, and more."
                : "No stems uploaded for this setlist yet."}
            </p>
          </div>
        )}

        {/* DAW */}
        {hasStemSession && isExpanded && (
          playerSupported ? (
            <StemPlayerProvider>
              <StemDAWInner
                session={session}
                playlistId={playlistId}
                canManage={canManage}
                onUploadClick={handleUploadClick}
                setlistSongs={setlistSongs}
              />
            </StemPlayerProvider>
          ) : (
            <StemPlayerUnavailableNotice />
          )
        )}

        {/* Collapsed pill showing stem types when loaded */}
        {hasStemSession && !isExpanded && stemCount > 0 && (
          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            className="group w-full flex flex-wrap items-center gap-1.5 p-2.5 rounded-lg border bg-violet-500/5 border-violet-500/20 hover:border-violet-500/40 hover:bg-violet-500/10 transition-colors mb-1 text-left"
          >
            {session.stems.map((s) => (
              <span
                key={s.id}
                className="inline-flex items-center gap-1 text-[10px] h-5 px-1.5 rounded-md border border-violet-500/30 bg-violet-500/10 text-violet-300"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
                {s.stem_type.replace("_", " ")}
              </span>
            ))}
            <span className="ml-auto text-[11px] font-medium text-violet-300/80 group-hover:text-violet-300 pl-1">
              Open mixer
            </span>
          </button>
        )}
      </div>

      <StemUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        playlistId={playlistId}
        serviceDate={serviceDate}
        existingSession={session ?? null}
        onComplete={handleUploadComplete}
      />
    </>
  );
}
