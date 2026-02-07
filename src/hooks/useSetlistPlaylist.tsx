import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Track } from "./useAudioPlayer";

interface SetlistSong {
  id: string;
  sequence_order: number;
  song_key: string | null;
  songs: {
    id: string;
    title: string;
    author: string | null;
    audio_url: string | null;
  };
}

interface AlbumTrack {
  id: string;
  song_id: string;
  audio_url: string | null;
  title: string | null;
  author: string | null;
  albums: {
    artwork_url: string | null;
  } | null;
}

// Normalize title for matching (lowercase, remove special chars, trim)
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\(feat\.?[^)]*\)/gi, '') // Remove (feat. ...) 
    .replace(/\([^)]*\)/g, '') // Remove other parentheticals
    .replace(/[^\w\s]/g, '') // Remove special chars
    .replace(/\s+/g, ' ') // Normalize spaces
    .trim();
}

export function useSetlistPlaylist(draftSetId: string | null) {
  return useQuery({
    queryKey: ["setlist-playlist", draftSetId],
    queryFn: async () => {
      if (!draftSetId) return [];

      // Get all songs in the setlist
      const { data: setlistSongs, error: setlistError } = await supabase
        .from("draft_set_songs")
        .select(`
          id,
          sequence_order,
          song_key,
          songs (
            id,
            title,
            author,
            audio_url
          )
        `)
        .eq("draft_set_id", draftSetId)
        .order("sequence_order", { ascending: true });

      if (setlistError) throw setlistError;

      const songs = setlistSongs as unknown as SetlistSong[];
      const songIds = songs.map(s => s.songs.id);
      const songTitles = songs.map(s => s.songs.title);

      // Get ALL album tracks with audio (we'll match by song_id OR title)
      const { data: allAlbumTracks, error: tracksError } = await supabase
        .from("album_tracks")
        .select(`
          id,
          song_id,
          audio_url,
          title,
          author,
          albums (
            artwork_url
          )
        `)
        .not("audio_url", "is", null);

      if (tracksError) throw tracksError;

      // Create maps for matching: by song_id and by normalized title
      const trackBySongId = new Map<string, AlbumTrack>();
      const trackByTitle = new Map<string, AlbumTrack>();
      
      (allAlbumTracks || []).forEach(track => {
        const albumTrack = track as AlbumTrack;
        
        // Map by song_id if linked
        if (albumTrack.song_id && !trackBySongId.has(albumTrack.song_id)) {
          trackBySongId.set(albumTrack.song_id, albumTrack);
        }
        
        // Map by normalized title for fallback matching
        if (albumTrack.title) {
          const normalizedTrackTitle = normalizeTitle(albumTrack.title);
          if (!trackByTitle.has(normalizedTrackTitle)) {
            trackByTitle.set(normalizedTrackTitle, albumTrack);
          }
        }
      });

      // Transform to Track format, using album track audio when available
      const tracks: Track[] = songs
        .map(item => {
          // First try to match by song_id
          let albumTrack = trackBySongId.get(item.songs.id);
          
          // If no song_id match, try matching by normalized title
          if (!albumTrack) {
            const normalizedSongTitle = normalizeTitle(item.songs.title);
            albumTrack = trackByTitle.get(normalizedSongTitle);
          }
          
          const audioUrl = albumTrack?.audio_url || item.songs.audio_url;
          
          if (!audioUrl) return null;

          return {
            id: item.songs.id,
            title: item.songs.title,
            artist: item.songs.author,
            audioUrl,
            songKey: item.song_key,
            artworkUrl: albumTrack?.albums?.artwork_url || undefined,
          };
        })
        .filter((track): track is NonNullable<typeof track> => track !== null);

      return tracks;
    },
    enabled: !!draftSetId,
  });
}

export function useSetlistSongsWithAudioStatus(draftSetId: string | null) {
  return useQuery({
    queryKey: ["setlist-songs-audio-status", draftSetId],
    queryFn: async () => {
      if (!draftSetId) return [];

      const { data, error } = await supabase
        .from("draft_set_songs")
        .select(`
          id,
          sequence_order,
          song_key,
          songs (
            id,
            title,
            author,
            audio_url
          )
        `)
        .eq("draft_set_id", draftSetId)
        .order("sequence_order", { ascending: true });

      if (error) throw error;

      return (data as unknown as SetlistSong[]).map(item => ({
        id: item.id,
        songId: item.songs.id,
        title: item.songs.title,
        artist: item.songs.author,
        audioUrl: item.songs.audio_url,
        songKey: item.song_key,
        sequenceOrder: item.sequence_order,
        hasAudio: !!item.songs.audio_url,
      }));
    },
    enabled: !!draftSetId,
  });
}
