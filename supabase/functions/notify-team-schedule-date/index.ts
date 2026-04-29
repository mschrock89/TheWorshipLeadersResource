import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LEADERSHIP_ROLES = new Set([
  "admin",
  "campus_admin",
  "campus_worship_pastor",
  "student_worship_pastor",
  "network_worship_pastor",
  "network_worship_leader",
  "leader",
  "video_director",
  "production_manager",
  "campus_pastor",
]);

const ADMIN_LIKE_ROLES = new Set([
  "admin",
  "campus_admin",
  "campus_worship_pastor",
  "student_worship_pastor",
  "network_worship_pastor",
  "network_worship_leader",
]);

const MINISTRY_LABELS: Record<string, string> = {
  production: "Production",
  video: "Video",
};

interface NotifyScheduleRequest {
  scheduleDate: string;
  campusId: string;
  ministryType: "production" | "video";
  teamId?: string | null;
}

function formatDateLabel(dateStr: string) {
  return new Date(`${dateStr}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
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

    const { scheduleDate, campusId, ministryType, teamId }: NotifyScheduleRequest = await req.json();

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
        .select("name")
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
      (ministryType === "video" && roleNames.includes("video_director"));

    if (!hasCampusAccess || (!isAdminLike && !hasMinistryAccess)) {
      return new Response(
        JSON.stringify({ error: "You do not have permission to send this schedule notification" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const scheduleQuery = supabase
      .from("team_schedule")
      .select("team_id, worship_teams(name)")
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

    const { data: rotationPeriods, error: rotationError } = await supabase
      .from("rotation_periods")
      .select("id")
      .eq("campus_id", campusId)
      .lte("start_date", scheduleDate)
      .gte("end_date", scheduleDate);

    if (rotationError) {
      console.error("Failed to load rotation periods:", rotationError);
      return new Response(
        JSON.stringify({ error: "Failed to load the active rotation period" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const rotationIds = (rotationPeriods || []).map((row) => row.id);
    const membersQuery = supabase
      .from("team_members")
      .select("user_id, ministry_types")
      .in("team_id", teamIds)
      .not("user_id", "is", null);

    const { data: teamMembers, error: membersError } = rotationIds.length > 0
      ? await membersQuery.or(
          `rotation_period_id.is.null,rotation_period_id.in.(${rotationIds.join(",")})`,
        )
      : await membersQuery.is("rotation_period_id", null);

    if (membersError) {
      console.error("Failed to load team members:", membersError);
      return new Response(
        JSON.stringify({ error: "Failed to load scheduled team members" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const potentialUserIds = Array.from(
      new Set(
        (teamMembers || [])
          .filter((member) => {
            if (!member.user_id) {
              return false;
            }

            if (!member.ministry_types || member.ministry_types.length === 0) {
              return true;
            }

            return member.ministry_types.includes(ministryType);
          })
          .map((member) => member.user_id),
      ),
    );

    if (potentialUserIds.length === 0) {
      return new Response(
        JSON.stringify({ success: true, recipients: 0, pushSent: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: recipientRoles, error: recipientRolesError } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", potentialUserIds);

    if (recipientRolesError) {
      console.error("Failed to load recipient roles:", recipientRolesError);
      return new Response(
        JSON.stringify({ error: "Failed to verify recipients" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const rolesByUser = new Map<string, string[]>();
    for (const row of recipientRoles || []) {
      const next = rolesByUser.get(row.user_id) || [];
      next.push(row.role);
      rolesByUser.set(row.user_id, next);
    }

    const recipientUserIds = potentialUserIds.filter((userId) => {
      const roles = rolesByUser.get(userId) || [];
      const hasLeadershipRole = roles.some((role) => LEADERSHIP_ROLES.has(role));
      const isVolunteer = roles.includes("volunteer") || roles.includes("member");
      return isVolunteer && !hasLeadershipRole;
    });

    if (recipientUserIds.length === 0) {
      return new Response(
        JSON.stringify({ success: true, recipients: 0, pushSent: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const ministryLabel = MINISTRY_LABELS[ministryType] || ministryType;
    const campusName = campusResult.data?.name || "Campus";
    const senderName = senderProfileResult.data?.full_name?.trim() || "Your team lead";
    const formattedDate = formatDateLabel(scheduleDate);
    const title = `${campusName} ${ministryLabel} Team Update`;
    const message = `${senderName} sent a reminder for ${teamName} on ${formattedDate}. Open Calendar to view your schedule.`;
    const link = "/calendar";

    let pushSent = 0;
    let pushFailed = 0;
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
          tag: `schedule-date-${ministryType}-${campusId}-${scheduleDate}`,
          userIds: recipientUserIds,
        }),
      });

      const pushResult = await pushResponse.json();
      pushSent = pushResult.sent || 0;
      pushFailed = pushResult.failed || 0;
    } catch (error) {
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
