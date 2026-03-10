import {
  buildCorsHeaders,
  fetchBibleChapter,
  getSupabaseClients,
  requireAuthenticatedUser,
} from "../_shared/teaching-utils.ts";

interface GetPassageRequest {
  reference?: string;
  translation?: string;
}

type ParsedReference = {
  book: string | null;
  chapter: number | null;
  verseStart: number | null;
  verseEnd: number | null;
};

const BOOK_NAMES = [
  "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy",
  "Joshua", "Judges", "Ruth", "1 Samuel", "2 Samuel", "1 Kings", "2 Kings",
  "1 Chronicles", "2 Chronicles", "Ezra", "Nehemiah", "Esther", "Job", "Psalms",
  "Proverbs", "Ecclesiastes", "Song of Solomon", "Isaiah", "Jeremiah", "Lamentations",
  "Ezekiel", "Daniel", "Hosea", "Joel", "Amos", "Obadiah", "Jonah", "Micah", "Nahum",
  "Habakkuk", "Zephaniah", "Haggai", "Zechariah", "Malachi", "Matthew", "Mark", "Luke",
  "John", "Acts", "Romans", "1 Corinthians", "2 Corinthians", "Galatians", "Ephesians",
  "Philippians", "Colossians", "1 Thessalonians", "2 Thessalonians", "1 Timothy",
  "2 Timothy", "Titus", "Philemon", "Hebrews", "James", "1 Peter", "2 Peter",
  "1 John", "2 John", "3 John", "Jude", "Revelation",
] as const;

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeLookupKey(reference: string): string {
  return normalizeWhitespace(reference).toLowerCase();
}

function titleCaseBook(book: string): string {
  return book
    .split(" ")
    .map((segment) => {
      if (/^\d+$/.test(segment)) return segment;
      return segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase();
    })
    .join(" ");
}

function parseReference(reference: string): ParsedReference {
  const trimmed = normalizeWhitespace(reference);
  const match = trimmed.match(/^((?:[1-3]\s+)?[A-Za-z]+(?:\s+[A-Za-z]+)*)\s+(\d+)(?::(\d+)(?:-(\d+))?)?$/);

  if (!match) {
    return { book: null, chapter: null, verseStart: null, verseEnd: null };
  }

  const book = titleCaseBook(match[1] || "");
  const chapter = Number.parseInt(match[2] || "", 10);
  const verseStart = match[3] ? Number.parseInt(match[3], 10) : null;
  const verseEnd = match[4] ? Number.parseInt(match[4], 10) : verseStart;

  return {
    book: BOOK_NAMES.includes(book as (typeof BOOK_NAMES)[number]) ? book : book,
    chapter: Number.isNaN(chapter) ? null : chapter,
    verseStart: verseStart && !Number.isNaN(verseStart) ? verseStart : null,
    verseEnd: verseEnd && !Number.isNaN(verseEnd) ? verseEnd : null,
  };
}

async function fetchPassageByReference(reference: string, translation: string) {
  if (translation === "ESV") {
    const esvApiKey = Deno.env.get("ESV_API_KEY");
    if (!esvApiKey) {
      throw new Error("ESV_API_KEY is not configured");
    }

    const apiUrl = new URL("https://api.esv.org/v3/passage/text/");
    apiUrl.searchParams.set("q", reference);
    apiUrl.searchParams.set("include-passage-references", "true");
    apiUrl.searchParams.set("include-verse-numbers", "true");
    apiUrl.searchParams.set("include-first-verse-numbers", "true");
    apiUrl.searchParams.set("include-footnotes", "false");
    apiUrl.searchParams.set("include-footnote-body", "false");
    apiUrl.searchParams.set("include-headings", "false");
    apiUrl.searchParams.set("include-short-copyright", "true");
    apiUrl.searchParams.set("include-copyright", "false");
    apiUrl.searchParams.set("include-passage-horizontal-lines", "false");
    apiUrl.searchParams.set("include-heading-horizontal-lines", "false");

    console.log("ESV request start", {
      reference,
      translation,
      url: apiUrl.toString(),
      hasKey: Boolean(esvApiKey),
      keyPrefix: esvApiKey.slice(0, 6),
    });

    const response = await fetch(apiUrl.toString(), {
      headers: {
        Authorization: `Token ${esvApiKey}`,
      },
    });
    const payload = await response.json();

    console.log("ESV request result", {
      ok: response.ok,
      status: response.status,
      payload,
    });

    if (!response.ok) {
      throw new Error(payload?.detail || payload?.error || "esv_api_failed");
    }

    const passages = Array.isArray(payload?.passages)
      ? payload.passages.map((passage) => String(passage || "").trim()).filter(Boolean)
      : [];

    return {
      reference: String(payload?.canonical || payload?.query || reference),
      translation,
      text: passages.join("\n\n").trim(),
      verses: [],
    };
  }

  const apiUrl = `https://bible-api.com/${encodeURIComponent(reference)}?translation=${encodeURIComponent(translation.toLowerCase())}`;
  const response = await fetch(apiUrl);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error || "bible_api_failed");
  }

  return {
    reference: String(payload?.reference || reference),
    translation,
    text: typeof payload?.text === "string" ? payload.text.trim() : "",
    verses: Array.isArray(payload?.verses) ? payload.verses : [],
  };
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

    const { reference = "", translation = "ESV" } = (await req.json()) as GetPassageRequest;
    const normalizedReference = normalizeWhitespace(reference);
    if (!normalizedReference) {
      return new Response(JSON.stringify({ error: "reference_required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalizedTranslation = normalizeWhitespace(translation || "ESV").toUpperCase();
    const lookupKey = normalizeLookupKey(normalizedReference);

    const { data: cached, error: cacheError } = await adminClient
      .from("bible_passage_cache")
      .select("*")
      .eq("lookup_key", lookupKey)
      .eq("translation", normalizedTranslation)
      .maybeSingle();

    if (cacheError) {
      throw new Error(cacheError.message);
    }

    if (cached) {
      return new Response(JSON.stringify({ ...cached, from_cache: true, user_id: user.id }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsedReference = parseReference(normalizedReference);
    const passage = parsedReference.book && parsedReference.chapter && !parsedReference.verseStart
      ? await fetchBibleChapter(parsedReference.book, parsedReference.chapter, normalizedTranslation)
      : await fetchPassageByReference(normalizedReference, normalizedTranslation);

    const parsedCanonical = parseReference(passage.reference || normalizedReference);
    const row = {
      lookup_key: lookupKey,
      reference: passage.reference || normalizedReference,
      translation: normalizedTranslation,
      book: parsedCanonical.book,
      chapter: parsedCanonical.chapter,
      verse_start: parsedCanonical.verseStart,
      verse_end: parsedCanonical.verseEnd,
      text: passage.text,
      verses: passage.verses || [],
      source: normalizedTranslation === "ESV" ? "esv" : "bible_api",
    };

    const { data: inserted, error: insertError } = await adminClient
      .from("bible_passage_cache")
      .upsert(row, { onConflict: "lookup_key,translation" })
      .select("*")
      .single();

    if (insertError) {
      throw new Error(insertError.message);
    }

    return new Response(JSON.stringify({ ...inserted, from_cache: false, user_id: user.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    const status = message === "unauthorized" ? 401 : 500;

    console.error("get-passage failed", {
      message,
      stack: error instanceof Error ? error.stack : null,
    });

    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
