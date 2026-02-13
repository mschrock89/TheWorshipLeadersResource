import { useState, useRef } from "react";
import { ArrowLeft, Play, Pause, Music, Plus, Trash2, MoreVertical, Edit, Upload, FolderUp, Shuffle, GripVertical, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AlbumWithTracks, useDeleteAlbum, useRemoveTrackFromAlbum, useReorderAlbumTracks, useUpdateAlbumTrackTitle } from "@/hooks/useAlbums";
import { useAudioPlayer, Track } from "@/hooks/useAudioPlayer";
import { AddTrackToAlbumDialog } from "./AddTrackToAlbumDialog";
import { EditAlbumDialog } from "./EditAlbumDialog";
import { AudioUploadDialog } from "./AudioUploadDialog";
import { BulkAudioUploadDialog } from "./BulkAudioUploadDialog";
import { LinkTrackToSongDialog } from "./LinkTrackToSongDialog";
import { cn } from "@/lib/utils";

interface AlbumDetailViewProps {
  album: AlbumWithTracks | null;
  isLoading: boolean;
  onBack: () => void;
  isAdmin: boolean;
}

export function AlbumDetailView({ album, isLoading, onBack, isAdmin }: AlbumDetailViewProps) {
  const [addTrackOpen, setAddTrackOpen] = useState(false);
  const [editAlbumOpen, setEditAlbumOpen] = useState(false);
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [audioUploadSong, setAudioUploadSong] = useState<{ id: string; title: string; audioUrl?: string | null } | null>(null);
  const [linkTrackDialog, setLinkTrackDialog] = useState<{ trackId: string; title: string; songId: string | null } | null>(null);
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  
  const { setPlaylist, play, pause, currentTrack, isPlaying, togglePlay } = useAudioPlayer();
  const deleteAlbum = useDeleteAlbum();
  const removeTrack = useRemoveTrackFromAlbum();
  const reorderTracks = useReorderAlbumTracks();
  const updateTrackTitle = useUpdateAlbumTrackTitle();
  
  // Drag and drop state
  const [draggedTrackId, setDraggedTrackId] = useState<string | null>(null);
  const [dragOverTrackId, setDragOverTrackId] = useState<string | null>(null);
  const dragNodeRef = useRef<HTMLDivElement | null>(null);

  if (isLoading) {
    return (
      <div className="animate-in fade-in duration-300">
        <div className="relative">
          <Skeleton className="w-full aspect-square max-w-[280px] mx-auto rounded-xl" />
          <div className="mt-6 text-center space-y-2">
            <Skeleton className="h-7 w-48 mx-auto" />
            <Skeleton className="h-4 w-24 mx-auto" />
          </div>
          <div className="flex justify-center gap-3 mt-6">
            <Skeleton className="h-12 w-28 rounded-full" />
            <Skeleton className="h-12 w-28 rounded-full" />
          </div>
        </div>
        <div className="mt-8 space-y-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!album) {
    return (
      <div className="py-16 text-center">
        <div className="w-20 h-20 mx-auto rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
          <Music className="h-10 w-10 text-muted-foreground" />
        </div>
        <p className="text-muted-foreground">Album not found</p>
      </div>
    );
  }

  // Support both linked songs and standalone tracks
  const getTrackInfo = (track: (typeof album.album_tracks)[0]) => {
    if (track.songs) {
      return {
        id: track.songs.id,
        title: track.songs.title,
        author: track.songs.author || "Unknown Artist",
        audioUrl: track.songs.audio_url,
      };
    }
    // Standalone track (no linked song)
    return {
      id: track.id,
      title: track.title || "Untitled",
      author: track.author || "Unknown Artist",
      audioUrl: track.audio_url,
    };
  };

  const tracksWithAudio = album.album_tracks.filter(t => {
    const info = getTrackInfo(t);
    return !!info.audioUrl;
  });
  
  const handlePlayAll = () => {
    const tracks: Track[] = tracksWithAudio.map(t => {
      const info = getTrackInfo(t);
      return {
        id: info.id,
        title: info.title,
        artist: info.author,
        audioUrl: info.audioUrl!,
        artworkUrl: album.artwork_url,
      };
    });
    
    if (tracks.length > 0) {
      setPlaylist(tracks, 0);
    }
  };

  const handleShufflePlay = () => {
    const tracks: Track[] = tracksWithAudio.map(t => {
      const info = getTrackInfo(t);
      return {
        id: info.id,
        title: info.title,
        artist: info.author,
        audioUrl: info.audioUrl!,
        artworkUrl: album.artwork_url,
      };
    });
    
    if (tracks.length > 0) {
      // Shuffle the tracks
      const shuffled = [...tracks].sort(() => Math.random() - 0.5);
      setPlaylist(shuffled, 0);
    }
  };

  const handlePlayTrack = (track: (typeof album.album_tracks)[0]) => {
    const info = getTrackInfo(track);
    if (!info.audioUrl) return;
    
    if (currentTrack?.id === info.id) {
      togglePlay();
    } else {
      // Build the full playlist and find the starting index
      const tracks: Track[] = tracksWithAudio.map(t => {
        const trackInfo = getTrackInfo(t);
        return {
          id: trackInfo.id,
          title: trackInfo.title,
          artist: trackInfo.author,
          audioUrl: trackInfo.audioUrl!,
          artworkUrl: album.artwork_url,
        };
      });
      
      const startIndex = tracks.findIndex(t => t.id === info.id);
      if (tracks.length > 0) {
        setPlaylist(tracks, startIndex >= 0 ? startIndex : 0);
      }
    }
  };

  const handleDeleteAlbum = () => {
    // Security: Only admins can delete
    if (!isAdmin) return;
    if (confirm("Are you sure you want to delete this album?")) {
      deleteAlbum.mutate(album.id, {
        onSuccess: onBack,
      });
    }
  };

  const handleRemoveTrack = (trackId: string) => {
    // Security: Only admins can remove tracks
    if (!isAdmin) return;
    if (confirm("Remove this track from the album?")) {
      removeTrack.mutate({ trackId, albumId: album.id });
    }
  };

  const startTitleEdit = (track: (typeof album.album_tracks)[0]) => {
    const info = getTrackInfo(track);
    setEditingTrackId(track.id);
    setEditingTitle(info.title);
  };

  const cancelTitleEdit = () => {
    setEditingTrackId(null);
    setEditingTitle("");
  };

  const saveTitleEdit = (track: (typeof album.album_tracks)[0]) => {
    const nextTitle = editingTitle.trim();
    if (!nextTitle) return;

    updateTrackTitle.mutate(
      {
        albumId: album.id,
        trackId: track.id,
        songId: track.song_id,
        title: nextTitle,
      },
      {
        onSuccess: () => {
          setEditingTrackId(null);
          setEditingTitle("");
        },
      }
    );
  };

  // Drag handlers
  const handleDragStart = (e: React.DragEvent, trackId: string) => {
    setDraggedTrackId(trackId);
    e.dataTransfer.effectAllowed = "move";
    // Add a slight delay to show the drag effect
    if (e.currentTarget instanceof HTMLElement) {
      dragNodeRef.current = e.currentTarget as HTMLDivElement;
      setTimeout(() => {
        if (dragNodeRef.current) {
          dragNodeRef.current.style.opacity = "0.5";
        }
      }, 0);
    }
  };

  const handleDragEnd = () => {
    if (dragNodeRef.current) {
      dragNodeRef.current.style.opacity = "1";
    }
    setDraggedTrackId(null);
    setDragOverTrackId(null);
    dragNodeRef.current = null;
  };

  const handleDragOver = (e: React.DragEvent, trackId: string) => {
    e.preventDefault();
    if (draggedTrackId && draggedTrackId !== trackId) {
      setDragOverTrackId(trackId);
    }
  };

  const handleDragLeave = () => {
    setDragOverTrackId(null);
  };

  const handleDrop = (e: React.DragEvent, targetTrackId: string) => {
    e.preventDefault();
    // Security: Only admins can reorder
    if (!isAdmin || !draggedTrackId || draggedTrackId === targetTrackId || !album) return;

    const currentTracks = [...album.album_tracks];
    const draggedIndex = currentTracks.findIndex(t => t.id === draggedTrackId);
    const targetIndex = currentTracks.findIndex(t => t.id === targetTrackId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    // Reorder the array
    const [draggedItem] = currentTracks.splice(draggedIndex, 1);
    currentTracks.splice(targetIndex, 0, draggedItem);

    // Get the new order of track IDs
    const newTrackIds = currentTracks.map(t => t.id);
    
    reorderTracks.mutate({ albumId: album.id, trackIds: newTrackIds });

    setDraggedTrackId(null);
    setDragOverTrackId(null);
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Back Button - Floating */}
      <button 
        onClick={onBack}
        className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6 group"
      >
        <ArrowLeft className="h-5 w-5 group-hover:-translate-x-1 transition-transform" />
        <span className="text-sm font-medium">Audio Library</span>
      </button>

      {/* Hero Section */}
      <div className="text-center mb-8">
        {/* Album Artwork with Shadow */}
        <div className="relative inline-block mb-6">
          <div 
            className="absolute inset-0 blur-3xl opacity-40 scale-90"
            style={{
              backgroundImage: album.artwork_url ? `url(${album.artwork_url})` : undefined,
              backgroundColor: album.artwork_url ? undefined : 'hsl(var(--primary))',
            }}
          />
          <div className="relative w-56 h-56 sm:w-64 sm:h-64 mx-auto rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10">
            {album.artwork_url ? (
              <img
                src={album.artwork_url}
                alt={album.title}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full bg-gradient-to-br from-primary/30 to-accent/30 flex items-center justify-center">
                <Music className="h-20 w-20 text-primary/50" />
              </div>
            )}
          </div>
        </div>
        
        {/* Album Info */}
        <div className="flex items-center justify-center gap-2 mb-1">
          <h1 className="text-2xl font-bold text-foreground">{album.title}</h1>
          {isAdmin && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center">
                <DropdownMenuItem onClick={() => setEditAlbumOpen(true)}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Album
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setBulkUploadOpen(true)}>
                  <FolderUp className="h-4 w-4 mr-2" />
                  Bulk Upload
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleDeleteAlbum} className="text-destructive focus:text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Album
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          {album.album_tracks.length} track{album.album_tracks.length !== 1 ? "s" : ""}
        </p>
        
        {/* Action Buttons */}
        <div className="flex items-center justify-center gap-3">
          <Button
            onClick={handlePlayAll}
            disabled={tracksWithAudio.length === 0}
            size="lg"
            className="rounded-full gap-2 px-8 shadow-lg shadow-primary/20"
          >
            <Play className="h-5 w-5 fill-current" />
            Play
          </Button>
          
          <Button
            onClick={handleShufflePlay}
            disabled={tracksWithAudio.length === 0}
            variant="outline"
            size="lg"
            className="rounded-full gap-2 px-6"
          >
            <Shuffle className="h-4 w-4" />
            Shuffle
          </Button>
          
          {isAdmin && (
            <Button
              variant="outline"
              size="lg"
              onClick={() => setAddTrackOpen(true)}
              className="rounded-full gap-2 px-6"
            >
              <Plus className="h-4 w-4" />
              Add
            </Button>
          )}
        </div>
      </div>

      {/* Track List */}
      <div className="bg-card/50 rounded-2xl border border-border/50 overflow-hidden">
        {album.album_tracks.length === 0 ? (
          <div className="py-12 text-center">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
              <Music className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground mb-4">No tracks yet</p>
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAddTrackOpen(true)}
                className="gap-2 rounded-full"
              >
                <Plus className="h-4 w-4" />
                Add First Track
              </Button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {album.album_tracks.map((track, index) => {
              const trackInfo = getTrackInfo(track);
              const isCurrentTrackPlaying = currentTrack?.id === trackInfo.id;
              const hasAudio = !!trackInfo.audioUrl;
              const isDraggedOver = dragOverTrackId === track.id;
              const isDragging = draggedTrackId === track.id;
              
              return (
                <div 
                  key={track.id}
                  draggable={isAdmin}
                  onDragStart={(e) => isAdmin && handleDragStart(e, track.id)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => isAdmin && handleDragOver(e, track.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => isAdmin && handleDrop(e, track.id)}
                  className={cn(
                    "group flex items-center gap-2 px-4 py-3 transition-all",
                    hasAudio ? "cursor-pointer hover:bg-muted/50 active:bg-muted/70" : "opacity-50",
                    isCurrentTrackPlaying && "bg-primary/5",
                    isDraggedOver && "border-t-2 border-primary bg-primary/10",
                    isDragging && "opacity-50",
                    isAdmin && "cursor-grab active:cursor-grabbing"
                  )}
                  onClick={() => hasAudio && handlePlayTrack(track)}
                >
                  {/* Drag Handle - Admin only */}
                  {isAdmin && (
                    <div 
                      className="flex-shrink-0 touch-none text-muted-foreground/50 hover:text-muted-foreground"
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <GripVertical className="h-4 w-4" />
                    </div>
                  )}
                  
                  {/* Track Number / Playing Indicator */}
                  <div className="w-8 flex items-center justify-center flex-shrink-0">
                    {isCurrentTrackPlaying && isPlaying ? (
                      <div className="flex items-center gap-[3px]">
                        <span className="w-[3px] h-3 bg-primary rounded-full animate-[pulse_1s_ease-in-out_infinite]" />
                        <span className="w-[3px] h-4 bg-primary rounded-full animate-[pulse_1s_ease-in-out_infinite_0.15s]" />
                        <span className="w-[3px] h-2 bg-primary rounded-full animate-[pulse_1s_ease-in-out_infinite_0.3s]" />
                      </div>
                    ) : isCurrentTrackPlaying ? (
                      <Pause className="h-4 w-4 text-primary" />
                    ) : (
                      <span className={cn(
                        "text-sm tabular-nums",
                        hasAudio ? "text-muted-foreground group-hover:hidden" : "text-muted-foreground/50"
                      )}>
                        {track.track_number}
                      </span>
                    )}
                    {hasAudio && !isCurrentTrackPlaying && (
                      <Play className="h-4 w-4 text-foreground hidden group-hover:block" />
                    )}
                  </div>
                  
                  {/* Track Info */}
                  <div className="flex-1 min-w-0">
                    {editingTrackId === track.id ? (
                      <div
                        className="flex flex-col gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Input
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              saveTitleEdit(track);
                            }
                            if (e.key === "Escape") {
                              e.preventDefault();
                              cancelTitleEdit();
                            }
                          }}
                          className="h-8"
                          autoFocus
                        />
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            className="h-7 px-2"
                            onClick={() => saveTitleEdit(track)}
                            disabled={!editingTitle.trim() || updateTrackTitle.isPending}
                          >
                            Save
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2"
                            onClick={cancelTitleEdit}
                            disabled={updateTrackTitle.isPending}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <p className={cn(
                            "font-medium truncate text-[15px]",
                            isCurrentTrackPlaying ? "text-primary" : "text-foreground"
                          )}>
                            {trackInfo.title}
                          </p>
                          {/* Linked song indicator */}
                          {track.song_id && (
                            <Badge variant="outline" className="text-[10px] h-4 px-1.5 shrink-0 gap-0.5">
                              <Link2 className="h-2.5 w-2.5" />
                              Linked
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground truncate">
                          {trackInfo.author}
                        </p>
                      </>
                    )}
                  </div>
                  
                  {/* Admin Actions */}
                  {isAdmin && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenuItem
                          onClick={() => setLinkTrackDialog({
                            trackId: track.id,
                            title: trackInfo.title,
                            songId: track.song_id,
                          })}
                        >
                          <Link2 className="h-4 w-4 mr-2" />
                          {track.song_id ? "Change Linked Song" : "Link to Song"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => startTitleEdit(track)}
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          Edit Title
                        </DropdownMenuItem>
                        {!hasAudio && track.songs && (
                          <DropdownMenuItem
                            onClick={() => setAudioUploadSong({
                              id: track.songs!.id,
                              title: track.songs!.title,
                              audioUrl: track.songs!.audio_url,
                            })}
                          >
                            <Upload className="h-4 w-4 mr-2" />
                            Upload Audio
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => handleRemoveTrack(track.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Remove Track
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Dialogs */}
      {isAdmin && (
        <>
          <AddTrackToAlbumDialog
            open={addTrackOpen}
            onOpenChange={setAddTrackOpen}
            albumId={album.id}
            existingTrackIds={album.album_tracks.map(t => t.song_id)}
            nextTrackNumber={album.album_tracks.length + 1}
          />
          
          <EditAlbumDialog
            open={editAlbumOpen}
            onOpenChange={setEditAlbumOpen}
            album={album}
          />
          
          <BulkAudioUploadDialog
            open={bulkUploadOpen}
            onOpenChange={setBulkUploadOpen}
            albumId={album.id}
            currentTrackCount={album.album_tracks.length}
          />
          
          {audioUploadSong && (
            <AudioUploadDialog
              open={!!audioUploadSong}
              onOpenChange={(open) => !open && setAudioUploadSong(null)}
              songId={audioUploadSong.id}
              songTitle={audioUploadSong.title}
              existingAudioUrl={audioUploadSong.audioUrl}
            />
          )}
          
          {linkTrackDialog && (
            <LinkTrackToSongDialog
              open={!!linkTrackDialog}
              onOpenChange={(open) => !open && setLinkTrackDialog(null)}
              trackId={linkTrackDialog.trackId}
              trackTitle={linkTrackDialog.title}
              currentSongId={linkTrackDialog.songId}
              albumId={album.id}
            />
          )}
        </>
      )}
    </div>
  );
}
