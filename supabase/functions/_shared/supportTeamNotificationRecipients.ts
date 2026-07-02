import { createClient } from "npm:@supabase/supabase-js@2";
import {
  type CampusWeekendServiceConfig,
  getWeekendScheduleDates,
  isWeekend,
} from "./supportTeamPushContent.ts";

const WEEKEND_ROSTER_MINISTRY_ALIASES = new Set(["weekend", "weekend_team", "sunday_am", "speaker"]);

// Keep in sync with POSITION_SLOTS in src/lib/constants.ts so support-team push
// recipients match the Calendar production/video roster columns.
const POSITION_SLOT_DEFINITIONS: Array<{ slot: string; position: string; category: string }> = [
  { slot: "vocalist_1", position: "vocalist", category: "Vocalists" },
  { slot: "vocalist_2", position: "vocalist", category: "Vocalists" },
  { slot: "vocalist_3", position: "vocalist", category: "Vocalists" },
  { slot: "vocalist_4", position: "vocalist", category: "Vocalists" },
  { slot: "vocalist_5", position: "vocalist", category: "Vocalists" },
  { slot: "vocalist_6", position: "vocalist", category: "Vocalists" },
  { slot: "vocalist_7", position: "vocalist", category: "Vocalists" },
  { slot: "vocalist_8", position: "vocalist", category: "Vocalists" },
  { slot: "teacher", position: "teacher", category: "Speaker" },
  { slot: "announcement", position: "announcement", category: "Speaker" },
  { slot: "closing_prayer", position: "closing_prayer", category: "Speaker" },
  { slot: "drums", position: "drums", category: "Band" },
  { slot: "bass", position: "bass", category: "Band" },
  { slot: "keys", position: "keys", category: "Band" },
  { slot: "pad", position: "pad", category: "Band" },
  { slot: "eg_1", position: "electric_guitar", category: "Band" },
  { slot: "eg_2", position: "electric_guitar", category: "Band" },
  { slot: "eg_3", position: "electric_guitar", category: "Band" },
  { slot: "eg_4", position: "electric_guitar", category: "Band" },
  { slot: "ag_1", position: "acoustic_guitar", category: "Band" },
  { slot: "ag_2", position: "acoustic_guitar", category: "Band" },
  { slot: "foh", position: "sound_tech", category: "Production" },
  { slot: "mon", position: "mon", category: "Production" },
  { slot: "broadcast", position: "broadcast", category: "Production" },
  { slot: "audio_shadow", position: "audio_shadow", category: "Production" },
  { slot: "lighting", position: "lighting", category: "Production" },
  { slot: "propresenter", position: "media", category: "Production" },
  { slot: "producer", position: "producer", category: "Production" },
  { slot: "tri_pod_camera_1", position: "tri_pod_camera", category: "Video" },
  { slot: "tri_pod_camera_2", position: "tri_pod_camera", category: "Video" },
  { slot: "tri_pod_camera_3", position: "tri_pod_camera", category: "Video" },
  { slot: "tri_pod_camera_4", position: "tri_pod_camera", category: "Video" },
  { slot: "hand_held_camera_1", position: "hand_held_camera", category: "Video" },
  { slot: "hand_held_camera_2", position: "hand_held_camera", category: "Video" },
  { slot: "hand_held_camera_3", position: "hand_held_camera", category: "Video" },
  { slot: "hand_held_camera_4", position: "hand_held_camera", category: "Video" },
  { slot: "director", position: "director", category: "Video" },
  { slot: "director_2", position: "director", category: "Video" },
  { slot: "director_3", position: "director", category: "Video" },
  { slot: "director_4", position: "director", category: "Video" },
  { slot: "graphics", position: "graphics", category: "Video" },
  { slot: "graphics_2", position: "graphics", category: "Video" },
  { slot: "graphics_3", position: "graphics", category: "Video" },
  { slot: "graphics_4", position: "graphics", category: "Video" },
  { slot: "switcher", position: "switcher", category: "Video" },
  { slot: "switcher_2", position: "switcher", category: "Video" },
  { slot: "switcher_3", position: "switcher", category: "Video" },
  { slot: "switcher_4", position: "switcher", category: "Video" },
];

const POSITION_CATEGORY_BY_VALUE = new Map(
  POSITION_SLOT_DEFINITIONS.flatMap((entry) => [
    [entry.slot.toLowerCase(), entry.category],
    [entry.position.toLowerCase(), entry.category],
  ]),
);

type SupabaseClient = ReturnType<typeof createClient>;

interface TeamMemberLike {
  user_id: string | null;
  ministry_types: string[] | null;
  position?: string | null;
  position_slot?: string | null;
  service_day?: string | null;
  rotation_period_id?: string | null;
}

function getServiceDayForDate(dateStr: string): "saturday" | "sunday" | null {
  const day = new Date(`${dateStr}T12:00:00`).getDay();
  if (day === 6) return "saturday";
  if (day === 0) return "sunday";
  return null;
}

