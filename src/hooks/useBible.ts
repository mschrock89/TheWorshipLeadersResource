import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { BibleTranslation } from "@/lib/bible";

export interface BibleVerse {
  book_name: string;
  chapter: number;
  verse: number;
  text: string;
}

export interface BiblePassage {
  id: string;
  lookup_key: string;
  reference: string;
  translation: string;
  book: string | null;
  chapter: number | null;
  verse_start: number | null;
  verse_end: number | null;
  text: string;
  verses: BibleVerse[];
  source: string;
  fetched_at: string;
  from_cache?: boolean;
}

export interface SavedPassageRow {
  id: string;
  reference: string;
  translation: string;
  notes: string | null;
  created_at: string;
  passage_cache_id: string;
  passage: BiblePassage | null;
}

export interface RecentPassageRow {
  id: string;
  reference: string;
  translation: string;
  viewed_at: string;
  passage_cache_id: string;
  passage: BiblePassage | null;
}

function normalizeLookupKey(reference: string) {
  return reference.replace(/\s+/g, " ").trim().toLowerCase();
}

async function getFunctionErrorMessage(error: unknown, translation?: BibleTranslation) {
  if (error instanceof FunctionsHttpError) {
    const status = error.context?.status;
    let detail = "";

    // Read the body as text once, then try to parse JSON. Reading `.json()`
    // directly and then falling back to `.text()` fails because the body can
    // only be consumed a single time.
    try {
      const raw = await error.context.text();
      try {
        const payload = JSON.parse(raw);
        detail = typeof payload?.error === "string" ? payload.error : "";
      } catch {
        detail = raw.trim();
      }
    } catch {
      // Body was not readable; fall through with whatever status we have.
    }

    if (detail === "ESV_API_KEY is not configured") {
      return "ESV is not configured yet. Add the ESV_API_KEY secret to your Supabase project.";
    }

    if (detail) {
      return status ? `${detail} (HTTP ${status})` : detail;
    }

    if (status) {
      return `The ESV service returned an error (HTTP ${status}).`;
    }
  }

  // These are the cases the old handler silently collapsed into a generic
  // "unavailable" message, which hid the real failure (a timed-out / crashed
  // Edge Function surfaces as a relay error, a network failure as a fetch error).
  if (error instanceof FunctionsRelayError) {
    return `The ESV service could not be reached (relay error): ${error.message}`;
  }

  if (error instanceof FunctionsFetchError) {
    return `Could not reach the ESV service (network error): ${error.message}`;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (translation === "ESV") {
    return "The ESV service is unavailable right now.";
  }

  return "Failed to load passage.";
}

async function fetchBiblePassage(reference: string, translation: BibleTranslation) {
  const lookupKey = normalizeLookupKey(reference);

  const { data: cachedPassage, error: cachedPassageError } = await supabase
    .from("bible_passage_cache")
    .select("*")
    .eq("lookup_key", lookupKey)
    .eq("translation", translation)
    .maybeSingle();

  if (cachedPassageError) {
    throw new Error(cachedPassageError.message);
  }

  if (cachedPassage) {
    return {
      ...cachedPassage,
      verses: Array.isArray(cachedPassage.verses) ? (cachedPassage.verses as BibleVerse[]) : [],
      from_cache: true,
    } as BiblePassage;
  }

  const { data, error } = await supabase.functions.invoke("get-passage", {
    body: { reference, translation },
  });

  if (error) {
    throw new Error(await getFunctionErrorMessage(error, translation));
  }

  return data as BiblePassage;
}

export function useBiblePassage(reference: string, translation: BibleTranslation) {
  return useQuery({
    queryKey: ["bible-passage", reference, translation],
    enabled: !!reference.trim(),
    staleTime: 1000 * 60 * 30,
    gcTime: 1000 * 60 * 60,
    queryFn: () => fetchBiblePassage(reference, translation),
  });
}

export function useSavedPassages() {
  return useQuery({
    queryKey: ["saved-passages"],
    staleTime: 1000 * 60 * 5,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_saved_passages")
        .select(`
          id,
          reference,
          translation,
          notes,
          created_at,
          passage_cache_id,
          passage:bible_passage_cache (*)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return ((data || []) as SavedPassageRow[]).map((row) => ({
        ...row,
        passage: row.passage,
      }));
    },
  });
}

export function useRecentPassages() {
  return useQuery({
    queryKey: ["recent-passages"],
    staleTime: 1000 * 60 * 2,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_recent_passages")
        .select(`
          id,
          reference,
          translation,
          viewed_at,
          passage_cache_id,
          passage:bible_passage_cache (*)
        `)
        .order("viewed_at", { ascending: false })
        .limit(12);

      if (error) throw error;
      return ((data || []) as RecentPassageRow[]).map((row) => ({
        ...row,
        passage: row.passage,
      }));
    },
  });
}

export function useSavePassage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: { passage: BiblePassage; notes?: string | null }) => {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      const userId = authData.user?.id;
      if (!userId) throw new Error("You must be signed in to save passages.");

      const { data, error } = await supabase
        .from("user_saved_passages")
        .upsert({
          user_id: userId,
          passage_cache_id: input.passage.id,
          reference: input.passage.reference,
          translation: input.passage.translation,
          notes: input.notes || null,
        }, { onConflict: "user_id,passage_cache_id" })
        .select(`
          id,
          reference,
          translation,
          notes,
          created_at,
          passage_cache_id,
          passage:bible_passage_cache (*)
        `)
        .single();

      if (error) throw error;
      return data as SavedPassageRow;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-passages"] });
      toast({ title: "Passage saved" });
    },
    onError: (error) => {
      toast({
        title: "Could not save passage",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useRemoveSavedPassage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (savedPassageId: string) => {
      const { error } = await supabase
        .from("user_saved_passages")
        .delete()
        .eq("id", savedPassageId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-passages"] });
      toast({ title: "Passage removed" });
    },
    onError: (error) => {
      toast({
        title: "Could not remove saved passage",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useRecordRecentPassage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (passage: BiblePassage) => {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      const userId = authData.user?.id;
      if (!userId) return null;

      const { data, error } = await supabase
        .from("user_recent_passages")
        .upsert({
          user_id: userId,
          passage_cache_id: passage.id,
          reference: passage.reference,
          translation: passage.translation,
          viewed_at: new Date().toISOString(),
        }, { onConflict: "user_id,passage_cache_id,translation" })
        .select("id")
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recent-passages"] });
    },
  });
}
