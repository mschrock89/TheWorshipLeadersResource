import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotifyWeekendTrackRequest {
  playlistId: string;
  referenceTrackId: string;
  trackTitle: string;
}

const WEEKEND_ALIASES = new Set(["weekend", "sunday_am", "weekend_team"]);
const LEADERSHIP_ROLES = [
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
];

interface TeamScheduleRow {
  team_id: string | null;
  ministry_type: string | null;
  campus_id: string | null;
  created_at?: string | null;
}

interface TeamMemberRow {
  user_id: string | null;
  member_name: string;
  position: string;
  position_slot: string | null;
  ministry_types: string[] | null;
  service_day?: string | null;
}

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

function getRelevantPrimaryMinistryTypes(ministryType: string): string[] {
  const ministryTypes = new Set<string>([ministryType]);
  if (WEEKEND_ALIASES.has(ministryType)) {
    for (const alias of WEEKEND_ALIASES) {
      ministryTypes.add(alias);
    }
  }
  return Array.from(ministryTypes);
}

function getServiceDayForDate(dateStr: string): "saturday" | "sunday" | null {
  const dayOfWeek = new Date(`${dateStr}T00:00:00`).getDay();
  if (dayOfWeek === 6) return "saturday";
  if (dayOfWeek === 0) return "sunday";
  return null;
}

function assignmentMatchesServiceDay(
  assignment: { service_day?: string | null } | { serviceDay?: string | null },
  dateStr: string,
): boolean {
  const rawServiceDay = "service_day" in assignment ? assignment.service_day : assignment.serviceDay;
  if (!rawServiceDay) return true;

  const serviceDay = rawServiceDay.toLowerCase();
  if (serviceDay === "both" || serviceDay === "weekend") return true;

  const dateServiceDay = getServiceDayForDate(dateStr);
  if (!dateServiceDay) return true;

  return serviceDay === dateServiceDay;
}

function ministryMatchesPrimaryRosterFilter(
  ministryTypes: string[] | null,
  ministryType: string,
): boolean {
  if (!ministryTypes || ministryTypes.length === 0) {
    return true;
  }

  if (WEEKEND_ALIASES.has(ministryType)) {
    return ministryTypes.some((value) => WEEKEND_ALIASES.has(value));
  }

  return ministryTypes.includes(ministryType);
}