function assignmentMatchesServiceDay(
  assignment: Pick<TeamMemberLike, "service_day">,
  dateStr: string,
): boolean {
  const serviceDay = assignment.service_day?.toLowerCase();
  if (!serviceDay || serviceDay === "both" || serviceDay === "weekend") return true;

  const dateServiceDay = getServiceDayForDate(dateStr);
  if (!dateServiceDay) return true;

  return serviceDay === dateServiceDay;
}

function ministryMatchesRosterFilter(
  memberMinistries: string[] | null | undefined,
  ministryType: string,
): boolean {
  if (!memberMinistries || memberMinistries.length === 0) return true;

  if (ministryType === "weekend_team") {
    const weekendTeamMinistries = new Set([
      "weekend",
      "production",
      "video",
      "sunday_am",
      "speaker",
    ]);
    return memberMinistries.some((ministry) => weekendTeamMinistries.has(ministry));
  }

  if (WEEKEND_ROSTER_MINISTRY_ALIASES.has(ministryType)) {
    return memberMinistries.some((ministry) => WEEKEND_ROSTER_MINISTRY_ALIASES.has(ministry));
  }

  return memberMinistries.includes(ministryType);
}

function getInferredPositionCategory(
  position?: string | null,
  positionSlot?: string | null,
): string | undefined {
  const slot = positionSlot?.toLowerCase() || "";
  if (slot.startsWith("vocalist_") || slot.startsWith("vocal_")) {
    return "Vocalists";
  }

  const slotCategory = slot ? POSITION_CATEGORY_BY_VALUE.get(slot) : undefined;
  if (slotCategory) return slotCategory;

  return position ? POSITION_CATEGORY_BY_VALUE.get(position.toLowerCase()) : undefined;
}

function getInferredMinistryTypeForCategory(category?: string): string | null {
  if (category === "Production") return "production";
  if (category === "Video") return "video";
  if (category === "Speaker") return "speaker";
  return null;
}

