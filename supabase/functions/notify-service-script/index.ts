import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-resource-app-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const STAFF_ROLES = new Set([
  "admin",
  "campus_admin",
  "network_worship_pastor",
  "network_worship_leader",
  "campus_worship_pastor",
  "campus_pastor",
  "student_worship_pastor",
  "student_pastor",
  "network_student_pastor",
  "childrens_pastor",
]);

const RESOURCE_APP_PATH_PREFIXES: Record<string, string> = {
  worship: "",
  students_hs: "/hs",
  students_ms: "/ms",
  my_church_resource: "/admin",
};

const ANNOUNCEMENT_TOKENS = new Set([
  "announcement",
  "announcements",
  "annoucement",
  "annoucements",
  "anncouncement",
  "anncouncements",
]);

const CLOSING_PRAYER_TOKENS = new Set([
  "closing_prayer",
  "closer",
  "closingprayer",
]);

type ScriptKind = "announcement" | "closing_prayer";
type NotifyEvent = "sent" | "updated" | "removed";

interface ServiceScriptRow {
  id: string;
  campus_id: string;
  ministry_type: string;
  resource_app_key: string;
  script_kind: ScriptKind;
  month_start: string;
  weekend_date: string | null;
  body: string;
  status: string;
}

interface ScheduleRow {
  schedule_date: string;
  team_id: string;
  rotation_period: string | null;
}

interface PeriodRow {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
}

interface MemberRow {
  user_id: string | null;
  team_id: string;
  position: string | null;
  position_slot: string | null;
  service_day: string | null;
  rotation_period_id: string | null;
}