function normalizePositionValue(value: string | null | undefined): string {
  return (value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function getPositionAliases(position: string | null | undefined, positionSlot?: string | null): string[] {
  const aliases = new Set<string>();

  if (position) {
    aliases.add(position);
  }

  if (positionSlot) {
    aliases.add(positionSlot);

    if (positionSlot.startsWith("eg_")) {
      const slotNumber = positionSlot.split("_")[1];
      aliases.add(`electric_${slotNumber}`);
      aliases.add(`electric_guitar`);
      aliases.add(`EG ${slotNumber}`);
    }

    if (positionSlot.startsWith("ag_")) {
      const slotNumber = positionSlot.split("_")[1];
      aliases.add(`acoustic_${slotNumber}`);
      aliases.add(`acoustic_guitar`);
      aliases.add(`AG ${slotNumber}`);
    }
  }

  if (position) {
    const normalized = normalizePositionValue(position);
    if (normalized === "electric_guitar") {
      aliases.add("electric_guitar");
    }
    if (normalized.startsWith("electric_")) {
      const slotNumber = normalized.split("_")[1];
      aliases.add(`eg_${slotNumber}`);
      aliases.add(`EG ${slotNumber}`);
      aliases.add("electric_guitar");
    }
    if (normalized === "acoustic_guitar") {
      aliases.add("acoustic_guitar");
    }
    if (normalized.startsWith("acoustic_")) {
      const slotNumber = normalized.split("_")[1];
      aliases.add(`ag_${slotNumber}`);
      aliases.add(`AG ${slotNumber}`);
      aliases.add("acoustic_guitar");
    }
  }

  return Array.from(aliases);
}

function getAssignmentKeys(
  userId: string,
  position: string | null | undefined,
  positionSlot?: string | null,
): string[] {
  if (!userId) return [];

  return getPositionAliases(position, positionSlot).map(
    (alias) => `${userId}|${normalizePositionValue(alias)}`,
  );
}

function resolveScheduledTeamEntry(
  entries: TeamScheduleRow[],
  campusId: string,
  ministryType: string,
): TeamScheduleRow | null {
  const relevantMinistries = new Set(getRelevantPrimaryMinistryTypes(ministryType));
  const sortedEntries = [...entries].sort((a, b) => {
    const aCampusPriority = a.campus_id === campusId ? 2 : a.campus_id === null ? 1 : 0;
    const bCampusPriority = b.campus_id === campusId ? 2 : b.campus_id === null ? 1 : 0;

    if (aCampusPriority !== bCampusPriority) {
      return bCampusPriority - aCampusPriority;
    }

    const aCreatedAt = new Date(a.created_at || 0).getTime();
    const bCreatedAt = new Date(b.created_at || 0).getTime();
    return bCreatedAt - aCreatedAt;
  });

  return sortedEntries.find((entry) =>
    entry.ministry_type != null && relevantMinistries.has(entry.ministry_type),
  ) || sortedEntries.find((entry) => entry.ministry_type == null) || null;
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

async function getPrimaryScheduledRosterUserIds(
  supabase: ReturnType<typeof createClient>,
  draftSet: { campus_id: string | null; plan_date: string; ministry_type: string },
): Promise<string[]> {
  if (!draftSet.campus_id) {
    return [];
  }

  const serviceDates = getServiceDates(draftSet.plan_date);
  const relevantMinistryTypes = new Set(getRelevantPrimaryMinistryTypes(draftSet.ministry_type));

  const { data: teamSchedules, error: scheduleError } = await supabase
    .from("team_schedule")
    .select("team_id, ministry_type, campus_id, created_at")
    .eq("schedule_date", draftSet.plan_date)
    .or(`campus_id.eq.${draftSet.campus_id},campus_id.is.null`);

  if (scheduleError) {
    console.error("Error fetching team schedule:", scheduleError);
    return [];
  }

  const scheduledTeam = resolveScheduledTeamEntry((teamSchedules || []) as TeamScheduleRow[], draftSet.campus_id, draftSet.ministry_type);
  if (!scheduledTeam?.team_id) {
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
    .select("user_id, member_name, position, position_slot, ministry_types, service_day")
    .eq("team_id", scheduledTeam.team_id)
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

  let filteredMembers = ((teamMembers || []) as TeamMemberRow[])
    .filter((member) => assignmentMatchesServiceDay(member, draftSet.plan_date))
    .filter((member) => ministryMatchesPrimaryRosterFilter(member.ministry_types, draftSet.ministry_type));

  let overrideQuery = supabase
    .from("team_member_date_overrides")
    .select("user_id, member_name, position, position_slot, ministry_types, schedule_date")
    .eq("team_id", scheduledTeam.team_id)
    .eq("schedule_date", draftSet.plan_date);

  if (rotationPeriodIds.length > 0) {
    overrideQuery = overrideQuery.in("rotation_period_id", rotationPeriodIds);
  } else {
    overrideQuery = overrideQuery.is("rotation_period_id", null);
  }

  const { data: dateOverrides, error: overrideError } = await overrideQuery;

  if (overrideError) {
    console.error("Error fetching team member date overrides:", overrideError);
    return [];
  }

  const overrides = (dateOverrides || []) as TeamMemberRow[];
  const overrideBySlot = new Map(overrides.map((override) => [override.position_slot, override]));
  filteredMembers = filteredMembers
    .filter((member) => !member.position_slot || !overrideBySlot.has(member.position_slot))
    .concat(
      overrides.filter((override) =>
        ministryMatchesPrimaryRosterFilter(override.ministry_types, draftSet.ministry_type),
      ),
    );

  const memberByAssignmentKey = new Map<string, TeamMemberRow>();
  const teamMemberUserIds = new Set<string>();
  for (const member of filteredMembers) {
    if (!member.user_id) continue;
    teamMemberUserIds.add(member.user_id);
    for (const key of getAssignmentKeys(member.user_id, member.position, member.position_slot)) {
      memberByAssignmentKey.set(key, member);
    }
  }

  const { data: swapsForDate, error: swapsForDateError } = await supabase
    .from("swap_requests")
    .select("requester_id, accepted_by_id, position, swap_date")
    .in("original_date", serviceDates)
    .eq("team_id", scheduledTeam.team_id)
    .eq("status", "accepted");

  if (swapsForDateError) {
    console.error("Error fetching original-date swaps:", swapsForDateError);
    return [];
  }

  const { data: swapsOnDate, error: swapsOnDateError } = await supabase
    .from("swap_requests")
    .select("requester_id, accepted_by_id, position, original_date")
    .in("swap_date", serviceDates)
    .eq("status", "accepted")
    .not("swap_date", "is", null);

  if (swapsOnDateError) {
    console.error("Error fetching swap-date swaps:", swapsOnDateError);
    return [];
  }

  const filteredSwapsOnDate = (swapsOnDate || []).filter(
    (swap) => swap.accepted_by_id && teamMemberUserIds.has(swap.accepted_by_id),
  );

  const swappedOutAssignments = new Set<string>();
  const swappedInUserIds = new Set<string>();

  for (const swap of swapsForDate || []) {
    if (!swap.requester_id) continue;
    const assignmentKeys = getAssignmentKeys(swap.requester_id, swap.position);
    const matchedMember = assignmentKeys.map((key) => memberByAssignmentKey.get(key)).find(Boolean) || null;
    if (!matchedMember) continue;
    assignmentKeys.forEach((key) => swappedOutAssignments.add(key));
    if (swap.accepted_by_id) {
      swappedInUserIds.add(swap.accepted_by_id);
    }
  }

  for (const swap of filteredSwapsOnDate || []) {
    if (!swap.accepted_by_id) continue;
    const assignmentKeys = getAssignmentKeys(swap.accepted_by_id, swap.position);
    const matchedMember = assignmentKeys.map((key) => memberByAssignmentKey.get(key)).find(Boolean) || null;
    if (!matchedMember) continue;
    assignmentKeys.forEach((key) => swappedOutAssignments.add(key));
    if (swap.requester_id) {
      swappedInUserIds.add(swap.requester_id);
    }
  }

  const scheduledUserIds = new Set<string>();
  for (const member of filteredMembers) {
    if (!member.user_id) continue;
    const swappedOut = getAssignmentKeys(member.user_id, member.position, member.position_slot)
      .some((key) => swappedOutAssignments.has(key));
    if (!swappedOut) {
      scheduledUserIds.add(member.user_id);
    }
  }

  for (const swappedInUserId of swappedInUserIds) {
    scheduledUserIds.add(swappedInUserId);
  }

  return filterVolunteerMemberUserIds(supabase, Array.from(scheduledUserIds));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
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

    const { playlistId, referenceTrackId, trackTitle }: NotifyWeekendTrackRequest = await req.json();

    if (!playlistId || !referenceTrackId || !trackTitle?.trim()) {
      return new Response(
        JSON.stringify({ error: "playlistId, referenceTrackId, and trackTitle are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: playlist, error: playlistError } = await supabase
      .from("setlist_playlists")
      .select(`
        id,
        draft_set_id,
        campus_id,
        service_date,
        ministry_type,
        campuses(name),
        draft_sets(
          id,
          campus_id,
          custom_service_id,
          plan_date,
          ministry_type
        )
      `)
      .eq("id", playlistId)
      .maybeSingle();

    if (playlistError || !playlist) {
      console.error("Playlist not found:", playlistError);
      return new Response(
        JSON.stringify({ error: "Playlist not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const draftSet = playlist.draft_sets;
    if (!draftSet?.id) {
      return new Response(
        JSON.stringify({ error: "Playlist is not linked to a published set" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: trackRecord, error: trackError } = await supabase
      .from("setlist_playlist_reference_tracks")
      .select("id, created_by")
      .eq("id", referenceTrackId)
      .eq("playlist_id", playlistId)
      .maybeSingle();

    if (trackError || !trackRecord) {
      console.error("Reference track not found:", trackError);
      return new Response(
        JSON.stringify({ error: "Reference track not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (trackRecord.created_by && trackRecord.created_by !== user.id) {
      return new Response(
        JSON.stringify({ error: "You can only notify for tracks you uploaded" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let userIdsToNotify: string[] = [];

    if (draftSet.ministry_type === "audition") {
      const { data: assignments, error: assignmentError } = await supabase
        .from("audition_setlist_assignments")
        .select("user_id")
        .eq("draft_set_id", draftSet.id);

      if (assignmentError) {
        console.error("Error fetching audition assignments:", assignmentError);
      }

      userIdsToNotify = Array.from(
        new Set((assignments || []).map((assignment) => assignment.user_id).filter(Boolean)),
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

      userIdsToNotify = Array.from(
        new Set((assignments || []).map((assignment) => assignment.user_id).filter(Boolean)),
      ) as string[];
      userIdsToNotify = await filterVolunteerMemberUserIds(supabase, userIdsToNotify);
    } else {
      userIdsToNotify = await getPrimaryScheduledRosterUserIds(supabase, draftSet);
    }

    userIdsToNotify = Array.from(new Set(userIdsToNotify)).filter((userId) => userId !== user.id);

    if (userIdsToNotify.length === 0) {
      return new Response(
        JSON.stringify({ success: true, recipients: 0, pushSent: 0, pushFailed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const campusName = (playlist.campuses as { name?: string } | null)?.name || "";
    const formattedDate = new Date(`${draftSet.plan_date}T12:00:00Z`).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });

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
          title: "Weekend Tracks Uploaded",
          message: `"${trackTitle.trim()}" was added for ${formattedDate}${campusName ? ` at ${campusName}` : ""}.`,
          url: `/my-setlists?setId=${draftSet.id}`,
          tag: `weekend-track-${referenceTrackId}`,
          userIds: userIdsToNotify,
          metadata: {
            draftSetId: draftSet.id,
            playlistId,
            referenceTrackId,
            type: "weekend_track_uploaded",
          },
        }),
      });

      const pushResult = await pushResponse.json();
      pushSent = pushResult.sent || 0;
      pushFailed = pushResult.failed || 0;
    } catch (error) {
      console.error("Error calling send-push-notification:", error);
    }

    return new Response(
      JSON.stringify({
        success: true,
        recipients: userIdsToNotify.length,
        pushSent,
        pushFailed,
        draftSetId: draftSet.id,
        playlistId,
        referenceTrackId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    console.error("Error in notify-weekend-track-uploaded:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
