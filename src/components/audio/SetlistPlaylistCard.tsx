import { useState } from "react";
import { format } from "date-fns";
import { Play, Pause, Music2, Calendar, MapPin, Headphones, Plus, Trash2, FileAudio, ChevronDown, ChevronRight, Clock, Pencil, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAudioPlayer, Track } from "@/hooks/useAudioPlayer";
import { SetlistPlaylistWithTracks, ReferenceTrack } from "@/hooks/useSetlistPlaylists";
import { MINISTRY_TYPES } from "@/lib/constants";
import { parseLocalDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { ReferenceTrackUploadDialog } from "./ReferenceTrackUploadDialog";
import { EditReferenceTrackMarkersDialog } from "./EditReferenceTrackMarkersDialog";
import { SetlistSong } from "./ReferenceTrackMarkerInput";
import { useDeleteReferenceTrack } from "@/hooks/useReferenceTrack";
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

interface SetlistPlaylistCardProps {
  playlist: SetlistPlaylistWithTracks;
}

export function SetlistPlaylistCard({ playlist }: SetlistPlaylistCardProps) {
  const { setPlaylist, currentTrack, isPlaying, togglePlay, playlist: currentPlaylist, seekTo, play } = useAudioPlayer();
  const { isAdmin } = useAuth();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editMarkersOpen, setEditMarkersOpen] = useState(false);
  const [selectedRefTrack, setSelectedRefTrack] = useState<ReferenceTrack | null>(null);
  const [expandedMarkers, setExpandedMarkers] = useState<Record<string, boolean>>({});
  const deleteRefTrack = useDeleteReferenceTrack();

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

  // Combine setlist tracks and reference tracks for playback
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
                {customServiceName ? `${customServiceName} Playlist` : "Practice Playlist"}
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

            <Button
              onClick={handlePlayAll}
              disabled={!hasAudioTracks}
              size="sm"
              className="rounded-full gap-2 shadow-md shadow-primary/20"
            >
              {isThisPlaylistPlaying && isPlaying ? (
                <>
                  <Pause className="h-4 w-4" />
                  Pause
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 fill-current" />
                  Play All
                </>
              )}
            </Button>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          {!hasAudioTracks ? (
            <div className="text-center py-6 text-muted-foreground">
              <Music2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No audio files available for this setlist</p>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground mb-3">
                {playlist.songsWithAudio} of {playlist.totalSongs} songs have audio
                {referenceTracks.length > 0 && (
                  <> • {referenceTracks.length} reference track{referenceTracks.length !== 1 ? 's' : ''}</>
                )}
              </p>
              
              {/* Setlist Songs */}
              {playlist.tracks.map((track, index) => {
                const isCurrentTrack = currentTrack?.id === track.id;
                const isTrackPlaying = isCurrentTrack && isPlaying;

                return (
                  <div
                    key={track.id}
                    onClick={() => handlePlayTrack(track, index)}
                    className={cn(
                      "group flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-all",
                      "hover:bg-muted/50 active:bg-muted/70",
                      isCurrentTrack && "bg-primary/5"
                    )}
                  >
                    {/* Track Number / Playing Indicator */}
                    <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
                      {isTrackPlaying ? (
                        <div className="flex items-center gap-[2px]">
                          <span className="w-[2px] h-3 bg-primary rounded-full animate-[pulse_1s_ease-in-out_infinite]" />
                          <span className="w-[2px] h-4 bg-primary rounded-full animate-[pulse_1s_ease-in-out_infinite_0.15s]" />
                          <span className="w-[2px] h-2 bg-primary rounded-full animate-[pulse_1s_ease-in-out_infinite_0.3s]" />
                        </div>
                      ) : isCurrentTrack ? (
                        <Pause className="h-4 w-4 text-primary" />
                      ) : (
                        <>
                          <span className="text-xs text-muted-foreground group-hover:hidden tabular-nums">
                            {index + 1}
                          </span>
                          <Play className="h-4 w-4 text-foreground hidden group-hover:block" />
                        </>
                      )}
                    </div>

                    {/* Track Info */}
                    <div className="flex-1 min-w-0">
                      <p
                        className={cn(
                          "font-medium truncate text-sm",
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
              })}

              {/* Reference Tracks Section */}
              {referenceTracks.length > 0 && (
                <div className="pt-4 mt-4 border-t-2 border-primary/30">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex items-center justify-center h-6 w-6 rounded-full bg-primary/15">
                      <FileAudio className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <p className="text-sm font-semibold text-primary">
                      Reference Tracks
                    </p>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-primary/15 text-primary border-0">
                      {referenceTracks.length}
                    </Badge>
                  </div>
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
                            "hover:bg-primary/10 active:bg-primary/15",
                            isCurrentTrack 
                              ? "bg-primary/10 border-primary/40" 
                              : "bg-primary/5 border-primary/20 hover:border-primary/40"
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
                                <ChevronDown className="h-4 w-4 text-primary" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-primary" />
                              )}
                            </Button>
                          ) : (
                            <div className="w-6" />
                          )}

                          {/* Play button area */}
                          <div 
                            className="w-8 h-8 flex items-center justify-center flex-shrink-0 cursor-pointer rounded-full bg-primary/20 group-hover:bg-primary/30"
                            onClick={() => handlePlayTrack(track, trackIndex)}
                          >
                            {isTrackPlaying ? (
                              <div className="flex items-center gap-[2px]">
                                <span className="w-[2px] h-3 bg-primary rounded-full animate-[pulse_1s_ease-in-out_infinite]" />
                                <span className="w-[2px] h-4 bg-primary rounded-full animate-[pulse_1s_ease-in-out_infinite_0.15s]" />
                                <span className="w-[2px] h-2 bg-primary rounded-full animate-[pulse_1s_ease-in-out_infinite_0.3s]" />
                              </div>
                            ) : isCurrentTrack ? (
                              <Pause className="h-4 w-4 text-primary" />
                            ) : (
                              <Play className="h-4 w-4 text-primary fill-primary" />
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
                                isCurrentTrack ? "text-primary" : "text-foreground"
                              )}
                            >
                              {track.title}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              Full set audio
                              {hasMarkers && (
                                <span 
                                  className="ml-1.5 text-primary cursor-pointer hover:underline font-medium"
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

                          {/* Download Button - available to all users */}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 opacity-100 md:opacity-0 md:group-hover:opacity-100 text-muted-foreground hover:text-foreground"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownload(track);
                            }}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </Button>

                          {/* Admin Edit Markers Button */}
                          {isAdmin && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 opacity-100 md:opacity-0 md:group-hover:opacity-100 text-muted-foreground hover:text-foreground"
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditMarkers(track);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}

                          {/* Admin Delete Button */}
                          {isAdmin && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 opacity-100 md:opacity-0 md:group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Reference Track</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete "{track.title}"? This will permanently remove the file.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteRefTrack.mutate(track.referenceTrackId)}
                                    className="bg-destructive hover:bg-destructive/90"
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>

                        {/* Markers List (collapsible) */}
                        {hasMarkers && isExpanded && (
                          <div className="ml-6 pl-6 border-l-2 border-primary/20 space-y-1 pb-2 mt-1">
                            {track.markers.map((marker) => (
                              <Button
                                key={marker.id}
                                variant="ghost"
                                size="sm"
                                onClick={() => handleMarkerClick(track, marker.timestampSeconds)}
                                className={cn(
                                  "w-full justify-start gap-2 h-9 px-3 text-left",
                                  "hover:bg-primary/10 active:bg-primary/20",
                                  currentTrack?.id === track.id && "border-l-2 border-primary -ml-[2px] pl-[10px]"
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
                </div>
              )}

              {/* Admin Add Reference Track Button */}
              {isAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-3 gap-2"
                  onClick={() => setUploadOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                  Add Reference Track
                </Button>
              )}
            </div>
          )}
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
    </>
  );
}
