import {
  averageEmbeddings,
  buildCorsHeaders,
  chunkText,
  createEmbedding,
  getSupabaseClients,
  requireAuthenticatedUser,
  requireStaff,
} from "../_shared/teaching-utils.ts";

interface EmbedAllSongsRequest {
  limit?: number;
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

    const { limit = 100 } = (await req.json().catch(() => ({}))) as EmbedAllSongsRequest;

    const { data: versions, error: versionsError } = await adminClient
      .from("song_versions")
      .select("id, song_id, version_name, lyrics, chord_chart_text, songs(title, author)")
      .is("embedding", null)
      .limit(Math.min(Math.max(limit, 1), 250));

    if (versionsError) {
      return new Response(JSON.stringify({ error: versionsError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0;
    let failed = 0;
    const errors: Array<{ song_version_id: string; error: string }> = [];

    for (const version of versions || []) {
      try {
        const metadata = `${version.songs?.title || ""}\n${version.songs?.author || ""}\n${version.version_name || ""}`;
        const sourceText = `${metadata}\n\n${version.lyrics || ""}\n\n${version.chord_chart_text || ""}`.trim();
        if (!sourceText) continue;

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
          .eq("id", version.id);

        if (updateError) throw updateError;
        processed += 1;
      } catch (error) {
        failed += 1;
        errors.push({
          song_version_id: version.id,
          error: error instanceof Error ? error.message : "unknown_error",
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        requested: versions?.length || 0,
        processed,
        failed,
        errors,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    const status = message === "unauthorized" ? 401 : message === "forbidden" ? 403 : 500;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
