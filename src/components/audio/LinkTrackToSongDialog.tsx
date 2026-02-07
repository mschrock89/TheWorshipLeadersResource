import { useState } from "react";
import { Search, Link2, X, Music } from "lucide-react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface SongWithAudio {
  id: string;
  title: string;
  author: string | null;
  audio_url: string | null;
}

interface LinkTrackToSongDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trackId: string;
  trackTitle: string;
  currentSongId: string | null;
  albumId: string;
}

export function LinkTrackToSongDialog({
  open,
  onOpenChange,
  trackId,
  trackTitle,
  currentSongId,
  albumId,
}: LinkTrackToSongDialogProps) {
  const [search, setSearch] = useState("");
  const [selectedSongId, setSelectedSongId] = useState<string | null>(currentSongId);
  const queryClient = useQueryClient();
  
  // Fetch songs with audio_url field
  const { data: songs, isLoading: loadingSongs } = useQuery({
    queryKey: ["songs-with-audio"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("songs")
        .select("id, title, author, audio_url")
        .order("title");
      if (error) throw error;
      return data as SongWithAudio[];
    },
  });

  const linkMutation = useMutation({
    mutationFn: async (songId: string | null) => {
      const { error } = await supabase
        .from("album_tracks")
        .update({ song_id: songId })
        .eq("id", trackId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(selectedSongId ? "Track linked to song" : "Track unlinked");
      queryClient.invalidateQueries({ queryKey: ["albums"] });
      onOpenChange(false);
    },
    onError: (error) => {
      console.error("Error linking track:", error);
      toast.error("Failed to link track");
    },
  });

  const filteredSongs = (songs || []).filter((song) =>
    song.title.toLowerCase().includes(search.toLowerCase()) ||
    (song.author && song.author.toLowerCase().includes(search.toLowerCase()))
  );

  const handleConfirm = () => {
    linkMutation.mutate(selectedSongId);
  };

  const handleUnlink = () => {
    setSelectedSongId(null);
    linkMutation.mutate(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Link to Song Library
          </DialogTitle>
          <DialogDescription>
            Link "{trackTitle}" to a song from your Song Library
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
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
          <ScrollArea className="h-64 rounded-md border">
            {loadingSongs ? (
              <div className="p-4 text-center text-muted-foreground">
                Loading songs...
              </div>
            ) : filteredSongs.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground">
                {search ? "No songs found" : "No songs in library"}
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {filteredSongs.map((song) => (
                  <button
                    key={song.id}
                    onClick={() => setSelectedSongId(song.id)}
                    className={cn(
                      "w-full flex items-center gap-3 p-2 rounded-lg text-left transition-colors",
                      selectedSongId === song.id
                        ? "bg-primary/10 ring-1 ring-primary"
                        : "hover:bg-muted"
                    )}
                  >
                    <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                      <Music className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{song.title}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {song.author || "Unknown Artist"}
                      </p>
                    </div>
                    {song.audio_url && (
                      <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        Has Audio
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Actions */}
          <div className="flex items-center justify-between gap-2">
            {currentSongId && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleUnlink}
                disabled={linkMutation.isPending}
                className="text-destructive hover:text-destructive"
              >
                <X className="h-4 w-4 mr-1" />
                Unlink
              </Button>
            )}
            <div className="flex-1" />
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={linkMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={!selectedSongId || selectedSongId === currentSongId || linkMutation.isPending}
            >
              {linkMutation.isPending ? "Linking..." : "Link Song"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
