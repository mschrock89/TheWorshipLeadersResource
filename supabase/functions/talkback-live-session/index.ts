import {
  buildCorsHeaders,
  getSupabaseClients,
  requireAuthenticatedUser,
} from "../_shared/teaching-utils.ts";

const PROMPT =
  "Worship production talkback. Short cues from stage positions to front of house and monitors, such as more click, vocals up, ready for the bridge, kill the pad.";

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

    const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        expires_after: { anchor: "created_at", seconds: 3600 },
        session: {
          type: "transcription",
          audio: {
            input: {
              format: { type: "audio/pcm", rate: 24000 },
              transcription: {
                model: "gpt-live-transcribe",
                prompt: PROMPT,
                languages: ["en"],
                delay: "minimal",
              },
              turn_detection: null,
            },
          },
        },
      }),
    });
    const payload = await response.json().catch(() => null);
    const token = typeof payload?.value === "string" ? payload.value : payload?.client_secret?.value;
    if (!response.ok || typeof token !== "string" || !token) {
      return json({ error: payload?.error?.message || "live_session_unavailable" }, 502, corsHeaders);
    }

    return json(
      { token, expires_at: String(payload?.expires_at || payload?.client_secret?.expires_at || "") },
      200,
      corsHeaders,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "live_session_failed";
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
