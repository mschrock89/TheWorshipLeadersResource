import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveSupportTeamNotificationUserIds } from "../_shared/supportTeamNotificationRecipients.ts";
import {
  buildSupportTeamPushContent,
  getSupportTeamPushTag,
  resolveSetlistConfirmLink,
} from "../_shared/supportTeamPushContent.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-resource-app-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ADMIN_LIKE_ROLES = new Set([
  "admin",
  "campus_admin",
  "campus_worship_pastor",
  "student_worship_pastor",
  "childrens_pastor",
  "network_worship_pastor",
  "network_worship_leader",
]);


interface NotifyScheduleRequest {
  scheduleDate: string;
  campusId: string;
  ministryType: "production" | "video";
  teamId?: string | null;
  previewOnly?: boolean;
}

interface RecipientPreview {
  userId: string;
  name: string;
  hasPushSubscription: boolean;
}

async function buildRecipientPreview(
  supabase: ReturnType<typeof createClient>,
  userIds: string[],
): Promise<RecipientPreview[]> {
  const dedupedUserIds = Array.from(new Set(userIds.filter(Boolean)));
  if (dedupedUserIds.length === 0) {
    return [];
  }

  const [{ data: profiles, error: profilesError }, { data: subscriptions, error: subscriptionsError }] =
    await Promise.all([
      supabase.from("profiles").select("id, full_name").in("id", dedupedUserIds),
      supabase.from("push_subscriptions").select("user_id").in("user_id", dedupedUserIds),
    ]);

  if (profilesError) {
    console.error("Error fetching schedule notification recipient profiles:", profilesError);
  }
  if (subscriptionsError) {
    console.error("Error fetching schedule notification recipient push subscriptions:", subscriptionsError);
  }

  const profileNameById = new Map(
    (profiles || []).map((profile) => [profile.id, profile.full_name || "Team Member"]),
  );
  const pushEnabledUserIds = new Set(
    (subscriptions || []).map((subscription) => subscription.user_id).filter(Boolean),
  );

  return dedupedUserIds
    .map((userId) => ({
      userId,
      name: profileNameById.get(userId) || "Team Member",
      hasPushSubscription: pushEnabledUserIds.has(userId),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
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

    const { scheduleDate, campusId, ministryType, teamId, previewOnly = false }: NotifyScheduleRequest =
      await req.json();

    if (!scheduleDate || !campusId || !ministryType) {
      return new Response(
        JSON.stringify({ error: "scheduleDate, campusId, and ministryType are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (ministryType !== "production" && ministryType !== "video") {
      return new Response(
        JSON.stringify({ error: "Only production or video schedule notifications are supported" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const [
      roleResult,
      userCampusesResult,
      campusResult,
      senderProfileResult,
    ] = await Promise.all([
      supabase
        .from("user_roles")
        .select("role, admin_campus_id")
        .eq("user_id", user.id),
      supabase
        .from("user_campuses")
        .select("campus_id")
        .eq("user_id", user.id),
      supabase
        .from("campuses")
        .select("name, has_saturday_service, has_sunday_service")
        .eq("id", campusId)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle(),
    ]);

    if (roleResult.error || userCampusesResult.error || campusResult.error || senderProfileResult.error) {
      console.error("Failed to load notification sender context:", {
        roleError: roleResult.error,
        userCampusesError: userCampusesResult.error,
        campusError: campusResult.error,
        senderProfileError: senderProfileResult.error,
      });
      return new Response(
        JSON.stringify({ error: "Failed to verify notification permissions" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const roleRows = roleResult.data || [];
    const roleNames = roleRows.map((row) => row.role);
    const userCampusIds = new Set((userCampusesResult.data || []).map((row) => row.campus_id).filter(Boolean));
    const isAdminLike = roleRows.some((row) =>
      ADMIN_LIKE_ROLES.has(row.role) &&
      (
        row.role !== "campus_admin" ||
        row.admin_campus_id === campusId
      ),
    );
    const hasCampusAccess = isAdminLike || userCampusIds.has(campusId);
    const hasMinistryAccess =
      (ministryType === "production" && roleNames.includes("production_manager")) ||
      (
        ministryType === "video" &&
        (roleNames.includes("video_director") || roleNames.includes("production_manager"))
      );

    if (!hasCampusAccess || (!isAdminLike && !hasMinistryAccess)) {
      return new Response(
        JSON.stringify({ error: "You do not have permission to send this schedule notification" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const scheduleQuery = supabase
      .from("team_schedule")
      .select("team_id, rotation_period, resource_app_key, worship_teams(name)")
      .eq("schedule_date", scheduleDate)
      .eq("ministry_type", ministryType)
      .or(`campus_id.eq.${campusId},campus_id.is.null`);

    const { data: scheduleRows, error: scheduleError } = teamId
      ? await scheduleQuery.eq("team_id", teamId)
      : await scheduleQuery;

    if (scheduleError) {
      console.error("Failed to load schedule rows:", scheduleError);
      return new Response(
        JSON.stringify({ error: "Failed to load the scheduled team" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const matchedSchedules = (scheduleRows || []).filter((row) => row.team_id);
    if (matchedSchedules.length === 0) {
      return new Response(
        JSON.stringify({ error: "No scheduled team found for that date" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const teamIds = Array.from(new Set(matchedSchedules.map((row) => row.team_id)));
    const teamName =
      ((matchedSchedules[0]?.worship_teams as { name?: string } | null)?.name || "Team");
    const resolvedTeamId = teamId || teamIds[0] || null;
    const rotationPeriodName = matchedSchedules[0]?.rotation_period || null;

    if (!resolvedTeamId) {
      return new Response(
        JSON.stringify(
          previewOnly
            ? { success: true, previewOnly: true, recipients: [] }
            : { success: true, recipients: 0, pushSent: 0 },
        ),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const campusWeekendConfig = campusResult.data
      ? {
        has_saturday_service: campusResult.data.has_saturday_service,
        has_sunday_service: campusResult.data.has_sunday_service,
      }
      : null;

    let recipientUserIds: string[] = [];
    try {
      recipientUserIds = await resolveSupportTeamNotificationUserIds(supabase, {
        scheduleDate,
        campusId,
        ministryType,
        teamId: resolvedTeamId,
        rotationPeriodName,
        campus: campusWeekendConfig,
      });
    } catch (resolveError) {
      console.error("Failed to resolve schedule notification recipients:", resolveError);
      return new Response(
        JSON.stringify({ error: "Failed to load scheduled team members" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (recipientUserIds.length === 0) {
      return new Response(
        JSON.stringify(
          previewOnly
            ? { success: true, previewOnly: true, recipients: [] }
            : { success: true, recipients: 0, pushSent: 0 },
        ),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (previewOnly) {
      const recipients = await buildRecipientPreview(supabase, recipientUserIds);
      const pushRecipientUserCount = recipients.filter((recipient) => recipient.hasPushSubscription).length;
      const confirmLink = await resolveSetlistConfirmLink(supabase, {
        campusId,
        scheduleDate,
        campus: campusWeekendConfig,
      });
      const pushPreview = buildSupportTeamPushContent({
        ministryType,
        teamName,
        scheduleDate,
        campus: campusWeekendConfig,
        confirmLink,
      });

      return new Response(
        JSON.stringify({
          success: true,
          previewOnly: true,
          recipients,
          recipientCount: recipients.length,
          pushRecipientUserCount,
          pushPreview,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const confirmLink = await resolveSetlistConfirmLink(supabase, {
      campusId,
      scheduleDate,
      campus: campusWeekendConfig,
    });
    const pushContent = buildSupportTeamPushContent({
      ministryType,
      teamName,
      scheduleDate,
      campus: campusWeekendConfig,
      confirmLink,
    });
    const { title, message, link, actions } = pushContent;

    let pushSent = 0;
    let pushFailed = 0;
    let pushError: string | null = null;
    try {
      const pushResponse = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          title,
          message,
          url: link,
          actions,
          tag: getSupportTeamPushTag({ ministryType, campusId, scheduleDate }),
          userIds: recipientUserIds,
          contextType: "team-schedule-date",
          // Scope delivery to the app this scheduled team belongs to.
          metadata: { resourceAppKey: matchedSchedules[0]?.resource_app_key || "worship" },
        }),
      });

      if (!pushResponse.ok) {
        pushError = `send-push-notification returned ${pushResponse.status}`;
        const text = await pushResponse.text();
        console.error(`Schedule push failed: ${pushResponse.status} ${text}`);
      } else {
        const pushResult = await pushResponse.json();
        pushSent = pushResult.sent || 0;
        pushFailed = pushResult.failed || 0;
      }
    } catch (error) {
      pushError = error instanceof Error ? error.message : "Unknown error";
      console.error("Failed to send schedule push notification:", error);
    }

    const { error: insertError } = await supabase
      .from("manual_team_schedule_notifications")
      .insert(
        recipientUserIds.map((recipientUserId) => ({
          user_id: recipientUserId,
          sent_by_user_id: user.id,
          schedule_date: scheduleDate,
          campus_id: campusId,
          team_id: matchedSchedules[0]?.team_id || null,
          ministry_type: ministryType,
          title,
          message,
          link,
        })),
      );

    if (insertError) {
      console.error("Failed to save manual team schedule notifications:", insertError);
      return new Response(
        JSON.stringify({ error: "Push sent, but in-app notifications could not be saved" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        recipients: recipientUserIds.length,
        pushSent,
        pushFailed,
        pushError,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error in notify-team-schedule-date:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
