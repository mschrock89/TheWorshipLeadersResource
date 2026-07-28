import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-resource-app-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Mirrors the canManageTeam role set in useAuth (who sees the Send Push button).
const SENDER_ROLES = new Set([
  "admin",
  "campus_admin",
  "campus_worship_pastor",
  "network_student_pastor",
  "student_pastor",
  "student_worship_pastor",
  "childrens_pastor",
  "network_worship_pastor",
  "network_worship_leader",
  "video_director",
  "production_manager",
]);

// Must stay in sync with the weekend aliases in the notify_new_event() trigger.
const WEEKEND_ALIASES = new Set(["weekend", "weekend_team", "sunday_am"]);

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface NotifyEventPushRequest {
  eventId?: string;
  dryRun?: boolean;
}

function formatEventDate(eventDate: string) {
  const [year, month, day] = eventDate.split("-").map(Number);
  if (!year || !month || !day) return eventDate;
  return `${MONTH_LABELS[month - 1]} ${day}, ${year}`;
}

function formatEventTime(time: string | null) {
  if (!time) return null;
  const [hoursRaw, minutes] = time.split(":");
  const hours = Number(hoursRaw);
  if (Number.isNaN(hours)) return null;
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;
  return `${hour12}:${minutes} ${suffix}`;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = (await req.json()) as NotifyEventPushRequest;
    if (!body.eventId) {
      return new Response(
        JSON.stringify({ error: "eventId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const [roleResult, eventResult] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", user.id),
      supabase
        .from("events")
        .select("id, title, event_date, start_time, end_time, location, campus_id, campus_ids, ministry_type, ministry_types, target_genders, created_by")
        .eq("id", body.eventId)
        .maybeSingle(),
    ]);

    if (roleResult.error) {
      console.error("Failed to load sender roles:", roleResult.error);
      return new Response(
        JSON.stringify({ error: "Failed to verify permissions" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const roles = (roleResult.data || []).map((row) => row.role);
    if (!roles.some((role) => SENDER_ROLES.has(role))) {
      return new Response(
        JSON.stringify({ error: "You do not have permission to send event notifications" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (eventResult.error || !eventResult.data) {
      return new Response(
        JSON.stringify({ error: "Event not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const event = eventResult.data;
    const eventCampusIds: string[] = event.campus_ids?.length
      ? event.campus_ids
      : event.campus_id
        ? [event.campus_id]
        : [];
    const eventMinistryTypes: string[] = event.ministry_types?.length
      ? event.ministry_types
      : event.ministry_type
        ? [event.ministry_type]
        : [];
    const targetGenders = new Set(
      (event.target_genders || [])
        .map((gender: string) => gender.toLowerCase())
        .filter((gender: string) => gender === "male" || gender === "female"),
    );
    const hasWeekendScope = eventMinistryTypes.some((type) => WEEKEND_ALIASES.has(type));

    const ministryMatches = (ministryType: string) =>
      eventMinistryTypes.includes(ministryType) || (hasWeekendScope && WEEKEND_ALIASES.has(ministryType));

    // Resolve recipients the same way the notify_new_event() trigger does.
    const recipientIds = new Set<string>();
    if (eventCampusIds.length > 0 && eventMinistryTypes.length > 0) {
      const { data, error } = await supabase
        .from("user_ministry_campuses")
        .select("user_id, campus_id, ministry_type")
        .in("campus_id", eventCampusIds);
      if (error) throw error;
      for (const row of data || []) {
        if (row.user_id && ministryMatches(row.ministry_type)) recipientIds.add(row.user_id);
      }
    } else if (eventCampusIds.length > 0) {
      const { data, error } = await supabase
        .from("user_campuses")
        .select("user_id")
        .in("campus_id", eventCampusIds);
      if (error) throw error;
      for (const row of data || []) {
        if (row.user_id) recipientIds.add(row.user_id);
      }
    } else if (eventMinistryTypes.length > 0) {
      const { data, error } = await supabase
        .from("user_ministry_campuses")
        .select("user_id, ministry_type");
      if (error) throw error;
      for (const row of data || []) {
        if (row.user_id && ministryMatches(row.ministry_type)) recipientIds.add(row.user_id);
      }
    } else {
      const { data, error } = await supabase
        .from("push_subscriptions")
        .select("user_id")
        .not("user_id", "is", null);
      if (error) throw error;
      for (const row of data || []) {
        if (row.user_id) recipientIds.add(row.user_id);
      }
    }

    recipientIds.delete(user.id);

    const recipientIdList = Array.from(recipientIds);
    const [profilesResult, pushSubsResult] = await Promise.all([
      recipientIdList.length > 0
        ? supabase.from("profiles").select("id, full_name, gender").in("id", recipientIdList)
        : Promise.resolve({ data: [], error: null }),
      recipientIdList.length > 0
        ? supabase.from("push_subscriptions").select("user_id").in("user_id", recipientIdList)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (profilesResult.error || pushSubsResult.error) {
      console.error("Failed to load recipient details:", profilesResult.error || pushSubsResult.error);
      return new Response(
        JSON.stringify({ error: "Failed to resolve recipients" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const pushSubscribedIds = new Set((pushSubsResult.data || []).map((row) => row.user_id));

    const recipients = (profilesResult.data || [])
      .filter((profile) => {
        if (targetGenders.size === 0) return true;
        const gender = (profile.gender || "").toLowerCase();
        return targetGenders.has(gender);
      })
      .map((profile) => ({
        id: profile.id,
        full_name: profile.full_name,
        gender: profile.gender,
        hasPushSubscription: pushSubscribedIds.has(profile.id),
      }))
      .sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));

    if (body.dryRun) {
      return new Response(
        JSON.stringify({
          success: true,
          recipients,
          totalRecipients: recipients.length,
          pushEligibleRecipients: recipients.filter((recipient) => recipient.hasPushSubscription).length,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (recipients.length === 0) {
      return new Response(
        JSON.stringify({ error: "No one matches this event's filters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const timeLabel = formatEventTime(event.start_time);
    const location = (event.location || "").trim();
    const genderLabel = targetGenders.has("male") && !targetGenders.has("female")
      ? " • Men only"
      : targetGenders.has("female") && !targetGenders.has("male")
        ? " • Women only"
        : "";
    const message = `${event.title}${genderLabel} on ${formatEventDate(event.event_date)}${timeLabel ? ` at ${timeLabel}` : ""}${location ? ` • ${location}` : ""}`;

    const pushResponse = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        title: "Event Reminder",
        message,
        url: "/calendar",
        tag: `event-${event.id}-manual-${Date.now()}`,
        userIds: recipients.map((recipient) => recipient.id),
        contextType: "event",
        contextId: event.id,
        createdBy: user.id,
        metadata: {
          eventId: event.id,
          eventDate: event.event_date,
          location: event.location,
          targetGenders: Array.from(targetGenders),
          resourceAppKey: "worship",
        },
      }),
    });

    const pushResult = await pushResponse.json().catch(() => ({}));

    return new Response(
      JSON.stringify({
        success: true,
        recipients: recipients.length,
        pushSent: pushResult.sent || 0,
        pushFailed: pushResult.failed || 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error in notify-event-push:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
