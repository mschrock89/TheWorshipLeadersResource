import {
  buildCorsHeaders,
  getSupabaseClients,
  requireAuthenticatedUser,
  requireStaff,
} from "../_shared/teaching-utils.ts";

interface AutoReorderRequest {
  reference_track_id: string;
  draft_set_id?: string;
  dry_run?: boolean;
}

type TranscriptSegment = {
  start: number;
  end: number;
  text: string;
};

type ChartSection = {
  header: string;
  normalizedHeader: string;
  lines: string[];
};

type DraftSection = {
  name: string;
  chords?: string | null;
};

const SECTION_HEADER_REGEX =
  /^(intro|verse(?:\s+\d+)?|chorus|bridge|tag|turnaround|pre[-\s]?chorus|post[-\s]?chorus|outro|interlude|instrumental|refrain|ending|vamp)$/i;

function normalizeSectionName(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/pre\s*chorus/g, "pre-chorus")
    .replace(/post\s*chorus/g, "post-chorus");
}

function parseChartSections(rawChart: string): { preludeLines: string[]; sections: ChartSection[] } {
  const lines = rawChart.split("\n");
  const preludeLines: string[] = [];
  const sections: ChartSection[] = [];

  let currentSection: ChartSection | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    const isHeader = trimmed.length > 0 && SECTION_HEADER_REGEX.test(trimmed);

    if (isHeader) {
      if (currentSection) sections.push(currentSection);
      currentSection = {
        header: trimmed,
        normalizedHeader: normalizeSectionName(trimmed),
        lines: [line],
      };
      continue;
    }

    if (currentSection) {
      currentSection.lines.push(line);
    } else {
      preludeLines.push(line);
    }
  }

  if (currentSection) sections.push(currentSection);

  return { preludeLines, sections };
}

function buildReorderedChart(
  preludeLines: string[],
  sections: ChartSection[],
  orderedHeaders: string[],
): string {
  const byHeader = new Map<string, ChartSection>();
  for (const section of sections) {
    if (!byHeader.has(section.normalizedHeader)) {
      byHeader.set(section.normalizedHeader, section);
    }
  }

  const seen = new Set<string>();
  const reordered: ChartSection[] = [];

  for (const rawHeader of orderedHeaders) {
    const normalized = normalizeSectionName(rawHeader);
    if (seen.has(normalized)) continue;
    const section = byHeader.get(normalized);
    if (!section) continue;
    seen.add(normalized);
    reordered.push(section);
  }

  for (const section of sections) {
    if (seen.has(section.normalizedHeader)) continue;
    reordered.push(section);
  }

  const chunks: string[] = [];
  const prelude = preludeLines.join("\n").trim();
  if (prelude) chunks.push(prelude);

  for (const section of reordered) {
    chunks.push(section.lines.join("\n").trimEnd());
  }

  return chunks.join("\n\n").trim();
}

function getTranscriptTextInRange(segments: TranscriptSegment[], start: number, end: number): string {
  const lines = segments
    .filter((segment) => segment.end >= start && segment.start <= end)
    .map((segment) => segment.text?.trim())
    .filter((text): text is string => Boolean(text));

  return lines.join(" ").replace(/\s+/g, " ").trim();
}

async function transcribeReferenceTrack(audioUrl: string): Promise<TranscriptSegment[]> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const audioResponse = await fetch(audioUrl);
  if (!audioResponse.ok) {
    throw new Error(`Unable to fetch reference track audio (${audioResponse.status})`);
  }

  const contentType = audioResponse.headers.get("content-type") || "audio/mpeg";
  const audioBlob = await audioResponse.blob();
  const fileName = `reference-track.${contentType.includes("wav") ? "wav" : "mp3"}`;

  const formData = new FormData();
  formData.append("file", new File([audioBlob], fileName, { type: contentType }));
  formData.append("model", "whisper-1");
  formData.append("response_format", "verbose_json");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(json?.error?.message || "audio_transcription_failed");
  }

  const rawSegments = Array.isArray(json?.segments) ? json.segments : [];
  return rawSegments
    .map((segment: { start?: number; end?: number; text?: string }) => ({
      start: Number(segment.start || 0),
      end: Number(segment.end || 0),
      text: String(segment.text || ""),
    }))
    .filter((segment: TranscriptSegment) => segment.text.length > 0);
}

