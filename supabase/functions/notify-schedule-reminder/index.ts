import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveEffectiveTeamSchedulesForCampuses } from "../_shared/effectiveTeamSchedules.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Invoked Saturday mornings by the pg_cron wrapper run_schedule_reminder() (see
// migration 20260705120000). One run covers the whole weekend: it notifies the
// effective roster for *today* (Saturday) and *tomorrow* (Sunday), across every
// campus and ministry, using the authoritative get_roster_notifiable_user_ids RPC
// (which applies rotation periods, service-day matching, date overrides and
// accepted swaps).

const TIME_ZONE = "America/Chicago";

function localDateString(date: Date): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function nextDateString(dateStr: string): string {
  const next = new Date(`${dateStr}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

interface AppNotification {
  userId: string;
  appKey: string;
  dayWord: "today" | "tomorrow";
  dateStr: string;
  positions: string[];
  teams: string[];
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Allow an explicit override date for testing (processed as "today"),
    // otherwise cover today and tomorrow in church-local time so the Saturday
    // run reminds both Saturday and Sunday servers.
    let overrideDate: string | null = null;
    try {
      if (req.method === "POST") {
        const body = await req.json().catch(() => ({}));
        if (body && typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
          overrideDate = body.date;
        }
      }
    } catch (_) {
      // ignore body parse errors
    }

    const todayStr = overrideDate ?? localDateString(new Date());
    const targetDates: Array<{ dateStr: string; dayWord: "today" | "tomorrow" }> = overrideDate
      ? [{ dateStr: overrideDate, dayWord: "today" }]
      : [
          { dateStr: todayStr, dayWord: "today" },
          { dateStr: nextDateString(todayStr), dayWord: "tomorrow" },
        ];

    console.log(
      `Running schedule reminder for ${targetDates.map((d) => d.dateStr).join(", ")} (${TIME_ZONE})`,
    );

    // One entry per (user, app, date): each app's push mentions only the teams and
    // positions scheduled in THAT app, and is delivered only to that app's
    // subscriptions via metadata.resourceAppKey.
    const notifications: Record<string, AppNotification> = {};
    const scheduledTeamIds = new Set<string>();

    for (const { dateStr, dayWord } of targetDates) {
      // Which teams are scheduled on this date (for the message detail + early-exit).
      const [scheduleResult, campusResult] = await Promise.all([
        supabase
          .from("team_schedule")
          .select(
            `team_id, ministry_type, time_of_day, campus_id, resource_app_key, created_at, worship_teams!inner(name)`,
          )
          .eq("schedule_date", dateStr),
        supabase.from("campuses").select("id"),
      ]);

      const { data: schedules, error: scheduleError } = scheduleResult;
      const { data: campuses, error: campusError } = campusResult;

      if (scheduleError || campusError) {
        console.error(`Error fetching schedules for ${dateStr}:`, { scheduleError, campusError });
        throw new Error("Failed to fetch schedules");
      }

      if (!schedules || schedules.length === 0) {
        console.log(`No schedules for ${dateStr}`);
        continue;
      }

      // Shared rows are defaults. Resolve them once per campus so a campus-specific
      // schedule suppresses the legacy shared row, matching Team Builder.
      const effectiveSchedules = resolveEffectiveTeamSchedulesForCampuses(
        schedules,
        (campuses || []).map((campus) => campus.id),
      );

      if (effectiveSchedules.length === 0) {
        console.log(`No effective schedules for ${dateStr}`);
        continue;
      }

      const recipientUserIds = new Set<string>();

      // Attribute team/position detail per schedule row using the SAME authoritative
      // RPC that decided who to notify (rotation period, ministry type, date overrides,
      // and swaps) — a raw team_members join here previously listed every team a person
      // is a member of anywhere, even ones from a past/inactive rotation (e.g. "Team 1 &
      // Team 3" when only Team 1 was actually theirs today).
      for (const schedule of effectiveSchedules) {
        if (!schedule.team_id) continue;
        scheduledTeamIds.add(schedule.team_id);

        const { data: teamRosterRows, error: teamRosterError } = await supabase.rpc(
          "get_roster_notifiable_user_ids",
          {
            p_schedule_date: dateStr,
            p_campus_id: schedule.campus_id,
            p_ministry_type: schedule.ministry_type,
            p_team_id: schedule.team_id,
          },
        );

        if (teamRosterError) {
          console.error(`Error resolving roster for team ${schedule.team_id}:`, teamRosterError);
          continue;
        }

        const teamUserIds = Array.from(
          new Set((teamRosterRows || []).map((row: { user_id: string }) => row.user_id).filter(Boolean)),
        );
        if (teamUserIds.length === 0) continue;

        const { data: positionRows } = await supabase
          .from("team_members")
          .select(`user_id, position`)
          .eq("team_id", schedule.team_id)
          .in("user_id", teamUserIds);

        const positionsByUser: Record<string, string[]> = {};
        for (const row of positionRows || []) {
          if (!row.user_id || !row.position) continue;
          (positionsByUser[row.user_id] ??= []).push(row.position);
        }

        // deno-lint-ignore no-explicit-any
        const teamData = schedule.worship_teams as any;
        const teamName = teamData?.name || "Team";
        const appKey = schedule.resource_app_key || "worship";

        for (const userId of teamUserIds) {
          recipientUserIds.add(userId);
          const key = `${userId}|${appKey}|${dateStr}`;
          const entry = (notifications[key] ??= {
            userId,
            appKey,
            dayWord,
            dateStr,
            positions: [],
            teams: [],
          });
          if (teamName && !entry.teams.includes(teamName)) {
            entry.teams.push(teamName);
          }
          for (const position of positionsByUser[userId] || []) {
            if (!entry.positions.includes(position)) {
              entry.positions.push(position);
            }
          }
        }
      }

      console.log(`Found ${recipientUserIds.size} roster members for ${dateStr}`);
    }

    let totalSent = 0;
    let totalFailed = 0;

    const sendPush = async (payload: Record<string, unknown>, userId: string) => {
      try {
        const pushResponse = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify(payload),
        });

        if (!pushResponse.ok) {
          totalFailed++;
          const text = await pushResponse.text();
          console.error(`Push failed for ${userId}: ${pushResponse.status} ${text}`);
          return;
        }

        const result = await pushResponse.json();
        totalSent += result.sent || 0;
        totalFailed += result.failed || 0;
      } catch (err) {
        totalFailed++;
        console.error(`Failed to send push to ${userId}:`, err);
      }
    };

    for (const entry of Object.values(notifications)) {
      const positionsStr = entry.positions.join(", ");
      const teamsStr = entry.teams.join(" & ");
      const message = positionsStr && teamsStr
        ? `You're on ${positionsStr} for ${teamsStr} ${entry.dayWord}. See you at church!`
        : `You're scheduled to serve ${entry.dayWord}. See you at church!`;

      await sendPush({
        title: entry.dayWord === "today"
          ? "🎵 You're Serving Today!"
          : "🎵 You're Serving Tomorrow!",
        message,
        url: "/calendar",
        tag: `schedule-reminder-${entry.dateStr}`,
        userIds: [entry.userId],
        contextType: "schedule-reminder",
        metadata: { resourceAppKey: entry.appKey },
      }, entry.userId);
    }

    console.log(`Schedule reminder complete: ${totalSent} sent, ${totalFailed} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        scheduledTeams: scheduledTeamIds.size,
        recipients: Object.keys(notifications).length,
        pushSent: totalSent,
        pushFailed: totalFailed,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in notify-schedule-reminder:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
