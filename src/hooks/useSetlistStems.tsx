import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

export type StemType =
  | "drums"
  | "perc"
  | "bass"
  | "sub_bass"
  | "guitars"
  | "piano"
  | "keys"
  | "aux"
  | "vocals"
  | "click";

export const STEM_TYPES: StemType[] = [
  "drums",
  "perc",
  "bass",
  "sub_bass",
  "guitars",
  "piano",
  "keys",
  "aux",
  "vocals",
  "click",
];

export const STEM_LABELS: Record<StemType, string> = {
  drums:   "Drums",
  perc:    "Perc",
  bass:    "Bass",
  sub_bass:"Sub Bass",
  guitars: "Guitars",
  piano:   "Piano",
  keys:    "Keys",
  aux:     "Aux",
  vocals:  "Vox",
  click:   "Click / Guide",
};

export const STEM_COLORS: Record<StemType, string> = {
  drums:   "#ef4444",
  perc:    "#f97316",
  bass:    "#eab308",
  sub_bass:"#f59e0b",
  guitars: "#22c55e",
  piano:   "#14b8a6",
  keys:    "#3b82f6",
  aux:     "#6366f1",
  vocals:  "#a855f7",
  click:   "#ec4899",
};

/** Hardware output channel routing label shown on each track strip. */
export const STEM_ROUTING: Record<StemType, string> = {
  drums:   "1/2",
  perc:    "3/4",
  bass:    "5",
  sub_bass:"6",
  guitars: "7/8",
  piano:   "9/10",
  keys:    "11/12",
  aux:     "13/14",
  vocals:  "15",
  click:   "16",
};

/** Whether a stem routes to a stereo pair (true) or a single mono channel (false). */
export const STEM_IS_STEREO: Record<StemType, boolean> = {
  drums:   true,
  perc:    true,
  bass:    false,
  sub_bass:false,
  guitars: true,
  piano:   true,
  keys:    true,
  aux:     true,
  vocals:  false,
  click:   false,
};

export interface StemSongMarker {
  id: string;
  songId: string | null;
  songTitle: string;
  timestampSeconds: number;
}

export interface StemSession {
  id: string;
  playlist_id: string;
  title: string;
  bpm: number | null;
  song_markers: StemSongMarker[];
  created_at: string;
  created_by: string | null;
  stems: Stem[];
}

export interface Stem {
  id: string;
  session_id: string;
  stem_type: StemType;
  audio_url: string;
  file_name: string;
  duration_seconds: number | null;
  volume: number;
  is_muted: boolean;
  sequence_order: number;
  created_at: string;
  created_by: string | null;
}

// ─── Query ────────────────────────────────────────────────────────────────────

export function useSetlistStemSession(playlistId: string | null | undefined) {
  return useQuery({
    queryKey: ["stem-session", playlistId],
    enabled: !!playlistId,
    queryFn: async () => {
      if (!playlistId) return null;

      const { data: session, error: sessionError } = await supabase
        .from("setlist_stem_sessions")
        .select("*")
        .eq("playlist_id", playlistId)
        .maybeSingle();

      if (sessionError) throw sessionError;
      if (!session) return null;

      const { data: stems, error: stemsError } = await supabase
        .from("setlist_stems")
        .select("*")
        .eq("session_id", session.id)
        .order("sequence_order", { ascending: true });

      if (stemsError) throw stemsError;

      return {
        ...session,
        stems: (stems || []) as Stem[],
        song_markers: (Array.isArray(session.song_markers) ? session.song_markers : []) as StemSongMarker[],
      } as StemSession;
    },
  });
}

// ─── Create session ───────────────────────────────────────────────────────────

export function useCreateStemSession() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      playlistId,
      title = "Stem Mix",
      bpm,
    }: {
      playlistId: string;
      title?: string;
      bpm?: number;
    }) => {
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("setlist_stem_sessions")
        .insert({ playlist_id: playlistId, title, bpm: bpm ?? null, created_by: user.id })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, { playlistId }) => {
      queryClient.invalidateQueries({ queryKey: ["stem-session", playlistId] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create stem session", description: error.message, variant: "destructive" });
    },
  });
}

// ─── Upsert stem (upload or replace a single stem slot) ──────────────────────

