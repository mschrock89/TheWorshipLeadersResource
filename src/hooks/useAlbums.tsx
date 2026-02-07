import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface Album {
  id: string;
  title: string;
  artwork_url: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface AlbumTrack {
  id: string;
  album_id: string;
  song_id: string | null;
  track_number: number;
  created_at: string;
  // Standalone track fields
  title: string | null;
  author: string | null;
  audio_url: string | null;
  // Linked song (optional)
  songs: {
    id: string;
    title: string;
    author: string | null;
    audio_url: string | null;
  } | null;
}

export interface AlbumWithTracks extends Album {
  album_tracks: AlbumTrack[];
}

export function useAlbums() {
  return useQuery({
    queryKey: ["albums"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("albums")
        .select("*")
        .order("display_order");

      if (error) throw error;
      return data as Album[];
    },
  });
}

export function useAlbumWithTracks(albumId: string | null) {
  return useQuery({
    queryKey: ["album", albumId],
    queryFn: async () => {
      if (!albumId) return null;

      const { data, error } = await supabase
        .from("albums")
        .select(`
          *,
          album_tracks (
            id,
            album_id,
            song_id,
            track_number,
            created_at,
            title,
            author,
            audio_url,
            songs (
              id,
              title,
              author,
              audio_url
            )
          )
        `)
        .eq("id", albumId)
        .order("track_number", { referencedTable: "album_tracks" })
        .maybeSingle();

      if (error) throw error;
      return data as AlbumWithTracks | null;
    },
    enabled: !!albumId,
  });
}

export function useCreateAlbum() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ title, artworkUrl }: { title: string; artworkUrl?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from("albums")
        .insert({
          title,
          artwork_url: artworkUrl || null,
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["albums"] });
      toast({ title: "Album created successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create album",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useUpdateAlbum() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, title, artworkUrl }: { id: string; title: string; artworkUrl?: string }) => {
      const { data, error } = await supabase
        .from("albums")
        .update({
          title,
          artwork_url: artworkUrl,
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["albums"] });
      queryClient.invalidateQueries({ queryKey: ["album", variables.id] });
      toast({ title: "Album updated successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update album",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useDeleteAlbum() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (albumId: string) => {
      const { error } = await supabase
        .from("albums")
        .delete()
        .eq("id", albumId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["albums"] });
      toast({ title: "Album deleted" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete album",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useAddTrackToAlbum() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ albumId, songId, trackNumber }: { albumId: string; songId: string; trackNumber: number }) => {
      const { data, error } = await supabase
        .from("album_tracks")
        .insert({
          album_id: albumId,
          song_id: songId,
          track_number: trackNumber,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["album", variables.albumId] });
      toast({ title: "Track added to album" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to add track",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useRemoveTrackFromAlbum() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ trackId, albumId }: { trackId: string; albumId: string }) => {
      const { error } = await supabase
        .from("album_tracks")
        .delete()
        .eq("id", trackId);

      if (error) throw error;
      return albumId;
    },
    onSuccess: (albumId) => {
      queryClient.invalidateQueries({ queryKey: ["album", albumId] });
      toast({ title: "Track removed from album" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to remove track",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useReorderAlbumTracks() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ albumId, trackIds }: { albumId: string; trackIds: string[] }) => {
      // Two-phase update to avoid unique constraint violations
      // Phase 1: Set all track numbers to negative temporary values
      const tempUpdates = trackIds.map((trackId, index) => 
        supabase
          .from("album_tracks")
          .update({ track_number: -(index + 1000) })
          .eq("id", trackId)
      );

      const tempResults = await Promise.all(tempUpdates);
      const tempErrors = tempResults.filter(r => r.error);
      
      if (tempErrors.length > 0) {
        throw new Error(tempErrors[0].error?.message || "Failed to reorder tracks");
      }

      // Phase 2: Set final track numbers
      const finalUpdates = trackIds.map((trackId, index) => 
        supabase
          .from("album_tracks")
          .update({ track_number: index + 1 })
          .eq("id", trackId)
      );

      const finalResults = await Promise.all(finalUpdates);
      const finalErrors = finalResults.filter(r => r.error);
      
      if (finalErrors.length > 0) {
        throw new Error(finalErrors[0].error?.message || "Failed to reorder tracks");
      }
      
      return albumId;
    },
    onSuccess: (albumId) => {
      queryClient.invalidateQueries({ queryKey: ["album", albumId] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to reorder tracks",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