async function inferSectionOrderFromTranscript(
  transcriptSnippet: string,
  availableHeaders: string[],
): Promise<string[]> {
  if (!transcriptSnippet.trim() || availableHeaders.length === 0) return [];

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You extract called song section order from spoken guide cues. Return JSON only: {\"ordered_headers\": string[]}. Only include values from the provided available headers.",
        },
        {
          role: "user",
          content: JSON.stringify({
            available_headers: availableHeaders,
            transcript_excerpt: transcriptSnippet,
          }),
        },
      ],
    }),
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(json?.error?.message || "section_order_inference_failed");
  }

  const content = json?.choices?.[0]?.message?.content;
  if (!content) return [];

  const parsed = JSON.parse(content) as { ordered_headers?: unknown };
  if (!Array.isArray(parsed.ordered_headers)) return [];

  const allowed = new Set(availableHeaders.map((header) => normalizeSectionName(header)));

  return parsed.ordered_headers
    .map((entry) => String(entry || "").trim())
    .filter(Boolean)
    .filter((header) => allowed.has(normalizeSectionName(header)));
}

async function inferDraftSectionsAndChordsFromTranscript(
  transcriptSnippet: string,
  songTitle: string,
  songAuthor: string | null,
  songKey: string | null,
): Promise<{ sections: DraftSection[]; confidence: number }> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Build a practical draft chord chart scaffold from guide calls and lyric cues. Return JSON only: {\"confidence\": number, \"sections\": [{\"name\": string, \"chords\": string}]}. Use section names like Intro, Verse 1, Chorus, Bridge, Tag, Outro. Keep chord lines compact like \"D A Bm G\". If uncertain, still return best guess and lower confidence.",
        },
        {
          role: "user",
          content: JSON.stringify({
            song_title: songTitle,
            song_author: songAuthor,
            expected_key: songKey,
            transcript_excerpt: transcriptSnippet,
          }),
        },
      ],
    }),
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(json?.error?.message || "draft_chart_inference_failed");
  }

  const content = json?.choices?.[0]?.message?.content;
  if (!content) return { sections: [], confidence: 0 };

  const parsed = JSON.parse(content) as {
    confidence?: number;
    sections?: Array<{ name?: string; chords?: string }>;
  };

  const sections = (parsed.sections || [])
    .map((section) => ({
      name: String(section.name || "").trim(),
      chords: String(section.chords || "").trim(),
    }))
    .filter((section) => section.name.length > 0);

  const confidence = Math.max(0, Math.min(1, Number(parsed.confidence || 0)));

  return { sections, confidence };
}

