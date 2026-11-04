import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function churchToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);
    const today = churchToday();

    const { data: dueSets, error } = await supabase
      .from("draft_sets")
      .select("id")
      .eq("status", "scheduled")
      .lte("publish_on", today);

    if (error) throw error;

    const published: string[] = [];
    const failed: { id: string; error: string }[] = [];

    for (const row of dueSets || []) {
      const publishedAt = new Date().toISOString();
      const { data: updated, error: updateError } = await supabase
        .from("draft_sets")
        .update({
          status: "published",
          published_at: publishedAt,
          submitted_for_approval_at: null,
        })
        .eq("id", row.id)
        .eq("status", "scheduled")
        .select("id")
        .maybeSingle();

      if (updateError || !updated) {
        failed.push({ id: row.id, error: updateError?.message || "Set was no longer scheduled" });
        continue;
      }

      const notifyResponse = await fetch(`${supabaseUrl}/functions/v1/notify-setlist-published`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ draftSetId: row.id }),
      });

      if (!notifyResponse.ok) {
        const body = await notifyResponse.text();
        console.error("Scheduled setlist published but notification failed", row.id, body);
        failed.push({ id: row.id, error: "Published, but team notification failed" });
        continue;
      }

      published.push(row.id);
    }

    return new Response(
      JSON.stringify({ today, published: published.length, failed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("publish-scheduled-setlists failed:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
