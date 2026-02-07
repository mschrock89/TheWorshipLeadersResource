import { useState, useMemo } from "react";
import { Search, Music, Plus, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAddTrackToAlbum } from "@/hooks/useAlbums";
import { Badge } from "@/components/ui/badge";

interface AddTrackToAlbumDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  albumId: string;
  existingTrackIds: string[];
  nextTrackNumber: number;
}

export function AddTrackToAlbumDialog({
  open,
  onOpenChange,
  albumId,
  existingTrackIds,
  nextTrackNumber,
}: AddTrackToAlbumDialogProps) {
  const [search, setSearch] = useState("");
  const [addingId, setAddingId] = useState<string | null>(null);
  
  // Custom query to get songs with audio_url
  const { data: songs, isLoading } = useQuery({
    queryKey: ["songs-with-audio"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("songs")
        .select("id, title, author, audio_url")
        .order("title");
      if (error) throw error;
      return data;
    },
  });
  const addTrack = useAddTrackToAlbum();

  const filteredSongs = useMemo(() => {
    if (!songs) return [];
    
    return songs
      .filter(song => !existingTrackIds.includes(song.id))
      .filter(song => 
        song.title.toLowerCase().includes(search.toLowerCase()) ||
        song.author?.toLowerCase().includes(search.toLowerCase())
      );
  }, [songs, search, existingTrackIds]);

  const handleAddTrack = async (songId: string) => {
    setAddingId(songId);
    try {
      await addTrack.mutateAsync({
        albumId,
        songId,
        trackNumber: nextTrackNumber + filteredSongs.findIndex(s => s.id === songId),
      });
    } finally {
      setAddingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-w-[calc(100vw-2rem)] mx-4">
        <DialogHeader>
          <DialogTitle>Add Track to Album</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 overflow-hidden">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search songs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Song List */}
          <ScrollArea className="h-[300px] -mx-1 px-1">
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-14 bg-muted rounded animate-pulse" />
                ))}
              </div>
            ) : filteredSongs.length === 0 ? (
              <div className="py-8 text-center">
                <Music className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">
                  {search ? "No songs match your search" : "No songs available to add"}
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {filteredSongs.map((song) => (
                  <div
                    key={song.id}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground truncate">{song.title}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {song.author || "Unknown Artist"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      {song.audio_url ? (
                        <Badge variant="secondary" className="text-xs">
                          MP3
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          No Audio
                        </Badge>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleAddTrack(song.id)}
                        disabled={addingId === song.id}
                      >
                        {addingId === song.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Plus className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