function buildDraftChartFromSections(
  sections: DraftSection[],
  songKey: string | null,
  confidence: number,
): string {
  const chunks: string[] = [];
  const keyLabel = songKey?.trim() || "Unknown";
  chunks.push(`AI Draft (Review Needed)`);
  chunks.push(`Key: ${keyLabel}`);
  chunks.push(`Confidence: ${Math.round(confidence * 100)}%`);

  for (const section of sections) {
    chunks.push("");
    chunks.push(section.name.trim());
    const normalizedChords = (section.chords || "").trim();
    chunks.push(normalizedChords ? `[${normalizedChords}]` : "[TBD]");
  }

  return chunks.join("\n").trim();
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

    const body = (await req.json()) as AutoReorderRequest;
    if (!body?.reference_track_id) {
      return new Response(JSON.stringify({ error: "reference_track_id_required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: refTrack, error: refTrackError } = await adminClient
      .from("setlist_playlist_reference_tracks")
      .select("id, title, audio_url, duration_seconds, playlist_id, setlist_playlists(draft_set_id)")
      .eq("id", body.reference_track_id)
      .maybeSingle();

    if (refTrackError || !refTrack) {
      return new Response(JSON.stringify({ error: "reference_track_not_found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const draftSetId = body.draft_set_id || (refTrack.setlist_playlists as { draft_set_id?: string } | null)?.draft_set_id;
    if (!draftSetId) {
      return new Response(JSON.stringify({ error: "draft_set_not_found_for_reference_track" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: markers, error: markersError } = await adminClient
      .from("reference_track_markers")
      .select("id, title, timestamp_seconds, sequence_order")
      .eq("reference_track_id", body.reference_track_id)
      .order("timestamp_seconds", { ascending: true });

    if (markersError) {
      return new Response(JSON.stringify({ error: markersError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!markers || markers.length === 0) {
      return new Response(JSON.stringify({ error: "reference_track_markers_required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: setSongs, error: setSongsError } = await adminClient
      .from("draft_set_songs")
      .select("id, song_id, song_key, sequence_order, songs(id, title, author)")
      .eq("draft_set_id", draftSetId)
      .order("sequence_order", { ascending: true });

    if (setSongsError) {
      return new Response(JSON.stringify({ error: setSongsError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!setSongs || setSongs.length === 0) {
      return new Response(JSON.stringify({ error: "no_songs_found_for_set" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const songIds = setSongs.map((row) => row.song_id);
    const { data: versions, error: versionsError } = await adminClient
      .from("song_versions")
      .select("id, song_id, version_name, chord_chart_text, is_primary")
      .in("song_id", songIds)
      .order("is_primary", { ascending: false })
      .order("updated_at", { ascending: false });

    if (versionsError) {
      return new Response(JSON.stringify({ error: versionsError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const primaryVersionBySongId = new Map<string, { id: string; chord_chart_text: string | null; version_name: string }>();
    const versionCountBySongId = new Map<string, number>();
    for (const version of versions || []) {
      if (!version.song_id) continue;
      versionCountBySongId.set(version.song_id, (versionCountBySongId.get(version.song_id) || 0) + 1);
      if (!primaryVersionBySongId.has(version.song_id)) {
        primaryVersionBySongId.set(version.song_id, {
          id: version.id,
          chord_chart_text: version.chord_chart_text,
          version_name: version.version_name,
        });
      }
    }

    const transcriptSegments = await transcribeReferenceTrack(refTrack.audio_url);

    const markerSongPairs = markers
      .map((marker, index) => ({
        marker,
        song: setSongs[index] || null,
        segmentStart: marker.timestamp_seconds,
        segmentEnd:
          index < markers.length - 1
            ? markers[index + 1].timestamp_seconds
            : Number(refTrack.duration_seconds || marker.timestamp_seconds + 300),
      }))
      .filter((entry) => entry.song !== null);

    let updatedSongs = 0;
    let builtSongs = 0;
    const skipped: Array<{ song: string; reason: string }> = [];

    for (const pair of markerSongPairs) {
      const song = pair.song!;
      const songMeta = song.songs as { title?: string; author?: string | null } | null;
      const songTitle = songMeta?.title || "Unknown Song";
      const songAuthor = songMeta?.author || null;
      const songKey = (song as { song_key?: string | null }).song_key || null;
      const version = primaryVersionBySongId.get(song.song_id);

      const transcriptSnippet = getTranscriptTextInRange(
        transcriptSegments,
        pair.segmentStart,
        pair.segmentEnd,
      );

      if (!transcriptSnippet) {
        skipped.push({ song: songTitle, reason: "no_transcript_in_marker_range" });
        continue;
      }

      const hasUsableChart = Boolean(version?.chord_chart_text?.trim());
      const parsed = hasUsableChart ? parseChartSections(version!.chord_chart_text || "") : { preludeLines: [], sections: [] };
      const canReorderExisting = parsed.sections.length >= 2;

      if (canReorderExisting) {
        const orderedHeaders = await inferSectionOrderFromTranscript(
          transcriptSnippet,
          parsed.sections.map((section) => section.header),
        );

        if (orderedHeaders.length === 0) {
          skipped.push({ song: songTitle, reason: "no_called_sections_detected" });
          continue;
        }

        const reorderedChart = buildReorderedChart(parsed.preludeLines, parsed.sections, orderedHeaders);
        const changed = reorderedChart.trim() !== (version?.chord_chart_text || "").trim();

        if (!changed) {
          skipped.push({ song: songTitle, reason: "already_matching_called_order" });
          continue;
        }

        if (!body.dry_run) {
          const { error: updateError } = await adminClient
            .from("song_versions")
            .update({ chord_chart_text: reorderedChart })
            .eq("id", version!.id);

          if (updateError) {
            skipped.push({ song: songTitle, reason: `update_failed:${updateError.message}` });
            continue;
          }
        }

        updatedSongs += 1;
        continue;
      }

      const draft = await inferDraftSectionsAndChordsFromTranscript(
        transcriptSnippet,
        songTitle,
        songAuthor,
        songKey,
      );

      if (draft.sections.length === 0) {
        skipped.push({ song: songTitle, reason: "unable_to_generate_draft_chart" });
        continue;
      }

      const draftChartText = buildDraftChartFromSections(draft.sections, songKey, draft.confidence);

      if (!body.dry_run) {
        if (version?.id) {
          const { error: updateError } = await adminClient
            .from("song_versions")
            .update({ chord_chart_text: draftChartText })
            .eq("id", version.id);

          if (updateError) {
            skipped.push({ song: songTitle, reason: `update_failed:${updateError.message}` });
            continue;
          }
        } else {
          const hasAnyVersion = (versionCountBySongId.get(song.song_id) || 0) > 0;
          const { error: insertError } = await adminClient
            .from("song_versions")
            .insert({
              song_id: song.song_id,
              version_name: "AI Draft (Reference Guide)",
              chord_chart_text: draftChartText,
              is_primary: !hasAnyVersion,
            });

          if (insertError) {
            skipped.push({ song: songTitle, reason: `insert_failed:${insertError.message}` });
            continue;
          }
        }
      }

      builtSongs += 1;
    }

    return new Response(
      JSON.stringify({
        success: true,
        reference_track_id: body.reference_track_id,
        draft_set_id: draftSetId,
        marker_count: markers.length,
        songs_considered: markerSongPairs.length,
        updated_songs: updatedSongs,
        built_songs: builtSongs,
        skipped,
        dry_run: Boolean(body.dry_run),
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
