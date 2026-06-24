import {
  buildCorsHeaders,
  getSupabaseClients,
  requireAuthenticatedUser,
} from "../_shared/teaching-utils.ts";
import {
  detectIntroMarkerTimestamps,
  transcribeAudioBlob,
  transcribeReferenceTrack,
} from "../_shared/reference-track-transcription.ts";

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req.headers.get("origin"));

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "method_not_allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    const { userClient } = getSupabaseClients(authHeader);
    await requireAuthenticatedUser(userClient);

    const contentType = req.headers.get("content-type") || "";
    let songCount: number | undefined;
    let segments;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file");
      const songCountRaw = formData.get("song_count");

      if (!(file instanceof File)) {
        return new Response(JSON.stringify({ error: "audio_file_required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      songCount = songCountRaw != null ? Number(songCountRaw) : undefined;
      segments = await transcribeAudioBlob(file, file.type || "audio/mpeg");
    } else {
      const body = await req.json() as { audio_url?: string; song_count?: number };
      if (!body?.audio_url) {
        return new Response(JSON.stringify({ error: "audio_url_or_file_required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      songCount = body.song_count;
      segments = await transcribeReferenceTrack(body.audio_url);
    }

    const maxMarkers = Number.isFinite(songCount) && songCount! > 0 ? Math.floor(songCount!) : undefined;
    const introTimestamps = detectIntroMarkerTimestamps(segments, { maxMarkers });

    return new Response(
      JSON.stringify({
        intro_timestamps: introTimestamps,
        intros_found: introTimestamps.length,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "marker_detection_failed";
    const status = message === "unauthorized" ? 401 : 500;

    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
