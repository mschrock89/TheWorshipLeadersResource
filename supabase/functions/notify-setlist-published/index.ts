import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotifyRequest {
  draftSetId: string;
  manual?: boolean;
}

const WEEKEND_ALIASES = new Set(["weekend", "sunday_am", "weekend_team"]);
const SUPPORT_MINISTRIES = ["production", "video"] as const;
const LEADERSHIP_ROLES = [
  "admin", "campus_admin", "campus_worship_pastor", "student_worship_pastor", "childrens_pastor",
  "network_worship_pastor", "network_worship_leader", "leader",
  "video_director", "production_manager", "campus_pastor",
];
const MANUAL_NOTIFY_ROLES = new Set(LEADERSHIP_ROLES);
const NETWORK_ADMIN_ROLES = new Set([
  "admin",
  "network_worship_pastor",
  "network_worship_leader",
]);
const CAMPUS_ADMIN_LIKE_ROLES = new Set([
  "admin",
  "campus_admin",
  "campus_worship_pastor",
  "student_pastor",
  "student_worship_pastor",
  "childrens_pastor",
  "network_worship_pastor",
  "network_worship_leader",
]);
const CAMPUS_WIDE_MANUAL_NOTIFY_ROLES = new Set([
  "campus_worship_pastor",
  "student_pastor",
  "student_worship_pastor",
  "childrens_pastor",
  "leader",
  "video_director",
  "production_manager",
  "campus_pastor",
]);

function getServiceDates(planDate: string): string[] {
  const serviceDates = new Set([planDate]);
  const date = new Date(`${planDate}T12:00:00Z`);

  if (Number.isNaN(date.getTime())) {
    return Array.from(serviceDates);
  }

  const dayOfWeek = date.getUTCDay();
  if (dayOfWeek === 6) {
    const sunday = new Date(date);
    sunday.setUTCDate(sunday.getUTCDate() + 1);
    serviceDates.add(sunday.toISOString().slice(0, 10));
  } else if (dayOfWeek === 0) {
    const saturday = new Date(date);
    saturday.setUTCDate(saturday.getUTCDate() - 1);
    serviceDates.add(saturday.toISOString().slice(0, 10));
  }

  return Array.from(serviceDates);
}

function getRelevantMinistryTypes(ministryType: string, includePrimaryMinistry = true): string[] {
  const ministryTypes = new Set<string>(SUPPORT_MINISTRIES);

  if (includePrimaryMinistry) {
    ministryTypes.add(ministryType);
    if (WEEKEND_ALIASES.has(ministryType)) {
      for (const alias of WEEKEND_ALIASES) {
        ministryTypes.add(alias);
      }
    }
  }

  return Array.from(ministryTypes);
}

function memberMatchesRelevantMinistries(
  ministryTypes: string[] | null,
  relevantMinistryTypes: Set<string>,
): boolean {
  if (!ministryTypes || ministryTypes.length === 0) {
    return true;
  }

  return ministryTypes.some((ministryType) => relevantMinistryTypes.has(ministryType));
}

async function filterVolunteerMemberUserIds(
  supabase: ReturnType<typeof createClient>,
  userIds: string[],
): Promise<string[]> {
  const dedupedUserIds = Array.from(new Set(userIds.filter(Boolean)));
  if (dedupedUserIds.length === 0) {
    return [];
  }

  const { data: userRoles, error: rolesError } = await supabase
    .from("user_roles")
    .select("user_id, role")
    .in("user_id", dedupedUserIds);

  if (rolesError) {
    console.error("Error fetching user roles:", rolesError);
    return [];
  }

  const userRolesMap = new Map<string, string[]>();
  for (const userRole of userRoles || []) {
    const existingRoles = userRolesMap.get(userRole.user_id) || [];
    existingRoles.push(userRole.role);
    userRolesMap.set(userRole.user_id, existingRoles);
  }

  return dedupedUserIds.filter((userId) => {
    const roles = userRolesMap.get(userId) || [];
    const hasLeadershipRole = roles.some((role) => LEADERSHIP_ROLES.includes(role));
    const isVolunteer = roles.includes("volunteer") || roles.includes("member");
    return isVolunteer && !hasLeadershipRole;
  });
}

