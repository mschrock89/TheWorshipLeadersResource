import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { formatServingPosition } from "./positionLabels.ts";
import { canonicalSwapPosition } from "./swapPositions.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-resource-app-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Path prefix each resource app is mounted under, so notification links open
// inside the right PWA scope (matches send-admin-ping).
const RESOURCE_APP_PATH_PREFIXES: Record<string, string> = {
  worship: "",
  students_hs: "/hs",
  students_ms: "/ms",
  my_church_resource: "/admin",
};

export function buildAppUrl(resourceAppKey: string, path: string): string {
  const prefix = RESOURCE_APP_PATH_PREFIXES[resourceAppKey] ?? "";
  return `${prefix}${path.startsWith("/") ? path : `/${path}`}`;
}

const WEEKEND_MINISTRY_ALIASES = new Set(["weekend", "weekend_team", "sunday_am"]);

export function ministriesMatch(left: string | null | undefined, right: string | null | undefined): boolean {
  if (!left || !right) return false;
  if (left === right) return true;
  return WEEKEND_MINISTRY_ALIASES.has(left) && WEEKEND_MINISTRY_ALIASES.has(right);
}

const MINISTRY_LABELS: Record<string, string> = {
  weekend_team: "Weekend Worship",
  weekend: "Weekend Worship",
  sunday_am: "Weekend Worship",
  worship_night: "Worship Night",
  kids_camp: "Kids Camp",
  student_camp: "Student Camp",
  prayer_night: "Prayer Night",
  encounter: "HS Worship",
  eon: "MS Worship",
  eon_weekend: "MS Worship Weekend",
  ms_hs: "MS/HS Worship",
  evident: "Evident",
  er: "ER",
  speaker: "Speakers",
  production: "Production",
  ms_hs_production: "MS/HS Production",
  hs_production: "HS Production",
  video: "Video",
  creative: "Creative",
  students: "Students",
};

export function formatMinistry(ministryType: string | null | undefined): string {
  if (!ministryType) return "";
  return MINISTRY_LABELS[ministryType] || ministryType.replace(/_/g, " ");
}

// Gap requests go to a whole position family, so label the family rather than a
// specific chair ("Electric Guitar", not "EG 1").
const FAMILY_LABELS: Record<string, string> = {
  vocalist: "Vocalist",
  electric_guitar: "Electric Guitar",
  acoustic_guitar: "Acoustic Guitar",
};

export function formatGapPosition(position: string): string {
  const family = canonicalSwapPosition(position);
  return FAMILY_LABELS[family] || formatServingPosition(family || position);
}

export function formatGapDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

const NETWORK_SENDER_ROLES = new Set([
  "admin",
  "network_worship_pastor",
  "network_worship_leader",
  "network_student_pastor",
]);

const CAMPUS_SENDER_ROLES = new Set([
  "campus_worship_pastor",
  "student_pastor",
  "student_worship_pastor",
]);

const PRODUCTION_MINISTRIES = new Set(["production", "ms_hs_production", "hs_production"]);

/**
 * Who may send a gap request for a campus + ministry: org/network leads anywhere,
 * a campus admin for their own campus, and campus ministry leads (worship pastors,
 * plus video/production leads for their ministry) at a campus they're assigned to.
 */
export async function canSendGapRequest(
  supabase: SupabaseClient,
  userId: string,
  campusId: string,
  ministryType: string,
): Promise<boolean> {
  const { data: roleRows, error } = await supabase
    .from("user_roles")
    .select("role, admin_campus_id")
    .eq("user_id", userId);

  if (error) throw error;
  const roles = (roleRows || []) as Array<{ role: string; admin_campus_id: string | null }>;

  if (roles.some((row) => NETWORK_SENDER_ROLES.has(row.role))) return true;
  if (roles.some((row) => row.role === "campus_admin" && row.admin_campus_id === campusId)) return true;

  const hasCampusLeadRole = roles.some(
    (row) =>
      CAMPUS_SENDER_ROLES.has(row.role) ||
      (row.role === "video_director" && ministryType === "video") ||
      (row.role === "production_manager" && PRODUCTION_MINISTRIES.has(ministryType)),
  );
  if (!hasCampusLeadRole) return false;

  const [campusResult, ministryCampusResult] = await Promise.all([
    supabase.from("user_campuses").select("id").eq("user_id", userId).eq("campus_id", campusId).limit(1),
    supabase.from("user_ministry_campuses").select("id").eq("user_id", userId).eq("campus_id", campusId).limit(1),
  ]);

  return Boolean(campusResult.data?.length || ministryCampusResult.data?.length);
}

/** "Sat, Nov 7" or, for a whole-weekend gap, "Sat, Nov 7 & Sun, Nov 8". */
export function formatGapWhen(date: string, coversWeekendPair: boolean): string {
  const pair = coversWeekendPair ? weekendPairDate(date) : null;
  if (!pair) return formatGapDate(date);
  const [first, second] = [date, pair].sort();
  return `${formatGapDate(first)} & ${formatGapDate(second)}`;
}

