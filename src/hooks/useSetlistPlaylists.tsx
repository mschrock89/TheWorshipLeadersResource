import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { Track } from "./useAudioPlayer";

// Normalize title for matching (lowercase, remove special chars, trim)
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\(feat\.?[^)]*\)/gi, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

type AlbumTrackForMatching = {
  song_id: string | null;
  title: string | null;
  author: string | null;
  audio_url: string | null;
  albums?: { artwork_url: string | null } | null;
};

interface ReferenceTrackRow {
  id: string;
  playlist_id: string;
  title: string;
  audio_url: string;
  sequence_order: number;
  created_at: string;
  created_by: string | null;
}

interface ReferenceTrackMarkerRow {
  id: string;
  reference_track_id: string;
  title: string;
  timestamp_seconds: number;
  sequence_order: number;
}

interface SetlistPlaylist {
  id: string;
  draft_set_id: string;
  campus_id: string;
  service_date: string;
  ministry_type: string;
  created_at: string;
  // Joined data
  campuses?: { name: string } | null;
  draft_sets?: {
    id: string;
    plan_date: string;
    notes: string | null;
    draft_set_songs: Array<{
      id: string;
      sequence_order: number;
      song_key: string | null;
      songs: {
        id: string;
        title: string;
        author: string | null;
        audio_url: string | null;
      } | null;
      vocalist: {
        id: string;
        full_name: string | null;
      } | null;
    }>;
  } | null;
}

export interface ReferenceTrackMarker {
  id: string;
  title: string;
  timestampSeconds: number;
  sequenceOrder: number;
}

export interface ReferenceTrack extends Track {
  isReferenceTrack: true;
  referenceTrackId: string;
  markers: ReferenceTrackMarker[];
}

export interface SetlistPlaylistWithTracks extends SetlistPlaylist {
  tracks: Track[];
  referenceTracks: ReferenceTrack[];
  songsWithAudio: number;
  totalSongs: number;
}

/**
 * Hook to fetch setlist playlists accessible to the current user.
 * Returns playlists for setlists the user can access.
 * Do not date-filter here, otherwise weekend playlists can disappear mid-weekend
 * (e.g. Saturday playlist hidden on Sunday).
 */