async function getScheduledRecipientUserIds(
  supabase: ReturnType<typeof createClient>,
  draftSet: { campus_id: string | null; plan_date: string; ministry_type: string },
  includePrimaryMinistry = true,
): Promise<string[]> {
  if (!draftSet.campus_id) {
    return [];
  }

  const serviceDates = getServiceDates(draftSet.plan_date);
  const relevantMinistryTypes = new Set(
    getRelevantMinistryTypes(draftSet.ministry_type, includePrimaryMinistry),
  );

  const { data: teamSchedules, error: scheduleError } = await supabase
    .from("team_schedule")
    .select("team_id, ministry_type, campus_id, schedule_date")
    .in("schedule_date", serviceDates)
    .or(`campus_id.eq.${draftSet.campus_id},campus_id.is.null`);

  if (scheduleError) {
    console.error("Error fetching team schedule:", scheduleError);
    return [];
  }

  const matchingTeamIds = Array.from(
    new Set(
      (teamSchedules || [])
        .filter((schedule) => {
          if (!schedule.team_id) {
            return false;
          }

          if (schedule.ministry_type == null) {
            return includePrimaryMinistry;
          }

          return relevantMinistryTypes.has(schedule.ministry_type);
        })
        .map((schedule) => schedule.team_id),
    ),
  );

  if (matchingTeamIds.length === 0) {
    return [];
  }

  const { data: rotationPeriods, error: rotationError } = await supabase
    .from("rotation_periods")
    .select("id")
    .eq("campus_id", draftSet.campus_id)
    .lte("start_date", draftSet.plan_date)
    .gte("end_date", draftSet.plan_date);

  if (rotationError) {
    console.error("Error fetching rotation periods:", rotationError);
    return [];
  }

  const rotationPeriodIds = (rotationPeriods || []).map((rotationPeriod) => rotationPeriod.id);

  const teamMembersQuery = supabase
    .from("team_members")
    .select("user_id, ministry_types")
    .in("team_id", matchingTeamIds)
    .not("user_id", "is", null);

  const { data: teamMembers, error: membersError } = rotationPeriodIds.length > 0
    ? await teamMembersQuery.or(
        `rotation_period_id.is.null,rotation_period_id.in.(${rotationPeriodIds.join(",")})`,
      )
    : await teamMembersQuery.is("rotation_period_id", null);

  if (membersError) {
    console.error("Error fetching team members:", membersError);
    return [];
  }

  const potentialUserIds = (teamMembers || [])
    .filter((member) => memberMatchesRelevantMinistries(member.ministry_types, relevantMinistryTypes))
    .map((member) => member.user_id)
    .filter(Boolean) as string[];

  return filterVolunteerMemberUserIds(supabase, potentialUserIds);
}