export function weekendPairDate(date: string): string | null {
  const day = new Date(`${date}T12:00:00Z`);
  const weekday = day.getUTCDay();
  if (weekday !== 0 && weekday !== 6) return null;
  day.setUTCDate(day.getUTCDate() + (weekday === 6 ? 1 : -1));
  return day.toISOString().slice(0, 10);
}

const PRODUCTION_FAMILIES = new Set(["sound_tech", "mon", "broadcast", "audio_shadow", "lighting", "media", "producer"]);
const VIDEO_FAMILIES = new Set(["tri_pod_camera", "hand_held_camera", "director", "graphics", "switcher", "other"]);
const SPEAKER_FAMILIES = new Set(["teacher", "announcement", "closing_prayer"]);

// Mirrors resolveTeamBuilderSlotMinistryType so the roster override is tagged the
// same way as one written from Team Builder.
function overrideMinistryType(ministryType: string, position: string): string {
  const family = canonicalSwapPosition(position);
  if (SPEAKER_FAMILIES.has(family)) return "speaker";
  if (ministryType !== "weekend_team" && !WEEKEND_MINISTRY_ALIASES.has(ministryType)) return ministryType;
  if (PRODUCTION_FAMILIES.has(family)) return "production";
  if (VIDEO_FAMILIES.has(family)) return "video";
  return "weekend";
}

export interface GapPlacement {
  teamId: string;
  teamName: string;
  rotationPeriodId: string;
  dates: string[];
}

/**
 * Find the team scheduled at the gap's campus + ministry on its date(s) and the
 * rotation period that roster belongs to. Returns null when nothing is scheduled.
 */
export async function resolveGapPlacement(
  supabase: SupabaseClient,
  gap: {
    campus_id: string;
    ministry_type: string;
    schedule_date: string;
    position: string;
    covers_weekend_pair: boolean;
    resource_app_key: string;
  },
): Promise<GapPlacement | null> {
  const scheduleMinistry = overrideMinistryType(gap.ministry_type, gap.position);
  const pairDate = gap.covers_weekend_pair ? weekendPairDate(gap.schedule_date) : null;
  const dates = pairDate ? [gap.schedule_date, pairDate].sort() : [gap.schedule_date];

  const { data: scheduleRows, error } = await supabase
    .from("team_schedule")
    .select("team_id, schedule_date, ministry_type, rotation_period, created_at, worship_teams(name)")
    .eq("campus_id", gap.campus_id)
    .eq("resource_app_key", gap.resource_app_key)
    .in("schedule_date", dates)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const matching = (scheduleRows || []).filter((row) => ministriesMatch(row.ministry_type, scheduleMinistry));
  const primary = matching.find((row) => row.schedule_date === gap.schedule_date) || matching[0];
  if (!primary) return null;

  // Only slot the pair day if the same team is serving it.
  const scheduledDates = dates.filter((date) =>
    matching.some((row) => row.schedule_date === date && row.team_id === primary.team_id)
  );

  let rotationPeriodId: string | null = null;
  if (primary.rotation_period) {
    const { data: named } = await supabase
      .from("rotation_periods")
      .select("id")
      .eq("campus_id", gap.campus_id)
      .eq("name", primary.rotation_period)
      .limit(1);
    rotationPeriodId = named?.[0]?.id ?? null;
  }
  if (!rotationPeriodId) {
    const { data: dated } = await supabase
      .from("rotation_periods")
      .select("id")
      .eq("campus_id", gap.campus_id)
      .lte("start_date", gap.schedule_date)
      .gte("end_date", gap.schedule_date)
      .limit(1);
    rotationPeriodId = dated?.[0]?.id ?? null;
  }
  if (!rotationPeriodId) return null;

  return {
    teamId: primary.team_id,
    // deno-lint-ignore no-explicit-any
    teamName: (primary.worship_teams as any)?.name || "the team",
    rotationPeriodId,
    dates: scheduledDates,
  };
}

export async function writeGapOverrides(
  supabase: SupabaseClient,
  placement: GapPlacement,
  gap: { ministry_type: string; position: string; position_slot: string },
  volunteer: { id: string; name: string },
): Promise<void> {
  const ministryTypes = [overrideMinistryType(gap.ministry_type, gap.position)];
  const { error } = await supabase
    .from("team_member_date_overrides")
    .upsert(
      placement.dates.map((date) => ({
        team_id: placement.teamId,
        rotation_period_id: placement.rotationPeriodId,
        position_slot: gap.position_slot,
        schedule_date: date,
        user_id: volunteer.id,
        member_name: volunteer.name,
        position: gap.position,
        ministry_types: ministryTypes,
      })),
      { onConflict: "team_id,rotation_period_id,position_slot,schedule_date" },
    );

  if (error) throw error;
}

export async function sendPush(
  supabaseUrl: string,
  serviceKey: string,
  body: Record<string, unknown>,
): Promise<number> {
  const userIds = body.userIds as string[] | undefined;
  if (!userIds?.length) return 0;

  const response = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    console.error("send-push-notification failed:", await response.text());
    return 0;
  }

  const result = await response.json();
  return result.sent || 0;
}
