import { useState } from "react";
import { format } from "date-fns";
import { Play, Pause, Music2, Calendar, MapPin, Headphones, Plus, Trash2, FileAudio, ChevronDown, ChevronRight, Clock, Pencil, Download, Sparkles, MoreVertical, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAudioPlayer, Track } from "@/hooks/useAudioPlayer";
import { SetlistPlaylistWithTracks, ReferenceTrack } from "@/hooks/useSetlistPlaylists";
import { MINISTRY_TYPES } from "@/lib/constants";
import { parseLocalDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useUserCampuses } from "@/hooks/useCampuses";
import { ReferenceTrackUploadDialog } from "./ReferenceTrackUploadDialog";
import { EditReferenceTrackMarkersDialog } from "./EditReferenceTrackMarkersDialog";
import { SetlistSong } from "./ReferenceTrackMarkerInput";
import { useAutoReorderChartsFromReferenceTrack, useDeleteReferenceTrack } from "@/hooks/useReferenceTrack";
import { useSetlistStemSession } from "@/hooks/useSetlistStems";
import { canManageReferenceTracks, isAuditionCandidateRole } from "@/lib/access";
import { StemDAW } from "./StemDAW";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface SetlistPlaylistCardProps {
  playlist: SetlistPlaylistWithTracks;
}