async function verifyManualNotifyPermission(
  supabase: ReturnType<typeof createClient>,
  supabaseUrl: string,
  supabaseAnonKey: string,
  authHeader: string | null,
  campusId: string | null,
): Promise<{ allowed: true } | { allowed: false; status: number; error: string }> {
  if (!authHeader?.startsWith("Bearer ")) {
    return { allowed: false, status: 401, error: "Missing authorization header" };
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();

  if (userError || !user) {
    return { allowed: false, status: 401, error: "Unauthorized" };
  }

  const [roleResult, campusResult] = await Promise.all([
    supabase
      .from("user_roles")
      .select("role, admin_campus_id")
      .eq("user_id", user.id),
    supabase
      .from("user_campuses")
      .select("campus_id")
      .eq("user_id", user.id),
  ]);

  if (roleResult.error || campusResult.error) {
    console.error("Failed to verify manual setlist notification permission:", {
      roleError: roleResult.error,
      campusError: campusResult.error,
    });
    return { allowed: false, status: 500, error: "Failed to verify notification permissions" };
  }

  const roleRows = roleResult.data || [];
  const userCampusIds = new Set((campusResult.data || []).map((row) => row.campus_id).filter(Boolean));
  const hasManualNotifyRole = roleRows.some((row) => MANUAL_NOTIFY_ROLES.has(row.role));
  const hasNetworkAccess = roleRows.some((row) => NETWORK_ADMIN_ROLES.has(row.role));
  const hasCampusAdminLikeAccess = roleRows.some((row) =>
    CAMPUS_ADMIN_LIKE_ROLES.has(row.role) &&
    (
      row.role !== "campus_admin" ||
      !campusId ||
      row.admin_campus_id === campusId
    ),
  );
  const hasCampusWideManagerRole = roleRows.some((row) =>
    CAMPUS_WIDE_MANUAL_NOTIFY_ROLES.has(row.role),
  );
  const hasCampusAccess =
    hasNetworkAccess ||
    hasCampusAdminLikeAccess ||
    hasCampusWideManagerRole ||
    !campusId ||
    userCampusIds.has(campusId) ||
    roleRows.some((row) => row.role === "campus_admin" && row.admin_campus_id === campusId);

  if (!hasManualNotifyRole || !hasCampusAccess) {
    return {
      allowed: false,
      status: 403,
      error: "You do not have permission to send this setlist notification",
    };
  }

  return { allowed: true };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    const { draftSetId, manual = false }: NotifyRequest = await req.json();

    if (!draftSetId) {
      return new Response(
        JSON.stringify({ error: "draftSetId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Get the draft set details
    const { data: draftSet, error: draftSetError } = await supabase
      .from("draft_sets")
      .select(`
        id,
        campus_id,
        custom_service_id,
        plan_date,
        ministry_type,
        notes,
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

    if (manual) {
      const permission = await verifyManualNotifyPermission(
        supabase,
        supabaseUrl,
        supabaseAnonKey,
        req.headers.get("authorization") ?? req.headers.get("Authorization"),
        draftSet.campus_id,
      );

      if (!permission.allowed) {
        return new Response(
          JSON.stringify({ error: permission.error }),
          { status: permission.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // 2. Get the songs in this setlist
    const { data: setlistSongs, error: songsError } = await supabase
      .from("draft_set_songs")
      .select(`
        sequence_order,
        songs(title)
      `)
      .eq("draft_set_id", draftSetId)
      .order("sequence_order");

    if (songsError) {
      console.error("Error fetching setlist songs:", songsError);
    }

    const songCount = setlistSongs?.length || 0;
    const songTitles = (setlistSongs || [])
      .map((setlistSong) => (setlistSong.songs as { title?: string } | null)?.title)
      .filter((title): title is string => Boolean(title));

    // 3. Build notification recipient list
    let userIdsToNotify: string[] = [];

    if (draftSet.ministry_type === "audition") {
      const { data: assignments, error: assignmentError } = await supabase
        .from("audition_setlist_assignments")
        .select("user_id")
        .eq("draft_set_id", draftSetId);

      if (assignmentError) {
        console.error("Error fetching audition assignments:", assignmentError);
      }

      userIdsToNotify = Array.from(
        new Set((assignments || []).map((assignment) => assignment.user_id).filter(Boolean))
      ) as string[];
    } else if (draftSet.custom_service_id) {
      const { data: assignments, error: assignmentsError } = await supabase
        .from("custom_service_assignments")
        .select("user_id")
        .eq("custom_service_id", draftSet.custom_service_id)
        .eq("assignment_date", draftSet.plan_date);

      if (assignmentsError) {
        console.error("Error fetching custom service assignments:", assignmentsError);
      }

      const supportUserIds = await getScheduledRecipientUserIds(supabase, draftSet, false);

      userIdsToNotify = Array.from(
        new Set((assignments || []).map((a) => a.user_id).filter(Boolean))
      ) as string[];
      userIdsToNotify = await filterVolunteerMemberUserIds(
        supabase,
        [...userIdsToNotify, ...supportUserIds],
      );
    } else {
      userIdsToNotify = await getScheduledRecipientUserIds(supabase, draftSet);
    }

    // Final guard across ALL set types:
    // only notify users who are actually on this set's roster.
    if (userIdsToNotify.length > 0) {
      const dedupedUserIds = Array.from(new Set(userIdsToNotify));
      const rosterChecks = await Promise.all(
        dedupedUserIds.map(async (userId) => {
          const { data, error } = await supabase.rpc("is_user_on_setlist_roster", {
            p_draft_set_id: draftSetId,
            p_user_id: userId,
          });

          if (error) {
            console.error("Final roster check failed for user", userId, error);
            return null;
          }

          return data ? userId : null;
        })
      );

      userIdsToNotify = rosterChecks.filter(Boolean) as string[];
    }

    console.log(`Found ${userIdsToNotify.length} team members to notify for setlist ${draftSetId}`);

    // 7. Always create setlist playlist for published setlists
    // Audio resolution happens on the client side using album_tracks matching
    // so we create the playlist regardless of songs.audio_url status
    const { error: playlistError } = await supabase
      .from("setlist_playlists")
      .upsert({
        draft_set_id: draftSetId,
        campus_id: draftSet.campus_id,
        service_date: draftSet.plan_date,
        ministry_type: draftSet.ministry_type,
      }, { onConflict: "draft_set_id" });

    if (playlistError) {
      console.error("Error creating setlist playlist:", playlistError);
    } else {
      console.log(`Created setlist playlist for ${draftSetId}`);
    }

    // 8. Send push notifications via OneSignal
    let pushSent = 0;
    let pushFailed = 0;

    if (userIdsToNotify.length > 0) {
      const campusName = (draftSet.campuses as { name?: string } | null)?.name || "";
      const formattedDate = new Date(draftSet.plan_date).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });

      const songSummary = songTitles.length > 0
        ? `${songTitles.slice(0, 3).join(", ")}${songTitles.length > 3 ? ` +${songTitles.length - 3} more` : ""}`
        : `${songCount} song${songCount === 1 ? "" : "s"}`;
      const notificationPayload = {
        title: manual ? "Setlist Reminder" : "New Setlist Published",
        message: manual
          ? `${formattedDate}${campusName ? ` at ${campusName}` : ""}: ${songSummary}`
          : `${songCount} songs for ${formattedDate}${campusName ? ` at ${campusName}` : ""}`,
        url: `/my-setlists?setId=${draftSetId}`,
        tag: manual ? `setlist-manual-${draftSetId}-${Date.now()}` : `setlist-${draftSetId}`,
        userIds: userIdsToNotify,
        contextType: manual ? "setlist-manual-reminder" : "setlist-published",
        contextId: draftSetId,
        metadata: {
          draftSetId,
          campusId: draftSet.campus_id,
          planDate: draftSet.plan_date,
          ministryType: draftSet.ministry_type,
          manual,
        },
      };

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
        pushSent = pushResult.sent || 0;
        pushFailed = pushResult.failed || 0;
      } catch (error) {
        console.error("Error calling send-push-notification:", error);
      }
    }

    // 9. Create in-app notifications (insert into a notifications concept if exists)
    // For now, the published set itself serves as the notification via the My Setlists page

    return new Response(
      JSON.stringify({
        success: true,
        teamMembersNotified: userIdsToNotify.length,
        pushSent,
        pushFailed,
        draftSetId,
        planDate: draftSet.plan_date,
        ministryType: draftSet.ministry_type,
        playlistCreated: true,
        manual,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in notify-setlist-published:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
