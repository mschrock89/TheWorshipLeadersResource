import {
  buildCorsHeaders,
  getSupabaseClients,
  requireAuthenticatedUser,
  requireStaff,
} from "../_shared/teaching-utils.ts";

interface SuggestSongsRequest {
  teaching_week_id: string;
  max?: number;
}

type SongStatsRow = {
  id: string;
  title: string;
  author: string | null;
  bpm: number | null;
  usages?: Array<{
    plan_date: string;
    campus_id: string | null;
    service_type_name: string;
    song_key: string | null;
  }>;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function weeksBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T00:00:00Z`);
  const to = new Date(`${toIso}T00:00:00Z`);
  const diff = Math.abs(to.getTime() - from.getTime());
  return Math.floor(diff / (7 * DAY_MS));
}

function serviceMatchesMinistry(serviceTypeName: string, ministryType: string): boolean {
  const serviceName = (serviceTypeName || "").toLowerCase();

  if (ministryType === "encounter") return serviceName.includes("encounter");
  if (ministryType === "eon") return serviceName.includes("eon");
  if (ministryType === "evident") return serviceName.includes("evident");
  if (ministryType === "prayer_night") return serviceName.includes("prayer");

  if (ministryType === "weekend") {
    return (
      !serviceName.includes("encounter") &&
      !serviceName.includes("eon") &&
      !serviceName.includes("evident") &&
      !serviceName.includes("worship night") &&
      !serviceName.includes("prayer") &&
      !serviceName.includes("practice") &&
      !serviceName.includes("kids camp")
    );
  }

  return serviceName.includes(ministryType.toLowerCase());
}

function dedupeThemes(manual: string[] = [], suggested: string[] = []) {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const source of [manual, suggested]) {
    for (const rawTheme of source) {
      const theme = String(rawTheme || "").trim();
      if (!theme) continue;
      const key = theme.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(theme);
    }
  }

  return merged;
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

    const { teaching_week_id, max = 12 } = (await req.json()) as SuggestSongsRequest;
    if (!teaching_week_id) {
      return new Response(JSON.stringify({ error: "teaching_week_id_required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const loadWeek = async () => {
      const { data, error } = await adminClient
        .from("teaching_weeks")
        .select("id, campus_id, ministry_type, weekend_date, book, chapter, ai_summary, themes_manual, themes_suggested, embedding")
        .eq("id", teaching_week_id)
        .maybeSingle();

      if (error || !data) return null;
      return data;
    };

    let week = await loadWeek();

    if (!week) {
      return new Response(JSON.stringify({ error: "teaching_week_not_found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!week.embedding) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
      if (!supabaseUrl || !anonKey) {
        throw new Error("missing_supabase_environment");
      }

      const analyzeResponse = await fetch(`${supabaseUrl}/functions/v1/analyze-chapter`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader || "",
          apikey: anonKey,
        },
        body: JSON.stringify({ teaching_week_id }),
      });

      if (!analyzeResponse.ok) {
        const payload = await analyzeResponse.text();
        return new Response(JSON.stringify({ error: "analyze_chapter_failed", details: payload }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      week = await loadWeek();
      if (!week?.embedding) {
        return new Response(JSON.stringify({ error: "chapter_embedding_missing" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const activeThemes = dedupeThemes(week.themes_manual || [], week.themes_suggested || []);

    const { data: rawMatches, error: matchError } = await adminClient.rpc("match_song_versions", {
      query_embedding: week.embedding,
      match_count: 80,
    });

    if (matchError) {
      return new Response(JSON.stringify({ error: matchError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const matches = (rawMatches || []) as Array<{
      song_version_id: string;
      song_id: string;
      similarity: number;
      distance: number;
    }>;

    if (matches.length === 0) {
      return new Response(JSON.stringify({ success: true, suggestions: [], active_themes: activeThemes }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const versionIds = [...new Set(matches.map((m) => m.song_version_id))];

    const { data: versions, error: versionError } = await adminClient
      .from("song_versions")
      .select("id, song_id, version_name, lyrics, songs(id, title, author, bpm)")
      .in("id", versionIds);

    if (versionError) {
      return new Response(JSON.stringify({ error: versionError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const versionById = new Map((versions || []).map((v) => [v.id, v]));

    const { data: songStatsRaw, error: songStatsError } = await adminClient.rpc("get_songs_with_stats");
    if (songStatsError) {
      return new Response(JSON.stringify({ error: songStatsError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const songStatsById = new Map<string, SongStatsRow>();
    for (const row of (songStatsRaw || []) as SongStatsRow[]) {
      songStatsById.set(row.id, row);
    }

    const weekendDate = String(week.weekend_date);
    const oneYearAgo = new Date(`${weekendDate}T00:00:00Z`);
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const oneYearAgoStr = oneYearAgo.toISOString().slice(0, 10);

    const seenSongs = new Set<string>();
    let deepCutCount = 0;

    const sortedMatches = [...matches].sort((a, b) => b.similarity - a.similarity);

    const suggestions: Array<Record<string, unknown>> = [];

    for (const match of sortedMatches) {
      if (suggestions.length >= Math.max(1, Math.min(max, 30))) break;
      if (seenSongs.has(match.song_id)) continue;

      const version = versionById.get(match.song_version_id);
      if (!version?.songs) continue;

      const songStats = songStatsById.get(match.song_id);
      const usages = (songStats?.usages || []).filter((u) => {
        const sameCampus = u.campus_id === week.campus_id;
        const sameMinistry = serviceMatchesMinistry(u.service_type_name || "", week.ministry_type);
        return sameCampus && sameMinistry;
      });

      const pastUsages = usages.filter((u) => u.plan_date < weekendDate).sort((a, b) => b.plan_date.localeCompare(a.plan_date));
      const totalUses = usages.length;
      const lastUsedDate = pastUsages[0]?.plan_date || null;

      const hasRecentSchedule = usages.some((u) => u.plan_date >= oneYearAgoStr && u.plan_date <= weekendDate);
      const isNewSong = hasRecentSchedule && totalUses < 4;

      const usesInPastYear = pastUsages.filter((u) => u.plan_date >= oneYearAgoStr).length;
      const isDeepCut = usesInPastYear <= 1;

      if (lastUsedDate) {
        const weeksSinceLastUse = weeksBetween(lastUsedDate, weekendDate);
        if (isNewSong && weeksSinceLastUse < 4) continue;
        if (!isNewSong && weeksSinceLastUse < 8) continue;
      }

      let suggestionType: "regular" | "new" | "deep_cut" = "regular";

      if (isDeepCut) {
        if (!(match.similarity >= 0.75 && (deepCutCount < 2 || match.similarity >= 0.88))) {
          continue;
        }
        suggestionType = "deep_cut";
        deepCutCount += 1;
      } else if (isNewSong) {
        suggestionType = "new";
      }

      const lyricSnippet = typeof version.lyrics === "string"
        ? version.lyrics.replace(/\s+/g, " ").trim().slice(0, 180)
        : "";

      const suggestedKey = pastUsages.find((usage) => usage.song_key)?.song_key || null;
      const reasonParts = [
        `Similarity ${(match.similarity * 100).toFixed(1)}%`,
        activeThemes.length ? `Matched themes: ${activeThemes.slice(0, 4).join(", ")}` : null,
        suggestionType === "deep_cut" ? "Deep cut fit with long reuse gap" : null,
        suggestionType === "new" ? "Still in new-song phase for this campus/ministry" : null,
      ].filter(Boolean);

      suggestions.push({
        song_id: version.song_id,
        song_version_id: version.id,
        title: version.songs.title,
        author: version.songs.author,
        bpm: version.songs.bpm,
        version_name: version.version_name,
        similarity: match.similarity,
        distance: match.distance,
        suggestion_type: suggestionType,
        suggested_key: suggestedKey,
        uses_in_ministry: totalUses,
        uses_in_past_year: usesInPastYear,
        last_used_date: lastUsedDate,
        reason: reasonParts.join(" • "),
        lyric_snippet: lyricSnippet,
      });

      seenSongs.add(version.song_id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        teaching_week_id,
        active_themes: activeThemes,
        ai_summary: week.ai_summary,
        suggestions,
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
