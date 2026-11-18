import { supabase } from "@/integrations/supabase/client";
import { songsForTrackMarkers, type TrackMarkerSong } from "@/lib/trackMarkerSongs";

type SongJoin = { id?: string; title?: string | null } | { id?: string; title?: string | null }[] | null;

function joinedSong(songs: SongJoin): { id?: string; title?: string | null } | null {
  if (!songs) return null;
  return Array.isArray(songs) ? songs[0] || null : songs;
}

export async function loadSongsForTrackMarkers(playlistId: string): Promise<TrackMarkerSong[]> {
  const { data: playlist, error: playlistError } = await supabase
    .from("setlist_playlists")
    .select("draft_set_id, campus_id, ministry_type, service_date")
    .eq("id", playlistId)
    .maybeSingle();
  if (playlistError) throw new Error(playlistError.message);
  if (!playlist) return [];

  const draftResult = playlist.draft_set_id
    ? await supabase
        .from("draft_set_songs")
        .select("sequence_order, song_id, songs(id, title)")
        .eq("draft_set_id", playlist.draft_set_id)
        .order("sequence_order", { ascending: true })
    : { data: [], error: null };
  if (draftResult.error) throw new Error(draftResult.error.message);

  const linkedFlow = playlist.draft_set_id
    ? await supabase
        .from("service_flows")
        .select("id")
        .eq("draft_set_id", playlist.draft_set_id)
        .order("created_at", { ascending: false })
        .limit(1)
    : { data: [], error: null };
  if (linkedFlow.error) throw new Error(linkedFlow.error.message);

  const scopedFlow =
    linkedFlow.data && linkedFlow.data.length > 0
      ? linkedFlow
      : await supabase
          .from("service_flows")
          .select("id")
          .eq("campus_id", playlist.campus_id)
          .eq("ministry_type", playlist.ministry_type)
          .eq("service_date", playlist.service_date)
          .order("created_at", { ascending: false })
          .limit(1);
  if (scopedFlow.error) throw new Error(scopedFlow.error.message);

  const draftSongs: TrackMarkerSong[] = (draftResult.data || []).flatMap((row) => {
    const song = joinedSong(row.songs as SongJoin);
    const title = song?.title?.trim() || "";
    const id = song?.id || row.song_id;
    if (!title || !id) return [];
    return [{ id, title, sequenceOrder: row.sequence_order }];
  });

  const flowId = scopedFlow.data?.[0]?.id;
  let flowSongs: TrackMarkerSong[] = [];
  if (flowId) {
    const { data: items, error: itemsError } = await supabase
      .from("service_flow_items")
      .select("id, title, sequence_order, song_id")
      .eq("service_flow_id", flowId)
      .eq("item_type", "song")
      .order("sequence_order", { ascending: true });
    if (itemsError) throw new Error(itemsError.message);
    flowSongs = (items || []).flatMap((item) => {
      const title = item.title?.trim() || "";
      if (!title) return [];
      return [{ id: item.song_id || item.id, title, sequenceOrder: item.sequence_order }];
    });
  }

  return songsForTrackMarkers(flowSongs, draftSongs);
}
