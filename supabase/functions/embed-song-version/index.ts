import {
  averageEmbeddings,
  buildCorsHeaders,
  chunkText,
  createEmbedding,
  getSupabaseClients,
  requireAuthenticatedUser,
  requireStaff,
} from "../_shared/teaching-utils.ts";

interface EmbedSongVersionRequest {
  song_version_id: string;
}

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
    const { userClient, adminClient } = getSupabaseClients(authHeader);
    const user = await requireAuthenticatedUser(userClient);
    await requireStaff(user.id, adminClient);

    const { song_version_id } = (await req.json()) as EmbedSongVersionRequest;
    if (!song_version_id) {
      return new Response(JSON.stringify({ error: "song_version_id_required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: version, error: versionError } = await adminClient
      .from("song_versions")
      .select("id, song_id, version_name, lyrics, chord_chart_text, songs(title, author)")
      .eq("id", song_version_id)
      .maybeSingle();

    if (versionError || !version) {
      return new Response(JSON.stringify({ error: "song_version_not_found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const metadata = `${version.songs?.title || ""}\n${version.songs?.author || ""}\n${version.version_name || ""}`;
    const sourceText = `${metadata}\n\n${version.lyrics || ""}\n\n${version.chord_chart_text || ""}`.trim();

    if (!sourceText) {
      return new Response(JSON.stringify({ error: "song_version_has_no_text" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const chunks = chunkText(sourceText, 6000);
    const vectors: number[][] = [];
    for (const chunk of chunks) {
      vectors.push(await createEmbedding(chunk));
    }

    const embedding = vectors.length === 1 ? vectors[0] : averageEmbeddings(vectors);

    const { error: updateError } = await adminClient
      .from("song_versions")
      .update({
        embedding,
        embedding_generated_at: new Date().toISOString(),
      })
      .eq("id", song_version_id);

    if (updateError) {
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, song_version_id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    const status = message === "unauthorized" ? 401 : message === "forbidden" ? 403 : 500;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