interface SwapRow {
  requester_id: string | null;
  accepted_by_id: string | null;
  position: string | null;
  original_date: string;
  swap_date: string | null;
  team_id: string;
  request_type: string | null;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function buildAppUrl(resourceAppKey: string, path: string) {
  const prefix = RESOURCE_APP_PATH_PREFIXES[resourceAppKey] ?? "";
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${prefix}${normalizedPath}` || "/";
}

function normalizeToken(value: string | null | undefined) {
  return (value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function matchesKind(position: string | null | undefined, positionSlot: string | null | undefined, kind: ScriptKind) {
  const tokens = kind === "announcement" ? ANNOUNCEMENT_TOKENS : CLOSING_PRAYER_TOKENS;
  return [positionSlot, position].some((value) => tokens.has(normalizeToken(value)));
}

function ministryAliases(ministryType: string) {
  if (ministryType === "weekend" || ministryType === "weekend_team" || ministryType === "sunday_am") {
    return ["weekend", "weekend_team", "sunday_am"];
  }
  return [ministryType];
}

function addDays(dateStr: string, days: number) {
  const date = new Date(`${dateStr}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function weekday(dateStr: string) {
  return new Date(`${dateStr}T12:00:00Z`).getUTCDay();
}

function weekendPair(dateStr: string) {
  const day = weekday(dateStr);
  if (day === 6) return [dateStr, addDays(dateStr, 1)];
  if (day === 0) return [addDays(dateStr, -1), dateStr];
  return [dateStr];
}

function datesCoveredByScript(script: ServiceScriptRow) {
  if (script.weekend_date) return weekendPair(script.weekend_date);

  const [year, month] = script.month_start.split("-").map(Number);
  const cursor = new Date(Date.UTC(year, month - 1, 1));
  const dates: string[] = [];
  while (cursor.getUTCMonth() === month - 1) {
    const day = cursor.getUTCDay();
    if (day === 6 || day === 0) dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const last = dates[dates.length - 1];
  if (last && weekday(last) === 6) dates.push(addDays(last, 1));
  return dates;
}

function matchesServiceDay(serviceDay: string | null | undefined, dateStr: string) {
  if (!serviceDay) return true;
  const normalized = serviceDay.toLowerCase();
  if (normalized === "both" || normalized === "weekend") return true;
  const day = weekday(dateStr);
  if (day === 6) return normalized === "saturday";
  if (day === 0) return normalized === "sunday";
  return true;
}

function sameWeekend(left: string, right: string) {
  return weekendPair(left).includes(right);
}

function formatMonth(monthStart: string) {
  const [year, month] = monthStart.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatWeekend(saturday: string) {
  const sunday = addDays(saturday, 1);
  const start = new Date(`${saturday}T12:00:00Z`);
  const end = new Date(`${sunday}T12:00:00Z`);
  const startLabel = start.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  if (start.getUTCMonth() === end.getUTCMonth()) return `${startLabel}–${end.getUTCDate()}`;
  const endLabel = end.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `${startLabel}–${endLabel}`;
}

function periodIdsForSchedule(periods: PeriodRow[], schedule: ScheduleRow) {
  const named = periods.filter((period) => period.name === schedule.rotation_period).map((period) => period.id);
  if (named.length > 0) return named;
  return periods
    .filter((period) => period.start_date <= schedule.schedule_date && period.end_date >= schedule.schedule_date)
    .map((period) => period.id);
}

async function resolveRecipientIds(
  supabase: ReturnType<typeof createClient>,
  script: ServiceScriptRow,
) {
  const dates = datesCoveredByScript(script);
  if (dates.length === 0) return [];

  const { data: schedules, error: scheduleError } = await supabase
    .from("team_schedule")
    .select("schedule_date, team_id, rotation_period")
    .eq("campus_id", script.campus_id)
    .eq("resource_app_key", script.resource_app_key)
    .in("ministry_type", ministryAliases(script.ministry_type))
    .in("schedule_date", dates);

  if (scheduleError) throw scheduleError;
  const scheduleRows = (schedules || []) as ScheduleRow[];
  if (scheduleRows.length === 0) return [];

  const teamIds = [...new Set(scheduleRows.map((row) => row.team_id))];
  const [{ data: periods, error: periodError }, { data: members, error: memberError }, { data: overrides, error: overrideError }, { data: swaps, error: swapError }] =
    await Promise.all([
      supabase.from("rotation_periods").select("id, name, start_date, end_date").eq("campus_id", script.campus_id),
      supabase
        .from("team_members")
        .select("user_id, team_id, position, position_slot, service_day, rotation_period_id")
        .in("team_id", teamIds)
        .not("user_id", "is", null),
      supabase
        .from("team_member_date_overrides")
        .select("user_id, team_id, position, position_slot, rotation_period_id, schedule_date")
        .in("team_id", teamIds)
        .in("schedule_date", dates),
      supabase
        .from("swap_requests")
        .select("requester_id, accepted_by_id, position, original_date, swap_date, team_id, request_type")
        .eq("status", "accepted")
        .eq("resource_app_key", script.resource_app_key)
        .in("team_id", teamIds),
    ]);

  if (periodError) throw periodError;
  if (memberError) throw memberError;
  if (overrideError) throw overrideError;
  if (swapError) throw swapError;

  const periodRows = (periods || []) as PeriodRow[];
  const memberRows = (members || []) as MemberRow[];
  const overrideRows = (overrides || []) as Array<MemberRow & { schedule_date: string }>;
  const swapRows = (swaps || []) as SwapRow[];
  const userIds = new Set<string>();

  for (const schedule of scheduleRows) {
    const activePeriodIds = periodIdsForSchedule(periodRows, schedule);
    const dayOverrides = overrideRows.filter((override) =>
      override.team_id === schedule.team_id &&
      override.schedule_date === schedule.schedule_date &&
      (activePeriodIds.length === 0 || (override.rotation_period_id && activePeriodIds.includes(override.rotation_period_id)))
    );
    const overrideSlots = new Set(dayOverrides.map((override) => override.position_slot).filter(Boolean));

    const scheduled = new Set<string>();
    for (const member of memberRows) {
      if (member.team_id !== schedule.team_id || !member.user_id) continue;
      const inPeriod = activePeriodIds.length === 0
        ? !member.rotation_period_id
        : Boolean(member.rotation_period_id && activePeriodIds.includes(member.rotation_period_id));
      if (!inPeriod) continue;
      if (!matchesServiceDay(member.service_day, schedule.schedule_date)) continue;
      if (!matchesKind(member.position, member.position_slot, script.script_kind)) continue;
      if (member.position_slot && overrideSlots.has(member.position_slot)) continue;
      scheduled.add(member.user_id);
    }

    for (const override of dayOverrides) {
      if (!override.user_id) continue;
      if (!matchesKind(override.position, override.position_slot, script.script_kind)) continue;
      scheduled.add(override.user_id);
    }

    for (const swap of swapRows) {
      if (swap.team_id !== schedule.team_id) continue;
      if (!matchesKind(swap.position, swap.position, script.script_kind)) continue;
      const isCover = swap.request_type === "fill_in" || !swap.swap_date;

      if (sameWeekend(swap.original_date, schedule.schedule_date)) {
        if (swap.requester_id && scheduled.has(swap.requester_id)) {
          scheduled.delete(swap.requester_id);
          if (swap.accepted_by_id) scheduled.add(swap.accepted_by_id);
        }
        continue;
      }

      if (!isCover && swap.swap_date && sameWeekend(swap.swap_date, schedule.schedule_date)) {
        if (swap.accepted_by_id && scheduled.has(swap.accepted_by_id)) {
          scheduled.delete(swap.accepted_by_id);
          if (swap.requester_id) scheduled.add(swap.requester_id);
        }
      }
    }

    for (const userId of scheduled) userIds.add(userId);
  }

  return [...userIds];
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jsonResponse({ error: "Missing authorization header" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return jsonResponse({ error: "Unauthorized" }, 401);

    const body = await req.json() as { scriptId?: string; event?: NotifyEvent };
    const scriptId = body.scriptId;
    const event: NotifyEvent = body.event === "updated" || body.event === "removed" ? body.event : "sent";
    if (!scriptId) return jsonResponse({ error: "scriptId is required" }, 400);

    const { data: roleRows, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);
    if (roleError) throw roleError;
    const allowed = (roleRows || []).some((row) => STAFF_ROLES.has(row.role));
    if (!allowed) return jsonResponse({ error: "You do not have permission to send this script" }, 403);

    const { data: script, error: scriptError } = await supabase
      .from("service_scripts")
      .select("id, campus_id, ministry_type, resource_app_key, script_kind, month_start, weekend_date, body, status")
      .eq("id", scriptId)
      .maybeSingle();
    if (scriptError) throw scriptError;
    if (!script) return jsonResponse({ error: "Script not found" }, 404);

    const typedScript = script as ServiceScriptRow;
    const { data: campus, error: campusError } = await supabase
      .from("campuses")
      .select("name")
      .eq("id", typedScript.campus_id)
      .maybeSingle();
    if (campusError) throw campusError;

    const recipients = await resolveRecipientIds(supabase, typedScript);
    const kindLabel = typedScript.script_kind === "closing_prayer" ? "Closing prayer" : "Announcements";
    const whenLabel = typedScript.weekend_date
      ? formatWeekend(typedScript.weekend_date)
      : formatMonth(typedScript.month_start);
    const title = event === "removed"
      ? `${kindLabel} script removed`
      : event === "updated"
        ? `${kindLabel} script updated`
        : `${kindLabel} script is ready`;
    const message = event === "removed"
      ? `${campus?.name || "Your campus"} · ${whenLabel}. Use the monthly script.`
      : `${campus?.name || "Your campus"} · ${whenLabel}`;
    const weekendQuery = typedScript.weekend_date ? `&weekend=${typedScript.weekend_date}` : "";
    const path = `/my-scripts?campus=${typedScript.campus_id}&month=${typedScript.month_start}&kind=${typedScript.script_kind}${weekendQuery}`;

    let pushSent = 0;
    let pushFailed = 0;
    if (recipients.length > 0) {
      const pushResponse = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          title,
          message,
          url: buildAppUrl(typedScript.resource_app_key, path),
          tag: `service-script-${typedScript.id}-${Date.now()}`,
          userIds: recipients,
          contextType: "service-script",
          contextId: `${typedScript.id}:${Date.now()}`,
          createdBy: userData.user.id,
          metadata: {
            resourceAppKey: typedScript.resource_app_key,
            scriptKind: typedScript.script_kind,
            campusId: typedScript.campus_id,
            monthStart: typedScript.month_start,
            weekendDate: typedScript.weekend_date,
            event,
          },
        }),
      });
      const pushResult = await pushResponse.json();
      if (!pushResponse.ok) {
        console.error("Failed to send service script push:", pushResult);
        pushFailed = recipients.length;
      } else {
        pushSent = pushResult.sent || 0;
        pushFailed = pushResult.failed || 0;
      }
    }

    return jsonResponse({
      success: true,
      recipients: recipients.length,
      pushSent,
      pushFailed,
    });
  } catch (error) {
    console.error("Error in notify-service-script:", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Failed to notify" }, 500);
  }
});
