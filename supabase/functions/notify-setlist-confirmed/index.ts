import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotifyRequest {
  draftSetId: string;
  confirmerId: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    const { draftSetId, confirmerId }: NotifyRequest = await req.json();

    if (!draftSetId || !confirmerId) {
      return new Response(
        JSON.stringify({ error: "draftSetId and confirmerId are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Get the draft set details including who created it
    const { data: draftSet, error: draftSetError } = await supabase
      .from("draft_sets")
      .select(`
        id,
        campus_id,
        plan_date,
        ministry_type,
        created_by,
        campuses(name)
      `)
      .eq("id", draftSetId)
      .single();

    if (draftSetError || !draftSet) {
      console.error("Draft set not found:", draftSetError);
      return new Response(
        JSON.stringify({ error: "Draft set not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Get the confirmer's name
    const { data: confirmerProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", confirmerId)
      .single();

    const confirmerName = confirmerProfile?.full_name || "A team member";

    // 3. Get the setlist creator (worship leader) to notify
    const creatorId = draftSet.created_by;
    
    // Don't notify if the creator is the one confirming
    if (creatorId === confirmerId) {
      console.log("Creator confirmed their own setlist, no notification needed");
      return new Response(
        JSON.stringify({ success: true, notified: false, reason: "Self-confirmation" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Format the notification message
    const campusName = (draftSet.campuses as any)?.name || "";
    const formattedDate = new Date(draftSet.plan_date).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });

    const notificationPayload = {
      title: "Setlist Confirmed",
      message: `${confirmerName} reviewed the ${formattedDate}${campusName ? ` ${campusName}` : ""} setlist`,
      url: `/my-setlists?setId=${draftSetId}`,
      tag: `setlist-confirm-${draftSetId}-${confirmerId}`,
      userIds: [creatorId],
    };

    // 5. Send push notification via the existing function
    try {
      const pushResponse = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify(notificationPayload),
      });

      const pushResult = await pushResponse.json();
      console.log("Push notification result:", pushResult);

      return new Response(
        JSON.stringify({
          success: true,
          notified: true,
          creatorId,
          confirmerName,
          pushResult,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (pushError) {
      console.error("Error sending push notification:", pushError);
      return new Response(
        JSON.stringify({
          success: true,
          notified: false,
          reason: "Push notification failed",
          error: pushError instanceof Error ? pushError.message : "Unknown error",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error: unknown) {
    console.error("Error in notify-setlist-confirmed:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
