import { useState } from "react";
import { GitMerge, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

interface SongOption {
  id: string;
  title: string;
  author: string | null;
}

interface MergeSongDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceSong: { id: string; title: string };
  onMerge: (targetSongId: string) => void;
  isMerging?: boolean;
}

export function MergeSongDialog({
  open,
  onOpenChange,
  sourceSong,
  onMerge,
  isMerging = false,
}: MergeSongDialogProps) {
  const [search, setSearch] = useState("");
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);

  const { data: songs, isLoading } = useQuery({
    queryKey: ["songs-for-merge"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("songs")
        .select("id, title, author")
        .order("title");
      if (error) throw error;
      return (data || []) as SongOption[];
    },
    enabled: open,
  });

  const filteredSongs = (songs || []).filter(
    (song) =>
      song.id !== sourceSong.id &&
      (song.title.toLowerCase().includes(search.toLowerCase()) ||
        (song.author && song.author.toLowerCase().includes(search.toLowerCase())))
  );

  const handleMerge = () => {
    if (selectedSongId) {
      onMerge(selectedSongId);
      setSelectedSongId(null);
      setSearch("");
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setSelectedSongId(null);
      setSearch("");
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="h-5 w-5" />
            Merge Song
          </DialogTitle>
          <DialogDescription>
            Merge "{sourceSong.title}" into another song. All plans, play counts, and setlists will be
            combined. The duplicate song will be removed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm font-medium">Merge into:</p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search for song..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <ScrollArea className="h-[240px] rounded-md border">
            {isLoading ? (
              <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                Loading songs...
              </div>
            ) : filteredSongs.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                No songs found
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {filteredSongs.map((song) => (
                  <button
                    key={song.id}
                    type="button"
                    onClick={() => setSelectedSongId(song.id)}
                    className={cn(
                      "w-full flex flex-col items-start gap-0.5 px-3 py-2 rounded-md text-left transition-colors",
                      "hover:bg-muted/80",
                      selectedSongId === song.id && "bg-primary/10 ring-1 ring-primary/30"
                    )}
                  >
                    <span className="font-medium">{song.title}</span>
                    <span className="text-xs text-muted-foreground">{song.author || "Unknown"}</span>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isMerging}>
            Cancel
          </Button>
          <Button
            onClick={handleMerge}
            disabled={!selectedSongId || isMerging}
            className="gap-2"
          >
            {isMerging ? (
              <>
                <span className="animate-spin">⟳</span>
                Merging...
              </>
            ) : (
              <>
                <GitMerge className="h-4 w-4" />
                Merge
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
