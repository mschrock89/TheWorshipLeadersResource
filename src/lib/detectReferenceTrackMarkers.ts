import { supabase } from "@/integrations/supabase/client";
import { getCurrentResourceAppKey } from "@/lib/resourceApp";

const REMOTE_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const USE_SUPABASE_DEV_PROXY = import.meta.env.DEV && import.meta.env.VITE_USE_SUPABASE_DEV_PROXY === "true";
const SUPABASE_FUNCTIONS_URL = USE_SUPABASE_DEV_PROXY
  ? `${window.location.origin}/supabase/functions/v1`
  : `${REMOTE_SUPABASE_URL}/functions/v1`;

export interface DetectedIntroMarkersResult {
  intro_timestamps: number[];
  intros_found: number;
}

export async function detectReferenceTrackMarkers(
  file: File,
  songCount: number,
): Promise<DetectedIntroMarkersResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("You must be signed in to analyze audio.");
  }

  const formData = new FormData();
  formData.append("file", file);
  if (songCount > 0) {
    formData.append("song_count", String(songCount));
  }

  const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/detect-reference-track-markers`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      "x-resource-app-key": getCurrentResourceAppKey(),
    },
    body: formData,
  });

  const payload = (await response.json()) as DetectedIntroMarkersResult & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || "Could not detect song markers from the audio.");
  }

  return payload;
}
