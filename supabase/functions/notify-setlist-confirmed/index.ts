import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizePushMinistryType } from "../_shared/pushMinistryPrefs.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-resource-app-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface NotifyRequest {
  draftSetId: string;
  confirmerId: string;
}

const ADMIN_NOTIFICATION_ROLES = new Set(["admin", "campus_admin"]);
const MINISTRY_SESSION_SUFFIXES = ["_morning", "_afternoon", "_evening"];

function canonicalMinistryType(ministryType: string | null | undefined): string | null {
  if (!ministryType) return null;
  let value = ministryType.trim().toLowerCase();
  for (const suffix of MINISTRY_SESSION_SUFFIXES) {
    if (value.endsWith(suffix)) {
      value = value.slice(0, -suffix.length);
      break;
    }
  }
  return normalizePushMinistryType(value);
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

    // 3. Admins only hear about people they oversee, or setlists they built.
    // Overseeing means a ministry assignment at this campus that matches the set
    // (weekend aliases count as the same ministry). Building the set is draft_sets.created_by.
    const setMinistry = canonicalMinistryType(draftSet.ministry_type as string | null);
    const setCreatedBy = (draftSet.created_by as string | null) || null;

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

    const { data: ministryRows, error: ministryError } = candidateUserIds.length
      ? await supabase
          .from("user_ministry_campuses")
          .select("user_id, campus_id, ministry_type")
          .eq("campus_id", setCampusId)
          .in("user_id", candidateUserIds)
      : { data: [], error: null };

    if (ministryError) {
      console.error("Failed to load admin ministry assignments:", ministryError);
      return new Response(
        JSON.stringify({ error: "Failed to determine notification recipients" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminsOverSetMinistry = new Set<string>();
    for (const row of ministryRows || []) {
      if (!row.user_id) continue;
      if (canonicalMinistryType(row.ministry_type) === setMinistry) {
        adminsOverSetMinistry.add(row.user_id);
      }
    }

    const recipientUserIds = Array.from(
      new Set(
        (adminRoleRows || [])
          .filter((row) => {
            if (!row.user_id || row.user_id === confirmerId) return false;

            const builtThisSet = Boolean(setCreatedBy && row.user_id === setCreatedBy);
            if (builtThisSet) return true;

            if (row.role === "campus_admin" && row.admin_campus_id !== setCampusId) {
              return false;
            }

            return adminsOverSetMinistry.has(row.user_id);
          })
          .map((row) => row.user_id as string),
      ),
    );

    if (recipientUserIds.length === 0) {
      console.log("No admin recipients found for setlist confirmation", {
        draftSetId,
        campusId: setCampusId,
        campusName,
        ministryType: setMinistry,
        createdBy: setCreatedBy,
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
      contextType: "setlist-confirmed",
      contextId: draftSetId,
      // Setlists are a Worship-only feature; scope delivery to worship subscriptions.
      metadata: {
        resourceAppKey: "worship",
        ministryType: draftSet.ministry_type,
        vars: {
          name: confirmerName,
          date: formattedDate,
          campus: campusName || "your campus",
          set_id: draftSetId,
        },
      },
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
