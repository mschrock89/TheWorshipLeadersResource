import {
  buildCorsHeaders,
  getSupabaseClients,
  requireAuthenticatedUser,
} from "../_shared/teaching-utils.ts";
import { transcribeAudioFromUrl } from "../_shared/reference-track-transcription.ts";
import {
  detectSongSectionGroups,
  SECTION_CUE_PROMPT,
  type SongMarkerSpan,
} from "../_shared/songSectionCues.ts";

type MarkerRow = {
  title?: string | null;
  timestamp_seconds?: number | null;
  sequence_order?: number | null;
};

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req.headers.get("origin"));

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405, corsHeaders);
    }

    const authHeader = req.headers.get("Authorization");
    const { userClient } = getSupabaseClients(authHeader);
    await requireAuthenticatedUser(userClient);

    const body = (await req.json()) as { reference_track_id?: string };
    const referenceTrackId = body?.reference_track_id?.trim();
    if (!referenceTrackId) {
      return json({ error: "reference_track_id_required" }, 400, corsHeaders);
    }

    const { data, error } = await userClient
      .from("setlist_playlist_reference_tracks")
      .select(`
        id,
        audio_url,
        duration_seconds,
        reference_track_markers (
          title,
          timestamp_seconds,
          sequence_order
        )
      `)
      .eq("id", referenceTrackId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data?.audio_url) {
      return json({ error: "reference_track_not_found" }, 404, corsHeaders);
    }

    const markerRows = Array.isArray(data.reference_track_markers)
      ? (data.reference_track_markers as MarkerRow[])
      : [];
    const markers: SongMarkerSpan[] = markerRows.flatMap((marker) => {
      const timestampSeconds = Number(marker.timestamp_seconds);
      const title = String(marker.title || "").trim();
      if (!title || !Number.isFinite(timestampSeconds)) return [];
      return [{
        title,
        timestampSeconds,
        sequenceOrder: Number(marker.sequence_order) || 0,
      }];
    });

    if (markers.length === 0) {
      return json({ error: "song_markers_required" }, 400, corsHeaders);
    }

    const durationSeconds = Number(data.duration_seconds);
    const transcription = await transcribeAudioFromUrl(data.audio_url, {
      durationSeconds: Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : undefined,
      prompt: SECTION_CUE_PROMPT,
    });
    const songs = detectSongSectionGroups(
      transcription,
      markers,
      Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : null,
    );

    return json({
      songs: songs.map((song) => ({
        title: song.title,
        sections: song.sections.map((section) => ({
          offset_seconds: section.offsetSeconds,
          label: section.label,
        })),
      })),
      sections_found: songs.reduce((total, song) => total + song.sections.length, 0),
    }, 200, corsHeaders);
  } catch (error) {
    const message = error instanceof Error ? error.message : "section_marker_detection_failed";
    const status = message === "unauthorized" ? 401 : 500;
    return json({ error: message }, status, corsHeaders);
  }
});

function json(payload: unknown, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
