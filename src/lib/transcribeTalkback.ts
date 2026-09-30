import { supabase } from "@/integrations/supabase/client";

const REMOTE_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const USE_SUPABASE_DEV_PROXY = import.meta.env.DEV && import.meta.env.VITE_USE_SUPABASE_DEV_PROXY === "true";
const SUPABASE_FUNCTIONS_URL = USE_SUPABASE_DEV_PROXY
  ? `${window.location.origin}/supabase/functions/v1`
  : `${REMOTE_SUPABASE_URL}/functions/v1`;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export async function transcribeTalkbackChunk(blob: Blob): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Sign in again to transcribe talkback.");
  }

  const form = new FormData();
  const extension = blob.type.includes("mp4") ? "m4a" : blob.type.includes("wav") ? "wav" : "webm";
  form.append("file", blob, `talkback.${extension}`);

  const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/transcribe-talkback`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: form,
  });

  const payload = (await response.json().catch(() => null)) as { text?: string; error?: string } | null;
  if (!response.ok) {
    throw new Error(payload?.error || "Could not transcribe that talkback.");
  }
  return payload?.text?.trim() || "";
}
