import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SongKey {
  id: string;
  key_name: string;
  display_order: number;
}

export interface SongKeyHistory {
  songId: string;
  lastKey: string | null;
  mostUsedKey: string | null;
  keyHistory: { key: string; count: number; lastUsed: string }[];
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

// Get key history for a specific song
export function useSongKeyHistory(songId: string | null) {
  return useQuery({
    queryKey: ["song-key-history", songId],
    queryFn: async () => {
      if (!songId) return null;

      const { data, error } = await supabase
        .from("plan_songs")
        .select(`
          song_key,
          created_at,
          service_plans!inner(plan_date)
        `)
        .eq("song_id", songId)
        .not("song_key", "is", null)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Calculate key statistics
      const keyStats: Record<string, { count: number; lastUsed: string }> = {};
      
      for (const item of data || []) {
        const key = item.song_key;
        if (!key) continue;
        
        if (!keyStats[key]) {
          keyStats[key] = { count: 0, lastUsed: item.created_at };
        }
        keyStats[key].count++;
        if (item.created_at > keyStats[key].lastUsed) {
          keyStats[key].lastUsed = item.created_at;
        }
      }

      const keyHistory = Object.entries(keyStats)
        .map(([key, stats]) => ({ key, ...stats }))
        .sort((a, b) => b.count - a.count);

      return {
        songId,
        lastKey: data?.[0]?.song_key || null,
        mostUsedKey: keyHistory[0]?.key || null,
        keyHistory,
      } as SongKeyHistory;
    },
    enabled: !!songId,
  });
}

// Get suggested key for a song based on PCO history
export async function getSuggestedKeyForSong(songId: string): Promise<string | null> {
  const { data } = await supabase
    .from("plan_songs")
    .select("song_key")
    .eq("song_id", songId)
    .not("song_key", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  return data?.song_key || null;
}
