import { supabase } from "@/integrations/supabase/client";
import {
  matchSectionsToFlowSongs,
  pickTracksMp3,
  type DetectedSectionGroup,
  type FlowSongForSections,
  type MatchedSectionCues,
} from "@/lib/songSectionMarkers";

type MarkerRow = {
  title: string;
  timestamp_seconds: number;
  sequence_order: number;
};

type TrackRow = {
  id: string;
  sequence_order: number | null;
  reference_track_markers: MarkerRow[] | MarkerRow | null;
};

export async function dropSongSectionMarkers(input: {
  campusId: string;
  ministryType: string;
  serviceDate: string;
  draftSetId: string | null;
  songs: FlowSongForSections[];
}): Promise<MatchedSectionCues> {
  if (input.songs.length === 0) {
    throw new Error("There are no songs on this service flow yet.");
  }

  const playlistId = await findPlaylistId(input);
  if (!playlistId) {
    throw new Error("This service doesn't have a Tracks MP3 yet.");
  }

  const { data, error } = await supabase
    .from("setlist_playlist_reference_tracks")
    .select(`
      id,
      sequence_order,
      reference_track_markers (
        title,
        timestamp_seconds,
        sequence_order
      )
    `)
    .eq("playlist_id", playlistId)
    .order("sequence_order", { ascending: true });
  if (error) throw new Error(error.message);

  const tracks = ((data || []) as TrackRow[]).map((track) => {
    const markers = Array.isArray(track.reference_track_markers)
      ? track.reference_track_markers
      : track.reference_track_markers
        ? [track.reference_track_markers]
        : [];
    return {
      id: track.id,
      sequenceOrder: track.sequence_order ?? 0,
      markerCount: markers.length,
    };
  });
  const track = pickTracksMp3(tracks);
  if (!track) {
    throw new Error("Add song markers on the Tracks MP3 first.");
  }

  const { data: detected, error: detectError } = await supabase.functions.invoke("detect-song-section-markers", {
    body: { reference_track_id: track.id },
  });
  if (detectError) {
    throw new Error(await parseFunctionError(detectError, "Could not analyze the Tracks MP3."));
  }

  const songs = Array.isArray(detected?.songs) ? detected.songs : null;
  if (!songs) {
    throw new Error("Could not read section markers from the Tracks MP3.");
  }

  const groups: DetectedSectionGroup[] = songs.map((song: { title?: unknown; sections?: unknown }) => ({
    title: String(song?.title || ""),
    sections: Array.isArray(song?.sections)
      ? song.sections.flatMap((section: { offset_seconds?: unknown; label?: unknown }) => {
          const offsetSeconds = Number(section?.offset_seconds);
          const label = String(section?.label || "").trim();
          if (!label || !Number.isFinite(offsetSeconds)) return [];
          return [{ offsetSeconds, label }];
        })
      : [],
  }));

  return matchSectionsToFlowSongs(input.songs, groups);
}

async function findPlaylistId(input: {
  campusId: string;
  ministryType: string;
  serviceDate: string;
  draftSetId: string | null;
}): Promise<string | null> {
  if (input.draftSetId) {
    const byDraftSet = await supabase
      .from("setlist_playlists")
      .select("id")
      .eq("draft_set_id", input.draftSetId)
      .maybeSingle();
    if (byDraftSet.error) throw new Error(byDraftSet.error.message);
    if (byDraftSet.data?.id) return byDraftSet.data.id;
  }

  const byScope = await supabase
    .from("setlist_playlists")
    .select("id")
    .eq("campus_id", input.campusId)
    .eq("ministry_type", input.ministryType)
    .eq("service_date", input.serviceDate)
    .maybeSingle();
  if (byScope.error) throw new Error(byScope.error.message);
  if (byScope.data?.id) return byScope.data.id;

  const weekendFallback = await supabase
    .from("setlist_playlists")
    .select("id")
    .eq("campus_id", input.campusId)
    .eq("service_date", input.serviceDate)
    .in("ministry_type", ["weekend", "weekend_team"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (weekendFallback.error) throw new Error(weekendFallback.error.message);
  return weekendFallback.data?.id ?? null;
}

async function parseFunctionError(error: unknown, fallback: string): Promise<string> {
  let message = fallback;
  const errWithContext = error as { message?: string; context?: Response };
  if (errWithContext.message) message = errWithContext.message;
  if (errWithContext.context) {
    try {
      const payload = await errWithContext.context.json();
      if (payload?.error && typeof payload.error === "string") message = payload.error;
    } catch {
      // Keep the message we already have.
    }
  }
  return explainAnalysisError(message);
}

function explainAnalysisError(message: string): string {
  const text = message.toLowerCase();
  if (text.includes("song_markers_required")) return "Add song markers on the Tracks MP3 first.";
  if (text.includes("reference_track_not_found")) return "That Tracks MP3 is no longer available.";
  if (text.includes("too_large")) return "That Tracks MP3 is too large to analyze. Upload a smaller file.";
  if (text.includes("openai_api_key")) return "Section listening isn't configured yet.";
  if (text.includes("unable to fetch")) return "Couldn't download the Tracks MP3.";
  if (text.includes("unauthorized")) return "Sign in again to analyze the Tracks MP3.";
  if (text.includes("non-2xx") || text.includes("failed to send") || text.includes("edge function")) {
    return "Couldn't analyze the Tracks MP3.";
  }
  return message;
}