export function useUpsertStem() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      sessionId,
      playlistId,
      stemType,
      audioUrl,
      fileName,
      durationSeconds,
      sequenceOrder,
    }: {
      sessionId: string;
      playlistId: string;
      stemType: StemType;
      audioUrl: string;
      fileName: string;
      durationSeconds?: number | null;
      sequenceOrder?: number;
    }) => {
      if (!user) throw new Error("Not authenticated");

      // Check if a stem of this type already exists (for replacing)
      const { data: existing } = await supabase
        .from("setlist_stems")
        .select("id, audio_url")
        .eq("session_id", sessionId)
        .eq("stem_type", stemType)
        .maybeSingle();

      if (existing) {
        // Delete old file from storage
        try {
          const url = new URL(existing.audio_url);
          const pathParts = url.pathname.split("/");
          const bucketIndex = pathParts.findIndex((p) => p === "song-audio");
          if (bucketIndex !== -1) {
            const storagePath = pathParts.slice(bucketIndex + 1).join("/");
            await supabase.storage.from("song-audio").remove([storagePath]);
          }
        } catch {
          // Non-fatal — continue with upsert
        }

        const { error } = await supabase
          .from("setlist_stems")
          .update({
            audio_url: audioUrl,
            file_name: fileName,
            duration_seconds: durationSeconds ?? null,
          })
          .eq("id", existing.id);

        if (error) throw error;
        return existing.id;
      } else {
        const { data, error } = await supabase
          .from("setlist_stems")
          .insert({
            session_id: sessionId,
            stem_type: stemType,
            audio_url: audioUrl,
            file_name: fileName,
            duration_seconds: durationSeconds ?? null,
            sequence_order: sequenceOrder ?? STEM_TYPES.indexOf(stemType),
            created_by: user.id,
          })
          .select("id")
          .single();

        if (error) throw error;
        return data.id;
      }
    },
    onSuccess: (_, { playlistId }) => {
      queryClient.invalidateQueries({ queryKey: ["stem-session", playlistId] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save stem", description: error.message, variant: "destructive" });
    },
  });
}

// ─── Update stem volume / mute ────────────────────────────────────────────────

export function useUpdateStemMix() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      stemId,
      volume,
      isMuted,
    }: {
      stemId: string;
      playlistId: string;
      volume?: number;
      isMuted?: boolean;
    }) => {
      const updates: Record<string, unknown> = {};
      if (volume !== undefined) updates.volume = volume;
      if (isMuted !== undefined) updates.is_muted = isMuted;

      const { error } = await supabase
        .from("setlist_stems")
        .update(updates)
        .eq("id", stemId);

      if (error) throw error;
    },
    onSuccess: (_, { playlistId }) => {
      queryClient.invalidateQueries({ queryKey: ["stem-session", playlistId] });
    },
  });
}

// ─── Delete stem ──────────────────────────────────────────────────────────────

export function useDeleteStem() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ stemId, audioUrl, playlistId }: { stemId: string; audioUrl: string; playlistId: string }) => {
      // Delete from storage
      try {
        const url = new URL(audioUrl);
        const pathParts = url.pathname.split("/");
        const bucketIndex = pathParts.findIndex((p) => p === "song-audio");
        if (bucketIndex !== -1) {
          const storagePath = pathParts.slice(bucketIndex + 1).join("/");
          await supabase.storage.from("song-audio").remove([storagePath]);
        }
      } catch {
        // Non-fatal
      }

      const { error } = await supabase.from("setlist_stems").delete().eq("id", stemId);
      if (error) throw error;
    },
    onSuccess: (_, { playlistId }) => {
      queryClient.invalidateQueries({ queryKey: ["stem-session", playlistId] });
      toast({ title: "Stem removed" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to remove stem", description: error.message, variant: "destructive" });
    },
  });
}

// ─── Update song markers ──────────────────────────────────────────────────────

export function useUpdateStemSongMarkers() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      sessionId,
      playlistId,
      markers,
    }: {
      sessionId: string;
      playlistId: string;
      markers: StemSongMarker[];
    }) => {
      const { error } = await supabase
        .from("setlist_stem_sessions")
        .update({ song_markers: markers as unknown as import("@/integrations/supabase/types").Json })
        .eq("id", sessionId);

      if (error) throw error;
    },
    onSuccess: (_, { playlistId }) => {
      queryClient.invalidateQueries({ queryKey: ["stem-session", playlistId] });
      toast({ title: "Song markers saved" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save markers", description: error.message, variant: "destructive" });
    },
  });
}

// ─── Delete entire session ────────────────────────────────────────────────────

export function useDeleteStemSession() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ sessionId, playlistId }: { sessionId: string; playlistId: string }) => {
      // Fetch all stem URLs first for storage cleanup
      const { data: stems } = await supabase
        .from("setlist_stems")
        .select("audio_url")
        .eq("session_id", sessionId);

      // Delete all files from storage
      if (stems && stems.length > 0) {
        const paths = stems
          .map((s) => {
            try {
              const url = new URL(s.audio_url);
              const parts = url.pathname.split("/");
              const idx = parts.findIndex((p) => p === "song-audio");
              return idx !== -1 ? parts.slice(idx + 1).join("/") : null;
            } catch {
              return null;
            }
          })
          .filter(Boolean) as string[];

        if (paths.length > 0) {
          await supabase.storage.from("song-audio").remove(paths);
        }
      }

      const { error } = await supabase
        .from("setlist_stem_sessions")
        .delete()
        .eq("id", sessionId);

      if (error) throw error;
    },
    onSuccess: (_, { playlistId }) => {
      queryClient.invalidateQueries({ queryKey: ["stem-session", playlistId] });
      toast({ title: "Stem session deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete stem session", description: error.message, variant: "destructive" });
    },
  });
}
