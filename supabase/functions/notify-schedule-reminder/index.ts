import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Invoked daily by the pg_cron wrapper run_schedule_reminder() (see migration
// 20260627123000). It notifies everyone on the effective roster for *today*,
// across every campus and ministry, using the authoritative
// get_roster_notifiable_user_ids RPC (which applies rotation periods, service-day
// matching, date overrides and accepted swaps).

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

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Allow an explicit override date for testing, otherwise "today" in church-local time.
    let todayStr = localDateString(new Date());
    try {
      if (req.method === "POST") {
        const body = await req.json().catch(() => ({}));
        if (body && typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
          todayStr = body.date;
        }
      }
    } catch (_) {
      // ignore body parse errors
    }

    console.log(`Running schedule reminder for ${todayStr} (${TIME_ZONE})`);

    // Which teams are scheduled today (for the message detail + early-exit).
    const { data: schedules, error: scheduleError } = await supabase
      .from("team_schedule")
      .select(`team_id, ministry_type, campus_id, worship_teams!inner(name)`)
      .eq("schedule_date", todayStr);

    if (scheduleError) {
      console.error("Error fetching schedules:", scheduleError);
      throw new Error("Failed to fetch schedules");
    }

    if (!schedules || schedules.length === 0) {
      console.log("No schedules for today");
      return new Response(
        JSON.stringify({ success: true, message: "No schedules today", pushSent: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Authoritative recipient set (all campuses, all ministries) for today.
    const { data: rosterRows, error: rosterError } = await supabase.rpc(
      "get_roster_notifiable_user_ids",
      { p_schedule_date: todayStr, p_campus_id: null, p_ministry_type: null },
    );

    if (rosterError) {
      console.error("Error resolving roster recipients:", rosterError);
      throw new Error("Failed to resolve roster recipients");
    }

    const recipientUserIds = Array.from(
      new Set((rosterRows || []).map((row: { user_id: string }) => row.user_id).filter(Boolean)),
    );

    if (recipientUserIds.length === 0) {
      console.log("No roster members to notify today");
      return new Response(
        JSON.stringify({ success: true, message: "No members scheduled", pushSent: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${recipientUserIds.length} roster members to notify`);

    // Build best-effort position/team detail for the personalised message.
    const teamIds = Array.from(new Set(schedules.map((s) => s.team_id).filter(Boolean)));
    const teamNamesMap: Record<string, string> = {};
    for (const schedule of schedules) {
      // deno-lint-ignore no-explicit-any
      const teamData = schedule.worship_teams as any;
      teamNamesMap[schedule.team_id] = teamData?.name || "Team";
    }

    const dow = new Date(`${todayStr}T12:00:00Z`).getUTCDay();
    const serviceDay = dow === 6 ? "saturday" : dow === 0 ? "sunday" : null;

    const userNotifications: Record<string, { positions: string[]; teams: string[] }> = {};
    if (teamIds.length > 0) {
      const { data: teamMembers } = await supabase
        .from("team_members")
        .select(`user_id, position, team_id, service_day`)
        .in("team_id", teamIds)
        .in("user_id", recipientUserIds)
        .not("user_id", "is", null);

      for (const member of teamMembers || []) {
        if (!member.user_id) continue;
        // Only attribute a slot to the message if the service_day matches (or is unset).
        if (member.service_day && serviceDay && member.service_day !== serviceDay) continue;
        if (!userNotifications[member.user_id]) {
          userNotifications[member.user_id] = { positions: [], teams: [] };
        }
        if (member.position && !userNotifications[member.user_id].positions.includes(member.position)) {
          userNotifications[member.user_id].positions.push(member.position);
        }
        const teamName = teamNamesMap[member.team_id];
        if (teamName && !userNotifications[member.user_id].teams.includes(teamName)) {
          userNotifications[member.user_id].teams.push(teamName);
        }
      }
    }

    let totalSent = 0;
    let totalFailed = 0;
    for (const userId of recipientUserIds) {
      const detail = userNotifications[userId];
      const positionsStr = detail?.positions.join(", ") || "";
      const teamsStr = detail?.teams.join(" & ") || "";
      const message = positionsStr && teamsStr
        ? `You're on ${positionsStr} for ${teamsStr} today. See you at church!`
        : "You're scheduled to serve today. See you at church!";

      try {
        const pushResponse = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            title: "🎵 You're Serving Today!",
            message,
            url: "/calendar",
            tag: "schedule-reminder",
            userIds: [userId],
            contextType: "schedule-reminder",
          }),
        });

        if (!pushResponse.ok) {
          totalFailed++;
          const text = await pushResponse.text();
          console.error(`Push failed for ${userId}: ${pushResponse.status} ${text}`);
          continue;
        }

        const result = await pushResponse.json();
        totalSent += result.sent || 0;
        totalFailed += result.failed || 0;
      } catch (err) {
        totalFailed++;
        console.error(`Failed to send push to ${userId}:`, err);
      }
    }

    console.log(`Schedule reminder complete: ${totalSent} sent, ${totalFailed} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        scheduledTeams: teamIds.length,
        recipients: recipientUserIds.length,
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
