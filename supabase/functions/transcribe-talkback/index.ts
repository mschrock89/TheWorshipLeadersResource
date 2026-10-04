import {
  buildCorsHeaders,
  getSupabaseClients,
  requireAuthenticatedUser,
} from "../_shared/teaching-utils.ts";

const MAX_BYTES = 400_000;

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

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return json({ error: "transcription_unavailable" }, 503, corsHeaders);
    }

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return json({ error: "audio_file_required" }, 400, corsHeaders);
    }
    if (file.size <= 0 || file.size > MAX_BYTES) {
      return json({ error: "audio_chunk_out_of_range" }, 400, corsHeaders);
    }

    const whisper = new FormData();
    whisper.append("file", file, file.name || "talkback.webm");
    whisper.append("model", "gpt-4o-mini-transcribe");
    whisper.append("language", "en");
    whisper.append("response_format", "json");
    whisper.append(
      "prompt",
      "Worship production talkback. Short cues from stage positions to front of house and monitors, such as more click, vocals up, ready for the bridge, kill the pad.",
    );

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: whisper,
    });
    const payload = await response.json();
    if (!response.ok) {
      return json(
        { error: payload?.error?.message || "audio_transcription_failed" },
        502,
        corsHeaders,
      );
    }

    return json({ text: String(payload?.text || "").trim() }, 200, corsHeaders);
  } catch (error) {
    const message = error instanceof Error ? error.message : "transcription_failed";
    const status = message === "unauthorized" ? 401 : 500;
    return json({ error: message }, status, corsHeaders);
  }
});

function json(body: Record<string, string>, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