export function useMySetlistPlaylists() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["setlist-playlists", user?.id],
    queryFn: async (): Promise<SetlistPlaylistWithTracks[]> => {
      if (!user) return [];

      // Fetch playlists with joined draft_sets and songs
      const { data, error } = await supabase
        .from("setlist_playlists")
        .select(`
          id,
          draft_set_id,
          campus_id,
          service_date,
          ministry_type,
          created_at,
          campuses(name),
          draft_sets(
            id,
            plan_date,
            notes,
            draft_set_songs(
              id,
              sequence_order,
              song_key,
              songs(id, title, author, audio_url),
              vocalist:profiles!draft_set_songs_vocalist_id_fkey(id, full_name)
            )
          )
        `)
        .order("service_date", { ascending: true });

      if (error) {
        console.error("Error fetching setlist playlists:", error);
        throw error;
      }

      // Fetch reference tracks for all playlists
      const playlistIds = (data || []).map((p) => p.id);
      let referenceTracksMap = new Map<string, ReferenceTrackRow[]>();

      if (playlistIds.length > 0) {
        const { data: refTracks, error: refError } = await supabase
          .from("setlist_playlist_reference_tracks")
          .select("*")
          .in("playlist_id", playlistIds)
          .order("sequence_order", { ascending: true });

        if (refError) {
          console.error("Error fetching reference tracks:", refError);
        } else {
          (refTracks || []).forEach((rt) => {
            const existing = referenceTracksMap.get(rt.playlist_id) || [];
            existing.push(rt as ReferenceTrackRow);
            referenceTracksMap.set(rt.playlist_id, existing);
          });
        }
      }

      // Fetch markers for all reference tracks
      const allRefTrackIds = Array.from(referenceTracksMap.values()).flat().map(rt => rt.id);
      let markersMap = new Map<string, ReferenceTrackMarkerRow[]>();

      if (allRefTrackIds.length > 0) {
        const { data: markers, error: markersError } = await supabase
          .from("reference_track_markers")
          .select("*")
          .in("reference_track_id", allRefTrackIds)
          .order("sequence_order", { ascending: true });

        if (markersError) {
          console.error("Error fetching reference track markers:", markersError);
        } else {
          (markers || []).forEach((m) => {
            const existing = markersMap.get(m.reference_track_id) || [];
            existing.push(m as ReferenceTrackMarkerRow);
            markersMap.set(m.reference_track_id, existing);
          });
        }
      }

      // Build an index of Audio Library tracks we can match by song_id or by title.
      // NOTE: Many Audio Library tracks are not linked to the Song Library (song_id is null),
      // so we need a title-based fallback.
      const { data: audioLibraryTracks, error: audioTracksError } = await supabase
        .from("album_tracks")
        .select(`song_id, title, author, audio_url, albums(artwork_url)`)
        .not("audio_url", "is", null);

      if (audioTracksError) {
        console.error("Error fetching audio library tracks:", audioTracksError);
        throw audioTracksError;
      }

      const trackBySongId = new Map<string, AlbumTrackForMatching>();
      const trackByTitle = new Map<string, AlbumTrackForMatching>();

      (audioLibraryTracks as unknown as AlbumTrackForMatching[] | null)?.forEach((t) => {
        if (t.song_id && !trackBySongId.has(t.song_id)) {
          trackBySongId.set(t.song_id, t);
        }

        if (t.title) {
          const nt = normalizeTitle(t.title);
          if (!trackByTitle.has(nt)) {
            trackByTitle.set(nt, t);
          }
        }
      });

      // Transform data to include tracks
      return (data || []).map((playlist) => {
        const draftSetSongs = playlist.draft_sets?.draft_set_songs || [];
        
        // Sort by sequence order
        const sortedSongs = [...draftSetSongs].sort(
          (a, b) => a.sequence_order - b.sequence_order
        );

        // Build Track objects by looking up audio from the Audio Library first, then fallback to songs.audio_url
        const tracks: Track[] = sortedSongs
          .map((dss) => {
            const song = dss.songs;
            if (!song) return null;

            let matched = trackBySongId.get(song.id);
            if (!matched) {
              matched = trackByTitle.get(normalizeTitle(song.title));
            }

            const audioUrl = matched?.audio_url || song.audio_url;
            if (!audioUrl) return null;

            return {
              id: song.id,
              title: song.title,
              artist: song.author,
              audioUrl,
              songKey: dss.song_key,
              artworkUrl: matched?.albums?.artwork_url || undefined,
            } as Track;
          })
          .filter((t): t is NonNullable<typeof t> => t !== null);

        const songsWithAudio = sortedSongs.filter((dss) => {
          const song = dss.songs;
          if (!song) return false;
          const matched = trackBySongId.get(song.id) || trackByTitle.get(normalizeTitle(song.title));
          return !!(matched?.audio_url || song.audio_url);
        }).length;

        // Build reference tracks for this playlist
        const playlistRefTracks = referenceTracksMap.get(playlist.id) || [];
        const referenceTracks: ReferenceTrack[] = playlistRefTracks.map((rt) => {
          const rtMarkers = markersMap.get(rt.id) || [];
          return {
            id: rt.id,
            referenceTrackId: rt.id,
            title: rt.title,
            artist: "Reference Track",
            audioUrl: rt.audio_url,
            isReferenceTrack: true as const,
            markers: rtMarkers.map((m) => ({
              id: m.id,
              title: m.title,
              timestampSeconds: m.timestamp_seconds,
              sequenceOrder: m.sequence_order,
            })),
          };
        });

        return {
          ...playlist,
          tracks,
          referenceTracks,
          songsWithAudio,
          totalSongs: sortedSongs.length,
        } as SetlistPlaylistWithTracks;
      });
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Hook to create a setlist playlist (used by edge function, but exposed for admin manual creation)
 */
export function useCreateSetlistPlaylist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      draftSetId: string;
      campusId: string;
      serviceDate: string;
      ministryType: string;
    }) => {
      const { data, error } = await supabase
        .from("setlist_playlists")
        .insert({
          draft_set_id: params.draftSetId,
          campus_id: params.campusId,
          service_date: params.serviceDate,
          ministry_type: params.ministryType,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["setlist-playlists"] });
    },
  });
}

/**
 * Hook to delete a setlist playlist
 */
export function useDeleteSetlistPlaylist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (playlistId: string) => {
      const { error } = await supabase
        .from("setlist_playlists")
        .delete()
        .eq("id", playlistId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["setlist-playlists"] });
    },
  });
}
