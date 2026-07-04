import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SongKey {
  id: string;
  key_name: string;
  display_order: number;
}

// Fetch all available keys
export function useSongKeys() {
  return useQuery({
    queryKey: ["song-keys"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("song_keys")
        .select("*")
        .order("display_order", { ascending: true });

      if (error) throw error;
      return data as SongKey[];
    },
  });
}

// Add a new key
export function useAddSongKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (keyName: string) => {
      // Get max display_order
      const { data: maxData } = await supabase
        .from("song_keys")
        .select("display_order")
        .order("display_order", { ascending: false })
        .limit(1)
        .single();

      const nextOrder = (maxData?.display_order || 100) + 1;

      const { data, error } = await supabase
        .from("song_keys")
        .insert({ key_name: keyName, display_order: nextOrder })
        .select()
        .single();

      if (error) throw error;
      return data as SongKey;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["song-keys"] });
    },
  });
}
