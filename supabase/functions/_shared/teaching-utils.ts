import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

const STAFF_ROLES = [
  "admin",
  "campus_admin",
  "network_worship_pastor",
  "campus_worship_pastor",
  "student_worship_pastor",
  "campus_pastor",
] as const;

export function buildCorsHeaders(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

export function getSupabaseClients(authHeader?: string | null): {
  userClient: SupabaseClient;
  adminClient: SupabaseClient;
} {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseAnon || !serviceRole) {
    throw new Error("Missing Supabase environment configuration");
  }

  const userClient = createClient(supabaseUrl, supabaseAnon, {
    global: {
      headers: authHeader ? { Authorization: authHeader } : {},
    },
  });

  const adminClient = createClient(supabaseUrl, serviceRole);
  return { userClient, adminClient };
}

export async function requireAuthenticatedUser(userClient: SupabaseClient) {
  const {
    data: { user },
    error,
  } = await userClient.auth.getUser();

  if (error || !user) {
    throw new Error("unauthorized");
  }

  return user;
}

export async function requireStaff(userId: string, adminClient: SupabaseClient) {
  const { data, error } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", [...STAFF_ROLES])
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    throw new Error("forbidden");
  }
}

export async function createEmbedding(input: string): Promise<number[]> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input,
    }),
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(json?.error?.message || "embedding_request_failed");
  }

  const embedding = json?.data?.[0]?.embedding;
  if (!Array.isArray(embedding)) {
    throw new Error("embedding_missing");
  }

  return embedding as number[];
}

export function averageEmbeddings(vectors: number[][]): number[] {
  if (vectors.length === 0) return [];
  const size = vectors[0].length;
  const accumulator = new Array<number>(size).fill(0);

  for (const vector of vectors) {
    for (let i = 0; i < size; i += 1) {
      accumulator[i] += vector[i];
    }
  }

  return accumulator.map((value) => value / vectors.length);
}

export function chunkText(input: string, maxChunkLength = 6000): string[] {
  const cleaned = input.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  if (cleaned.length <= maxChunkLength) return [cleaned];

  const chunks: string[] = [];
  let cursor = 0;

  while (cursor < cleaned.length) {
    const end = Math.min(cursor + maxChunkLength, cleaned.length);
    chunks.push(cleaned.slice(cursor, end));
    cursor = end;
  }

  return chunks;
}

export async function summarizeChapterAndThemes(chapterText: string, reference: string): Promise<{summary: string; themes: string[]}> {
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
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You extract concise teaching themes from Bible chapters. Return JSON: {\"summary\": string, \"themes\": string[]} where themes are canonical short tags.",
        },
        {
          role: "user",
          content: `Reference: ${reference}\n\nChapter Text:\n${chapterText}`,
        },
      ],
    }),
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(json?.error?.message || "chapter_analysis_failed");
  }

  const content = json?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("chapter_analysis_empty");
  }

  const parsed = JSON.parse(content) as { summary?: string; themes?: string[] };

  return {
    summary: (parsed.summary || "").trim(),
    themes: Array.isArray(parsed.themes)
      ? parsed.themes.map((theme) => String(theme).trim()).filter(Boolean).slice(0, 10)
      : [],
  };
}

export async function fetchBibleChapter(
  book: string,
  chapter: number,
  translation = "web",
): Promise<{
  reference: string;
  translation: string;
  text: string;
  verses: Array<{ book_name: string; chapter: number; verse: number; text: string }>;
}> {
  const reference = `${book} ${chapter}`;
  const apiUrl = `https://bible-api.com/${encodeURIComponent(reference)}?translation=${encodeURIComponent(translation)}`;
  const response = await fetch(apiUrl);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error || "bible_api_failed");
  }

  const text = typeof payload?.text === "string" ? payload.text.trim() : "";
  const verses = Array.isArray(payload?.verses)
    ? payload.verses.map((v: any) => ({
        book_name: String(v.book_name || ""),
        chapter: Number(v.chapter || chapter),
        verse: Number(v.verse || 0),
        text: String(v.text || ""),
      }))
    : [];

  return {
    reference: String(payload?.reference || reference),
    translation,
    text,
    verses,
  };
}