function normalizeSwapPositionToken(position?: string | null): string {
  return (position || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function swapMatchesRosterFilter(
  swap: Pick<{ position?: string | null }, "position">,
  ministryType: string,
): boolean {
  if (!swap.position) return false;

  const positionSlot = normalizeSwapPositionToken(swap.position);
  return assignmentMatchesRosterFilter(
    {
      position: swap.position,
      position_slot: positionSlot || null,
      ministry_types: null,
    },
    ministryType,
  );
}

function assignmentMatchesRosterFilter(
  assignment: Pick<TeamMemberLike, "ministry_types" | "position" | "position_slot">,
  ministryType: string,
): boolean {
  const inferredPositionCategory = getInferredPositionCategory(
    assignment.position,
    assignment.position_slot,
  );
  const inferredMinistryType = getInferredMinistryTypeForCategory(inferredPositionCategory);

  if (
    (inferredPositionCategory === "Band" || inferredPositionCategory === "Vocalists") &&
    (ministryType === "production" || ministryType === "video")
  ) {
    return false;
  }

  const ministryTypes = assignment.ministry_types;
  const hasMinistryTags = Array.isArray(ministryTypes) && ministryTypes.length > 0;

  // Ministry tags are authoritative when present. Inferring production/video from the
  // FOH slot alone would include stale rows (e.g. a weekend-tagged duplicate).
  if (hasMinistryTags) {
    return ministryMatchesRosterFilter(ministryTypes, ministryType);
  }

  if (inferredMinistryType) {
    return ministryMatchesRosterFilter([inferredMinistryType], ministryType);
  }

  // Support-team pushes should only reach explicit production/video roles.
  return false;
}

async function resolveRotationPeriodIds(
  supabase: SupabaseClient,
  campusId: string,
  scheduleDate: string,
  rotationPeriodName?: string | null,
): Promise<string[]> {
  if (rotationPeriodName) {
    const { data: namedPeriods, error: namedPeriodError } = await supabase
      .from("rotation_periods")
      .select("id")
      .eq("campus_id", campusId)
      .eq("name", rotationPeriodName);

    if (namedPeriodError) throw namedPeriodError;
    if ((namedPeriods || []).length > 0) {
      return (namedPeriods || []).map((period) => period.id);
    }
  }

  const { data: datedPeriods, error: datedPeriodError } = await supabase
    .from("rotation_periods")
    .select("id")
    .eq("campus_id", campusId)
    .lte("start_date", scheduleDate)
    .gte("end_date", scheduleDate);

  if (datedPeriodError) throw datedPeriodError;
  if ((datedPeriods || []).length > 0) {
    return (datedPeriods || []).map((period) => period.id);
  }

  const { data: activePeriods, error: activePeriodError } = await supabase
    .from("rotation_periods")
    .select("id")
    .eq("campus_id", campusId)
    .eq("is_active", true);

  if (activePeriodError) throw activePeriodError;
  return (activePeriods || []).map((period) => period.id);
}

function memberMatchesRotationPeriod(
  member: Pick<TeamMemberLike, "rotation_period_id">,
  rotationPeriodIds: string[],
): boolean {
  if (rotationPeriodIds.length === 0) {
    return !member.rotation_period_id;
  }

  return !!member.rotation_period_id && rotationPeriodIds.includes(member.rotation_period_id);
}

function assignmentMatchesServiceDayForMinistry(
  assignment: Pick<TeamMemberLike, "service_day">,
  dateStr: string,
  ministryType: "production" | "video",
): boolean {
  if (ministryType === "production") {
    return true;
  }

  return assignmentMatchesServiceDay(assignment, dateStr);
}

async function resolveSupportTeamNotificationUserIdsForDate(
  supabase: SupabaseClient,
  params: {
    scheduleDate: string;
    campusId: string;
    ministryType: "production" | "video";
    teamId: string;
    rotationPeriodName?: string | null;
  },
): Promise<string[]> {
  const { scheduleDate, campusId, ministryType, teamId, rotationPeriodName } = params;
  const rotationPeriodIds = await resolveRotationPeriodIds(
    supabase,
    campusId,
    scheduleDate,
    rotationPeriodName,
  );

  const { data: members, error: membersError } = await supabase
    .from("team_members")
    .select("user_id, ministry_types, position, position_slot, service_day, rotation_period_id")
    .eq("team_id", teamId)
    .not("user_id", "is", null);

  if (membersError) throw membersError;

  const baseMembers = (members || []).filter((member) =>
    memberMatchesRotationPeriod(member, rotationPeriodIds) &&
    assignmentMatchesServiceDayForMinistry(member, scheduleDate, ministryType) &&
    assignmentMatchesRosterFilter(member, ministryType),
  );

  let overrideQuery = supabase
    .from("team_member_date_overrides")
    .select("user_id, ministry_types, position, position_slot, rotation_period_id, schedule_date")
    .eq("team_id", teamId)
    .eq("schedule_date", scheduleDate)
    .not("user_id", "is", null);

  if (rotationPeriodIds.length > 0) {
    overrideQuery = overrideQuery.in("rotation_period_id", rotationPeriodIds);
  }

  const { data: dateOverrides, error: dateOverridesError } = await overrideQuery;
  if (dateOverridesError) throw dateOverridesError;

  const overrideMembers = (dateOverrides || []).filter((override) =>
    assignmentMatchesRosterFilter(override, ministryType),
  );

  const overrideSlots = new Set(
    overrideMembers.map((override) => override.position_slot).filter(Boolean),
  );

  const effectiveMembers = [
    ...baseMembers.filter((member) => !overrideSlots.has(member.position_slot || "")),
    ...overrideMembers,
  ];

  const userIds = new Set<string>();
  for (const member of effectiveMembers) {
    if (member.user_id) {
      userIds.add(member.user_id);
    }
  }

  const { data: swapsForDate, error: swapsForDateError } = await supabase
    .from("swap_requests")
    .select("requester_id, accepted_by_id, position, status")
    .eq("original_date", scheduleDate)
    .eq("team_id", teamId)
    .eq("status", "accepted");

  if (swapsForDateError) throw swapsForDateError;

  for (const swap of swapsForDate || []) {
    if (!swapMatchesRosterFilter(swap, ministryType)) {
      continue;
    }

    if (swap.requester_id) {
      userIds.delete(swap.requester_id);
    }
    if (swap.accepted_by_id) {
      userIds.add(swap.accepted_by_id);
    }
  }

  const { data: swapsOnDate, error: swapsOnDateError } = await supabase
    .from("swap_requests")
    .select("requester_id, accepted_by_id, position, status")
    .eq("swap_date", scheduleDate)
    .eq("status", "accepted");

  if (swapsOnDateError) throw swapsOnDateError;

  const teamMemberUserIds = new Set(effectiveMembers.map((member) => member.user_id).filter(Boolean));
  for (const swap of swapsOnDate || []) {
    if (!swap.requester_id || !swap.accepted_by_id || !teamMemberUserIds.has(swap.accepted_by_id)) {
      continue;
    }
    if (!swapMatchesRosterFilter(swap, ministryType)) {
      continue;
    }

    userIds.delete(swap.accepted_by_id);
    userIds.add(swap.requester_id);
  }

  return Array.from(userIds);
}

export async function resolveSupportTeamNotificationUserIds(
  supabase: SupabaseClient,
  params: {
    scheduleDate: string;
    campusId: string;
    ministryType: "production" | "video";
    teamId: string;
    rotationPeriodName?: string | null;
    campus?: CampusWeekendServiceConfig | null;
  },
): Promise<string[]> {
  const { scheduleDate, ministryType, campus } = params;
  const scheduleDates =
    ministryType === "production" && isWeekend(scheduleDate)
      ? getWeekendScheduleDates(scheduleDate, campus)
      : [scheduleDate];

  if (scheduleDates.length === 1) {
    return resolveSupportTeamNotificationUserIdsForDate(supabase, {
      ...params,
      scheduleDate: scheduleDates[0],
    });
  }

  const recipientSets = await Promise.all(
    scheduleDates.map((date) =>
      resolveSupportTeamNotificationUserIdsForDate(supabase, {
        ...params,
        scheduleDate: date,
      }),
    ),
  );

  return Array.from(new Set(recipientSets.flat()));
}
