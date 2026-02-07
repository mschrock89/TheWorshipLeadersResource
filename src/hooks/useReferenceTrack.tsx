import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

/**
 * Hook to delete a reference track and its storage file
 */
export function useDeleteReferenceTrack() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (trackId: string) => {
      // First get the track to find the audio URL
      const { data: track, error: fetchError } = await supabase
        .from("setlist_playlist_reference_tracks")
        .select("audio_url")
        .eq("id", trackId)
        .single();

      if (fetchError) throw fetchError;

      // Delete from storage if we have the URL
      if (track?.audio_url) {
        try {
          const url = new URL(track.audio_url);
          const pathParts = url.pathname.split("/");
          const fileIndex = pathParts.indexOf("song-audio");
          if (fileIndex !== -1) {
            const filePath = pathParts.slice(fileIndex + 1).join("/");
            await supabase.storage.from("song-audio").remove([filePath]);
          }
        } catch (e) {
          console.warn("Could not delete storage file:", e);
        }
      }

      // Delete the database record
      const { error: deleteError } = await supabase
        .from("setlist_playlist_reference_tracks")
        .delete()
        .eq("id", trackId);

      if (deleteError) throw deleteError;
    },
    onSuccess: () => {
      toast({
        title: "Reference track deleted",
        description: "The track has been removed from the playlist",
      });
      queryClient.invalidateQueries({ queryKey: ["setlist-playlists"] });
    },
    onError: (error: any) => {
      toast({
        title: "Delete failed",
        description: error.message || "Could not delete the reference track",
        variant: "destructive",
      });
    },
  });
}
