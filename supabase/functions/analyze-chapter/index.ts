import {
  buildCorsHeaders,
  fetchBibleChapter,
  getSupabaseClients,
  requireAuthenticatedUser,
  requireStaff,
  createEmbedding,
  summarizeChapterAndThemes,
} from "../_shared/teaching-utils.ts";

interface AnalyzeChapterRequest {
  teaching_week_id: string;
  translation?: string;
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

    const { teaching_week_id, translation } = (await req.json()) as AnalyzeChapterRequest;
    if (!teaching_week_id) {
      return new Response(JSON.stringify({ error: "teaching_week_id_required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: week, error: weekError } = await adminClient
      .from("teaching_weeks")
      .select("id, book, chapter, translation")
      .eq("id", teaching_week_id)
      .maybeSingle();

    if (weekError || !week) {
      return new Response(JSON.stringify({ error: "teaching_week_not_found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const targetTranslation = translation || week.translation || "web";
    const bibleChapter = await fetchBibleChapter(week.book, week.chapter, targetTranslation);
    const chapterText = bibleChapter.text;
    const normalizedReference = bibleChapter.reference;

    const analysis = await summarizeChapterAndThemes(chapterText, normalizedReference);
    const embeddingInput = [analysis.summary, ...analysis.themes].filter(Boolean).join("\n");
    const embedding = await createEmbedding(embeddingInput);

    const { error: updateError } = await adminClient
      .from("teaching_weeks")
      .update({
        translation: targetTranslation,
        chapter_reference: normalizedReference,
        chapter_text: chapterText,
        ai_summary: analysis.summary,
        themes_suggested: analysis.themes,
        embedding,
        analyzed_at: new Date().toISOString(),
        updated_by: user.id,
      })
      .eq("id", teaching_week_id);

    if (updateError) {
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        teaching_week_id,
        reference: normalizedReference,
        ai_summary: analysis.summary,
        themes_suggested: analysis.themes,
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
