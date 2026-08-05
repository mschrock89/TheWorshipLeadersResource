import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-resource-app-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface NotifyRequest {
  draftSetId: string;
  confirmerId: string;
}

const ADMIN_NOTIFICATION_ROLES = new Set(["admin", "campus_admin"]);

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

    const campusName = String((draftSet.campuses as { name?: string } | null)?.name || "").trim();
    const setCampusId = draftSet.campus_id as string | null;

    if (!setCampusId) {
      console.log("Skipping setlist confirmation push: set has no campus", { draftSetId });
      return new Response(
        JSON.stringify({ success: true, notified: false, reason: "Set has no campus" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Get the confirmer's name
    const { data: confirmerProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", confirmerId)
      .single();

    const confirmerName = confirmerProfile?.full_name || "A team member";

    // 3. Find admin recipients for this set's campus only.
    // Org admins no longer get every campus — only campuses they belong to
    // (user_campuses and/or admin_campus_id). Campus admins stay scoped to admin_campus_id.
    const { data: adminRoleRows, error: adminRolesError } = await supabase
      .from("user_roles")
      .select("user_id, role, admin_campus_id")
      .in("role", Array.from(ADMIN_NOTIFICATION_ROLES));

    if (adminRolesError) {
      console.error("Failed to load admin recipients:", adminRolesError);
      return new Response(
        JSON.stringify({ error: "Failed to determine notification recipients" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const candidateUserIds = Array.from(
      new Set(
        (adminRoleRows || [])
          .map((row) => row.user_id)
          .filter((userId): userId is string => Boolean(userId)),
      ),
    );

    const { data: userCampusRows, error: userCampusesError } = candidateUserIds.length
      ? await supabase
          .from("user_campuses")
          .select("user_id, campus_id")
          .in("user_id", candidateUserIds)
      : { data: [], error: null };

    if (userCampusesError) {
      console.error("Failed to load admin campuses:", userCampusesError);
      return new Response(
        JSON.stringify({ error: "Failed to determine notification recipients" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const campusesByUser = new Map<string, Set<string>>();
    for (const row of userCampusRows || []) {
      if (!row.user_id || !row.campus_id) continue;
      const existing = campusesByUser.get(row.user_id) || new Set<string>();
      existing.add(row.campus_id);
      campusesByUser.set(row.user_id, existing);
    }

    const recipientUserIds = Array.from(
      new Set(
        (adminRoleRows || [])
          .filter((row) => {
            if (!row.user_id || row.user_id === confirmerId) return false;

            if (row.role === "campus_admin") {
              return row.admin_campus_id === setCampusId;
            }

            if (row.role === "admin") {
              if (row.admin_campus_id === setCampusId) return true;
              return campusesByUser.get(row.user_id)?.has(setCampusId) ?? false;
            }

            return false;
          })
          .map((row) => row.user_id as string),
      ),
    );

    if (recipientUserIds.length === 0) {
      console.log("No admin recipients found for setlist confirmation", {
        draftSetId,
        campusId: setCampusId,
        campusName,
      });
      return new Response(
        JSON.stringify({ success: true, notified: false, reason: "No admin recipients" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Format the notification message
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
      userIds: recipientUserIds,
      // Setlists are a Worship-only feature; scope delivery to worship subscriptions.
      metadata: { resourceAppKey: "worship" },
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
          recipientUserIds,
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
