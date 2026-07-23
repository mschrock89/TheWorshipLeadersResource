import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveEffectiveTeamSchedulesForCampuses } from "../_shared/effectiveTeamSchedules.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Invoked daily by the pg_cron wrapper run_video_schedule_reminder() (see
// migration 20260627124000). It reminds the Video team 10 days before their
// next scheduled date, using the authoritative get_roster_notifiable_user_ids
// RPC scoped to ministry_type = 'video'.

const TIME_ZONE = "America/Chicago";
const REMINDER_LEAD_DAYS = 10;
const MINISTRY_TYPE = "video";

function localDateString(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDateLabel(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Target date = today + lead days (church-local), unless an explicit date is provided for testing.
    let targetDate = addDays(localDateString(new Date()), REMINDER_LEAD_DAYS);
    try {
      if (req.method === "POST") {
        const body = await req.json().catch(() => ({}));
        if (body && typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
          targetDate = body.date;
        }
      }
    } catch (_) {
      // ignore body parse errors
    }

    console.log(`Running video schedule reminder for ${targetDate} (${TIME_ZONE})`);

    // Which video teams are scheduled on the target date (for message detail + early-exit).
    const [scheduleResult, campusResult] = await Promise.all([
      supabase
        .from("team_schedule")
        .select(`team_id, ministry_type, time_of_day, campus_id, resource_app_key, created_at`)
        .eq("schedule_date", targetDate)
        .eq("ministry_type", MINISTRY_TYPE),
      supabase.from("campuses").select("id"),
    ]);

    const { data: schedules, error: scheduleError } = scheduleResult;
    const { data: campuses, error: campusError } = campusResult;

    if (scheduleError || campusError) {
      console.error("Error fetching video schedules:", { scheduleError, campusError });
      throw new Error("Failed to fetch video schedules");
    }

    if (!schedules || schedules.length === 0) {
      console.log("No video schedules on target date");
      return new Response(
        JSON.stringify({ success: true, message: "No video schedules", pushSent: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const effectiveSchedules = resolveEffectiveTeamSchedulesForCampuses(
      schedules,
      (campuses || []).map((campus) => campus.id),
    );
    const recipientUserIds = new Set<string>();

    for (const schedule of effectiveSchedules) {
      if (!schedule.team_id) continue;

      const { data: rosterRows, error: rosterError } = await supabase.rpc(
        "get_roster_notifiable_user_ids",
        {
          p_schedule_date: targetDate,
          p_campus_id: schedule.campus_id,
          p_ministry_type: MINISTRY_TYPE,
          p_team_id: schedule.team_id,
        },
      );

      if (rosterError) {
        console.error(
          `Error resolving video roster for team ${schedule.team_id} at campus ${schedule.campus_id}:`,
          rosterError,
        );
        throw new Error("Failed to resolve video roster recipients");
      }

      for (const row of rosterRows || []) {
        if (row.user_id) recipientUserIds.add(row.user_id);
      }
    }

    if (recipientUserIds.size === 0) {
      console.log("No video roster members to notify");
      return new Response(
        JSON.stringify({ success: true, message: "No video members scheduled", pushSent: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const recipients = Array.from(recipientUserIds);
    console.log(`Found ${recipients.length} video members to remind`);

    const formattedDate = formatDateLabel(targetDate);
    const message = `Heads up — you're on the Video team in 10 days (${formattedDate}). Open Calendar to view details.`;

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
          title: "Video Team Reminder",
          message,
          url: "/calendar",
          tag: `video-reminder-${targetDate}`,
          userIds: recipients,
          contextType: "video-schedule-reminder",
          // Video ministry is Worship-only; scope delivery to worship subscriptions.
          metadata: { scheduleDate: targetDate, ministryType: MINISTRY_TYPE, resourceAppKey: "worship" },
        }),
      });

      if (!pushResponse.ok) {
        const text = await pushResponse.text();
        console.error(`Video reminder push failed: ${pushResponse.status} ${text}`);
        pushFailed = recipients.length;
      } else {
        const result = await pushResponse.json();
        pushSent = result.sent || 0;
        pushFailed = result.failed || 0;
      }
    } catch (error) {
      console.error("Error calling send-push-notification:", error);
      pushFailed = recipients.length;
    }

    console.log(`Video schedule reminder complete: ${pushSent} sent, ${pushFailed} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        targetDate,
        recipients: recipients.length,
        pushSent,
        pushFailed,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error in notify-video-schedule-reminder:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