export function SetlistPlaylistCard({ playlist }: SetlistPlaylistCardProps) {
  const { setPlaylist, currentTrack, isPlaying, togglePlay, playlist: currentPlaylist, seekTo, play } = useAudioPlayer();
  const { isAdmin, user } = useAuth();
  const { data: roles = [] } = useUserRoles(user?.id);
  const { data: userCampuses = [] } = useUserCampuses(user?.id);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editMarkersOpen, setEditMarkersOpen] = useState(false);
  const [selectedRefTrack, setSelectedRefTrack] = useState<ReferenceTrack | null>(null);
  const [trackToDelete, setTrackToDelete] = useState<ReferenceTrack | null>(null);
  const [expandedMarkers, setExpandedMarkers] = useState<Record<string, boolean>>({});
  const deleteRefTrack = useDeleteReferenceTrack();
  const autoReorderCharts = useAutoReorderChartsFromReferenceTrack();
  const roleNames = roles.map((role) => role.role);
  const userCampusIds = userCampuses.map((campus) => campus.campus_id);
  const isAuditionCandidate = isAuditionCandidateRole(roleNames);
  const canManageTracks = canManageReferenceTracks({
    isAdmin,
    roleNames,
    playlistCampusId: playlist.campus_id,
    userCampusIds,
  });
  const canUploadReferenceTrack =
    canManageTracks || (playlist.ministry_type === "audition" && isAuditionCandidate);

  const getMinistryLabel = (type: string) => {
    return MINISTRY_TYPES.find((m) => m.value === type)?.label || type;
  };

  const serviceDate = parseLocalDate(playlist.service_date);
  const formattedDate = format(serviceDate, "EEEE, MMM d");
  const customServiceName = playlist.draft_sets?.custom_services?.service_name || null;
  
  // Ensure referenceTracks is always an array (may be undefined from other contexts)
  const referenceTracks = playlist.referenceTracks || [];
  
  // Build setlist songs for marker dropdowns
  const setlistSongs: SetlistSong[] = (playlist.draft_sets?.draft_set_songs || [])
    .sort((a, b) => a.sequence_order - b.sequence_order)
    .map((dss) => ({
      id: dss.songs?.id || dss.id,
      title: dss.songs?.title || "Unknown Song",
      sequenceOrder: dss.sequence_order,
    }));
  const hasAudioTracks = playlist.tracks.length > 0 || referenceTracks.length > 0;

  // Stem session (shared via react-query cache with StemDAW) — used for tab count + default tab
  const { data: stemSession } = useSetlistStemSession(playlist.id);
  const stemCount = stemSession?.stems.length ?? 0;
  const soundcloudCount = playlist.tracks.length;
  const weekendCount = referenceTracks.length;
  const defaultTab =
    soundcloudCount > 0 ? "soundcloud" : weekendCount > 0 ? "weekend" : "stems";

  // Combine setlist tracks and weekend tracks for playback
  const allTracks: Track[] = [...playlist.tracks, ...referenceTracks];

  // Check if this playlist is currently playing
  const isThisPlaylistPlaying =
    currentPlaylist.length > 0 &&
    allTracks.length > 0 &&
    currentPlaylist[0]?.id === allTracks[0]?.id;

  const handlePlayAll = () => {
    if (isThisPlaylistPlaying) {
      togglePlay();
    } else if (hasAudioTracks) {
      setPlaylist(allTracks, 0);
    }
  };

  const handlePlayTrack = (track: Track, index: number) => {
    if (currentTrack?.id === track.id) {
      togglePlay();
    } else {
      setPlaylist(allTracks, index);
    }
  };

  const isReferenceTrack = (track: Track): track is ReferenceTrack => {
    return 'isReferenceTrack' in track && track.isReferenceTrack === true;
  };

  const formatTimestamp = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleMarkerClick = (track: ReferenceTrack, timestampSeconds: number) => {
    // If this track is already playing/loaded, just seek
    if (currentTrack?.id === track.id) {
      seekTo(timestampSeconds);
      // If paused, also start playing
      if (!isPlaying) {
        play();
      }
    } else {
      // Start playing this track at the specified timestamp
      play(track, timestampSeconds);
    }
  };

  const toggleMarkerExpand = (trackId: string) => {
    setExpandedMarkers(prev => ({
      ...prev,
      [trackId]: !prev[trackId]
    }));
  };

  const openEditMarkers = (track: ReferenceTrack) => {
    setSelectedRefTrack(track);
    setEditMarkersOpen(true);
  };

  const handleDownload = async (track: ReferenceTrack) => {
    try {
      const response = await fetch(track.audioUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${track.title}.mp3`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  const handleAutoReorderCharts = (track: ReferenceTrack) => {
    autoReorderCharts.mutate({
      referenceTrackId: track.referenceTrackId,
      draftSetId: playlist.draft_set_id,
    });
  };

  return (
    <>
      <Card className="overflow-hidden border-border/50 bg-card/50">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <Calendar className="h-3 w-3" />
                <span>{formattedDate}</span>
              </div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Headphones className="h-5 w-5 text-primary" />
                {customServiceName ? `${customServiceName} Playlist` : "Practice Hub"}
              </CardTitle>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="secondary" className="text-xs font-medium">
                  {getMinistryLabel(playlist.ministry_type)}
                </Badge>
                {playlist.campuses?.name && (
                  <Badge variant="outline" className="text-xs font-normal gap-1">
                    <MapPin className="h-3 w-3" />
                    {playlist.campuses.name}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          <Tabs defaultValue={defaultTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3 h-auto gap-1 p-1 bg-muted/40">
              <TabsTrigger
                value="soundcloud"
                className="flex-col sm:flex-row gap-1 h-auto py-1.5 data-[state=active]:text-primary"
              >
                <Music2 className="h-4 w-4" />
                <span className="text-xs font-medium">SoundCloud</span>
                {soundcloudCount > 0 && (
                  <Badge variant="secondary" className="text-[10px] font-semibold px-1 py-0 h-4 min-w-4 justify-center bg-primary/15 text-primary border-0">
                    {soundcloudCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="weekend"
                className="flex-col sm:flex-row gap-1 h-auto py-1.5 data-[state=active]:text-amber-400"
              >
                <FileAudio className="h-4 w-4" />
                <span className="text-xs font-medium whitespace-nowrap">Tracks (MP3)</span>
                {weekendCount > 0 && (
                  <Badge variant="secondary" className="text-[10px] font-semibold px-1 py-0 h-4 min-w-4 justify-center bg-amber-500/15 text-amber-400 border-0">
                    {weekendCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="stems"
                className="flex-col sm:flex-row gap-1 h-auto py-1.5 data-[state=active]:text-violet-400"
              >
                <Layers className="h-4 w-4" />
                <span className="text-xs font-medium">Stems</span>
                {stemCount > 0 && (
                  <Badge variant="secondary" className="text-[10px] font-semibold px-1 py-0 h-4 min-w-4 justify-center bg-violet-500/15 text-violet-400 border-0">
                    {stemCount}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            {/* ── SoundCloud Versions ── */}
            <TabsContent value="soundcloud" className="space-y-1 mt-3">
              {soundcloudCount === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <Music2 className="h-9 w-9 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No SoundCloud versions for this setlist yet.</p>
                </div>
              ) : (
                playlist.tracks.map((track, index) => {
                const isCurrentTrack = currentTrack?.id === track.id;
                const isTrackPlaying = isCurrentTrack && isPlaying;

                return (
                  <div
                    key={track.id}
                    onClick={() => handlePlayTrack(track, index)}
                    className={cn(
                      "group flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-all border",
                      "hover:bg-primary/10 active:bg-primary/15",
                      isCurrentTrack
                        ? "bg-primary/10 border-primary/40"
                        : "bg-primary/5 border-primary/20 hover:border-primary/40"
                    )}
                  >
                    {/* Play button circle */}
                    <div className="w-8 h-8 flex items-center justify-center flex-shrink-0 rounded-full bg-primary/20 group-hover:bg-primary/30">
                      {isTrackPlaying ? (
                        <div className="flex items-center gap-[2px]">
                          <span className="w-[2px] h-3 bg-primary rounded-full animate-[pulse_1s_ease-in-out_infinite]" />
                          <span className="w-[2px] h-4 bg-primary rounded-full animate-[pulse_1s_ease-in-out_infinite_0.15s]" />
                          <span className="w-[2px] h-2 bg-primary rounded-full animate-[pulse_1s_ease-in-out_infinite_0.3s]" />
                        </div>
                      ) : (
                        <Play className="h-4 w-4 text-primary fill-primary" />
                      )}
                    </div>

                    {/* Track Info */}
                    <div className="flex-1 min-w-0">
                      <p
                        className={cn(
                          "font-semibold truncate text-sm",
                          isCurrentTrack ? "text-primary" : "text-foreground"
                        )}
                      >
                        {track.title}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {track.artist || "Unknown Artist"}
                      </p>
                    </div>

                  </div>
                );
                })
              )}
            </TabsContent>

            {/* ── Weekend Tracks ── */}
            <TabsContent value="weekend" className="space-y-1 mt-3">
              {weekendCount === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <FileAudio className="h-9 w-9 mx-auto mb-3 opacity-30" />
                  <p className="text-sm mb-4">No weekend tracks uploaded yet.</p>
                  {canUploadReferenceTrack && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => setUploadOpen(true)}
                    >
                      <Plus className="h-4 w-4" />
                      Add Weekend Track
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  {referenceTracks.map((track, idx) => {
                    const trackIndex = playlist.tracks.length + idx;
                    const isCurrentTrack = currentTrack?.id === track.id;
                    const isTrackPlaying = isCurrentTrack && isPlaying;
                    const hasMarkers = track.markers && track.markers.length > 0;
                    const isExpanded = expandedMarkers[track.id];

                    return (
                      <div key={track.id} className="space-y-1">
                        <div
                          className={cn(
                            "group flex items-center gap-3 p-2.5 rounded-lg transition-all border",
                            "hover:bg-amber-500/10 active:bg-amber-500/15",
                            isCurrentTrack
                              ? "bg-amber-500/10 border-amber-500/40"
                              : "bg-amber-500/5 border-amber-500/20 hover:border-amber-500/40"
                          )}
                        >
                          {/* Expand/Collapse for markers */}
                          {hasMarkers ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 p-0 shrink-0"
                              onClick={() => toggleMarkerExpand(track.id)}
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-amber-400" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-amber-400" />
                              )}
                            </Button>
                          ) : (
                            <div className="w-6" />
                          )}

                          {/* Play button area */}
                          <div 
                            className="w-8 h-8 flex items-center justify-center flex-shrink-0 cursor-pointer rounded-full bg-amber-500/20 group-hover:bg-amber-500/30"
                            onClick={() => handlePlayTrack(track, trackIndex)}
                          >
                            {isTrackPlaying ? (
                              <div className="flex items-center gap-[2px]">
                                <span className="w-[2px] h-3 bg-amber-400 rounded-full animate-[pulse_1s_ease-in-out_infinite]" />
                                <span className="w-[2px] h-4 bg-amber-400 rounded-full animate-[pulse_1s_ease-in-out_infinite_0.15s]" />
                                <span className="w-[2px] h-2 bg-amber-400 rounded-full animate-[pulse_1s_ease-in-out_infinite_0.3s]" />
                              </div>
                            ) : (
                              <Play className="h-4 w-4 text-amber-400 fill-amber-400" />
                            )}
                          </div>

                          {/* Track Info */}
                          <div 
                            className="flex-1 min-w-0 cursor-pointer"
                            onClick={() => handlePlayTrack(track, trackIndex)}
                          >
                            <p
                              className={cn(
                                "font-semibold truncate text-sm",
                                isCurrentTrack ? "text-amber-400" : "text-foreground"
                              )}
                            >
                              {track.title}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              Full set audio
                              {hasMarkers && (
                                <span 
                                  className="ml-1.5 text-amber-400 cursor-pointer hover:underline font-medium"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleMarkerExpand(track.id);
                                  }}
                                >
                                  • {track.markers.length} song{track.markers.length !== 1 ? 's' : ''} marked {isExpanded ? '▲' : '▼'}
                                </span>
                              )}
                            </p>
                          </div>

                          {/* Admin AI Sync Charts */}
                          {isAdmin && hasMarkers && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 gap-1 px-2 text-xs shrink-0"
                              title="Reorder existing charts and generate drafts only for songs without chart text"
                              disabled={
                                autoReorderCharts.isPending &&
                                autoReorderCharts.variables?.referenceTrackId === track.referenceTrackId
                              }
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAutoReorderCharts(track);
                              }}
                            >
                              <Sparkles className="h-3.5 w-3.5" />
                              AI Sync Charts
                            </Button>
                          )}

                          {/* Overflow actions */}
                          {canManageTracks ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-44">
                                <DropdownMenuItem
                                  className="gap-2"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDownload(track);
                                  }}
                                >
                                  <Download className="h-4 w-4" />
                                  Download
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="gap-2"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openEditMarkers(track);
                                  }}
                                >
                                  <Pencil className="h-4 w-4" />
                                  Edit markers
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="gap-2 text-destructive focus:text-destructive"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setTrackToDelete(track);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDownload(track);
                              }}
                            >
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>

                        {/* Markers List (collapsible) */}
                        {hasMarkers && isExpanded && (
                          <div className="ml-6 pl-6 border-l-2 border-amber-500/20 space-y-1 pb-2 mt-1">
                            {track.markers.map((marker) => (
                              <Button
                                key={marker.id}
                                variant="ghost"
                                size="sm"
                                onClick={() => handleMarkerClick(track, marker.timestampSeconds)}
                                className={cn(
                                  "w-full justify-start gap-2 h-9 px-3 text-left",
                                  "hover:bg-amber-500/10 active:bg-amber-500/20",
                                  currentTrack?.id === track.id && "border-l-2 border-amber-400 -ml-[2px] pl-[10px]"
                                )}
                              >
                                <Badge variant="secondary" className="text-xs tabular-nums px-1.5 py-0 h-5 shrink-0">
                                  {formatTimestamp(marker.timestampSeconds)}
                                </Badge>
                                <span className="truncate text-sm font-medium">{marker.title}</span>
                              </Button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {canUploadReferenceTrack && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full mt-2 gap-2"
                      onClick={() => setUploadOpen(true)}
                    >
                      <Plus className="h-4 w-4" />
                      Add Weekend Track
                    </Button>
                  )}
                </>
              )}
            </TabsContent>

            {/* ── Stems ── */}
            <TabsContent value="stems" className="mt-3">
              <StemDAW
                playlistId={playlist.id}
                canManage={canManageTracks}
                serviceDate={formattedDate}
                setlistSongs={setlistSongs}
                embedded
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <ReferenceTrackUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        playlistId={playlist.id}
        serviceDate={formattedDate}
        setlistSongs={setlistSongs}
      />

      {selectedRefTrack && (
        <EditReferenceTrackMarkersDialog
          open={editMarkersOpen}
          onOpenChange={setEditMarkersOpen}
          referenceTrackId={selectedRefTrack.referenceTrackId}
          referenceTrackTitle={selectedRefTrack.title}
          existingMarkers={selectedRefTrack.markers || []}
          setlistSongs={setlistSongs}
        />
      )}

      <AlertDialog
        open={!!trackToDelete}
        onOpenChange={(open) => !open && setTrackToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Weekend Track</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{trackToDelete?.title}"? This will permanently remove the file.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (trackToDelete) deleteRefTrack.mutate(trackToDelete.referenceTrackId);
                setTrackToDelete(null);
              }}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
