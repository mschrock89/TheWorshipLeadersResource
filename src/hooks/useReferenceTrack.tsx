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

/**
 * Hook to auto-reorder chord charts by analyzing guide calls in a reference track.
 * Uses marker timestamps to isolate each song segment.
 */
export function useAutoReorderChartsFromReferenceTrack() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: {
      referenceTrackId: string;
      draftSetId?: string;
      dryRun?: boolean;
    }) => {
      const { data, error } = await supabase.functions.invoke(
        "auto-reorder-charts-from-reference",
        {
          body: {
            reference_track_id: params.referenceTrackId,
            draft_set_id: params.draftSetId,
            dry_run: params.dryRun ?? false,
          },
        },
      );

      if (error) throw error;
      return data as {
        success: boolean;
        updated_songs: number;
        songs_considered: number;
        skipped: Array<{ song: string; reason: string }>;
      };
    },
    onSuccess: (data) => {
      toast({
        title: "Chart reordering complete",
        description: `Updated ${data.updated_songs} of ${data.songs_considered} song chart${data.songs_considered === 1 ? "" : "s"}.`,
      });
      queryClient.invalidateQueries({ queryKey: ["song-versions"] });
      queryClient.invalidateQueries({ queryKey: ["setlist-playlists"] });
    },
    onError: (error: any) => {
      toast({
        title: "Auto reorder failed",
        description: error.message || "Could not analyze the reference track.",
        variant: "destructive",
      });
    },
  });
}
