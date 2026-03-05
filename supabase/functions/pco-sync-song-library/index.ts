import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { refreshTokenIfNeededEncrypted } from "../_shared/pco-encryption.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TIMEOUT_MARGIN_MS = 55_000;

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchFromPCO(accessToken: string, endpoint: string): Promise<any> {
  const url = `https://api.planningcenteronline.com${endpoint}`;
  const maxAttempts = 6;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (response.ok) return response.json();

    if (response.status === 429) {
      const retryAfterHeader = response.headers.get("retry-after");
      const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : NaN;
      const backoffMs = Number.isFinite(retryAfterSeconds)
        ? Math.max(250, retryAfterSeconds * 1000)
        : Math.min(10_000, 500 * Math.pow(2, attempt - 1));
      await sleep(backoffMs);
      continue;
    }

    if (response.status >= 500 && response.status < 600) {
      const backoffMs = Math.min(10_000, 500 * Math.pow(2, attempt - 1));
      await sleep(backoffMs);
      continue;
    }

    throw new Error(`PCO API error: ${response.status} ${await response.text()}`);
  }

  throw new Error("PCO API error: exhausted retries");
}

async function fetchAllPages(accessToken: string, baseEndpoint: string, maxPages = 100): Promise<any[]> {
  const allData: any[] = [];
  let nextUrl: string | null = `https://api.planningcenteronline.com${baseEndpoint}`;
  let pageCount = 0;

  while (nextUrl && pageCount < maxPages) {
    const endpoint = nextUrl.replace("https://api.planningcenteronline.com", "");
    const data = await fetchFromPCO(accessToken, endpoint);
    allData.push(...(data.data || []));
    nextUrl = data.links?.next || null;
    pageCount++;
    if (nextUrl) await sleep(120);
  }

  return allData;
}

async function fetchSongsByPcoIds(
  supabaseAdmin: ReturnType<typeof createClient>,
  pcoSongIds: string[],
) {
  const rows: Array<{ id: string; pco_song_id: string | null }> = [];

  for (let i = 0; i < pcoSongIds.length; i += 200) {
    const batch = pcoSongIds.slice(i, i + 200);
    const { data, error } = await supabaseAdmin
      .from("songs")
      .select("id, pco_song_id")
      .in("pco_song_id", batch);

    if (error) {
      throw new Error(`Failed to map songs: ${error.message}`);
    }

    rows.push(...(data || []));
  }

  return rows;
}

async function fetchSongIdsWithVersions(
  supabaseAdmin: ReturnType<typeof createClient>,
  songIds: string[],
) {
  const rows: Array<{ song_id: string }> = [];

  for (let i = 0; i < songIds.length; i += 200) {
    const batch = songIds.slice(i, i + 200);
    const { data, error } = await supabaseAdmin
      .from("song_versions")
      .select("song_id")
      .not("pco_arrangement_id", "is", null)
      .in("song_id", batch);

    if (error) {
      throw new Error(`Failed to read existing song versions: ${error.message}`);
    }

    rows.push(...(data || []));
  }

  return rows;
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getArrangementVersionName(arrangement: any): string {
  return normalizeOptionalText(arrangement?.attributes?.name)
    || normalizeOptionalText(arrangement?.attributes?.description)
    || `Arrangement ${arrangement.id}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const supabaseUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    const { data: connection, error: connError } = await supabaseAdmin
      .from("pco_connections")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (connError || !connection) {
      throw new Error("No Planning Center connection found");
    }

    if (!connection.sync_chord_charts) {
      throw new Error("Chord chart sync is disabled in Planning Center settings");
    }

    const accessToken = await refreshTokenIfNeededEncrypted(supabaseAdmin, connection);

    const allLibrarySongs = await fetchAllPages(accessToken, "/services/v2/songs?per_page=100", 100);

    const librarySongs = allLibrarySongs.map((song) => ({
      pco_song_id: song.id,
      title: song.attributes.title || "Unknown Song",
      author: song.attributes.author || null,
      ccli_number: song.attributes.ccli_number?.toString() || null,
    }));

    for (let i = 0; i < librarySongs.length; i += 100) {
      const batch = librarySongs.slice(i, i + 100);
      const { error } = await supabaseAdmin
        .from("songs")
        .upsert(batch, { onConflict: "pco_song_id" });

      if (error) {
        throw new Error(`Failed to upsert songs: ${error.message}`);
      }
    }

    const dbSongs = await fetchSongsByPcoIds(
      supabaseAdmin,
      allLibrarySongs.map((song) => song.id),
    );

    const songIdMap = new Map<string, string>();
    for (const song of dbSongs || []) {
      if (song.pco_song_id) {
        songIdMap.set(song.pco_song_id, song.id);
      }
    }

    const existingSongIds = Array.from(songIdMap.values());
    const songIdsWithVersions = new Set<string>();

    if (existingSongIds.length > 0) {
      const existingVersions = await fetchSongIdsWithVersions(supabaseAdmin, existingSongIds);

      for (const row of existingVersions || []) {
        songIdsWithVersions.add(row.song_id);
      }
    }

    const songsRemainingBefore = allLibrarySongs.filter((song) => {
      const songId = songIdMap.get(song.id);
      return songId && !songIdsWithVersions.has(songId);
    });

    let songsProcessed = 0;
    let versionsSynced = 0;

    for (const song of songsRemainingBefore) {
      if (Date.now() - startTime > TIMEOUT_MARGIN_MS) {
        break;
      }

      const songId = songIdMap.get(song.id);
      if (!songId) continue;

      try {
        await sleep(150);
        const arrangementData = await fetchFromPCO(
          accessToken,
          `/services/v2/songs/${song.id}/arrangements?per_page=100`
        );

        const arrangements = arrangementData.data || [];
        songsProcessed++;

        if (arrangements.length === 0) {
          continue;
        }

        const versions = arrangements.map((arrangement: any, index: number) => ({
          song_id: songId,
          pco_arrangement_id: arrangement.id,
          version_name: getArrangementVersionName(arrangement),
          lyrics: normalizeOptionalText(arrangement.attributes?.lyrics),
          chord_chart_text: normalizeOptionalText(arrangement.attributes?.chord_chart),
          is_primary: index === 0,
        }));

        const { error } = await supabaseAdmin
          .from("song_versions")
          .upsert(versions, { onConflict: "pco_arrangement_id" });

        if (error) {
          throw new Error(`Failed to upsert arrangements for ${song.attributes.title}: ${error.message}`);
        }

        versionsSynced += versions.length;
      } catch (error) {
        console.error(`Failed syncing song library arrangements for ${song.id}:`, error);
      }
    }

    const remainingAfter = Math.max(songsRemainingBefore.length - songsProcessed, 0);

    return new Response(
      JSON.stringify({
        success: true,
        results: {
          library_songs_total: allLibrarySongs.length,
          songs_needing_chart_sync: songsRemainingBefore.length,
          songs_processed: songsProcessed,
          song_versions_synced: versionsSynced,
          songs_remaining: remainingAfter,
          complete: remainingAfter === 0,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Song library sync error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
