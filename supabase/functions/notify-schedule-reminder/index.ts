import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// This function is called by a cron job at 8am local time
// It sends reminders to team members who are scheduled to serve today

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Running schedule reminder check...");

    // Get today's date in YYYY-MM-DD format
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const dayOfWeek = today.getDay(); // 0 = Sunday, 6 = Saturday

    // Determine service day string
    let serviceDay: string | null = null;
    if (dayOfWeek === 0) {
      serviceDay = "sunday";
    } else if (dayOfWeek === 6) {
      serviceDay = "saturday";
    }

    if (!serviceDay) {
      console.log(`Today is ${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dayOfWeek]}, not a service day`);
      return new Response(
        JSON.stringify({ success: true, message: "Not a service day", notified: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Today is ${serviceDay}, checking schedules for ${todayStr}`);

    // Get the current rotation period
    const { data: currentPeriod, error: periodError } = await supabase
      .from("rotation_periods")
      .select("id, name")
      .eq("is_active", true)
      .lte("start_date", todayStr)
      .gte("end_date", todayStr)
      .single();

    if (periodError || !currentPeriod) {
      console.log("No active rotation period found for today");
      return new Response(
        JSON.stringify({ success: true, message: "No active rotation period", notified: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Current rotation period: ${currentPeriod.name}`);

    // Get all team schedules for today
    const { data: schedules, error: scheduleError } = await supabase
      .from("team_schedule")
      .select(`
        id,
        schedule_date,
        team_id,
        ministry_type,
        worship_teams!inner(name)
      `)
      .eq("schedule_date", todayStr);

    if (scheduleError) {
      console.error("Error fetching schedules:", scheduleError);
      throw new Error("Failed to fetch schedules");
    }

    if (!schedules || schedules.length === 0) {
      console.log("No schedules for today");
      return new Response(
        JSON.stringify({ success: true, message: "No schedules today", notified: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${schedules.length} scheduled teams for today`);

    // Get all team members for today's scheduled teams in the current rotation period
    const teamIds = schedules.map(s => s.team_id);
    
    const { data: teamMembers, error: membersError } = await supabase
      .from("team_members")
      .select(`
        id,
        user_id,
        member_name,
        position,
        team_id,
        service_day
      `)
      .in("team_id", teamIds)
      .eq("rotation_period_id", currentPeriod.id)
      .eq("service_day", serviceDay)
      .not("user_id", "is", null);

    if (membersError) {
      console.error("Error fetching team members:", membersError);
      throw new Error("Failed to fetch team members");
    }

    if (!teamMembers || teamMembers.length === 0) {
      console.log("No team members scheduled for today");
      return new Response(
        JSON.stringify({ success: true, message: "No members scheduled", notified: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get unique user IDs
    const userIds = [...new Set(teamMembers.map(m => m.user_id!).filter(Boolean))];

    console.log(`Found ${userIds.length} unique members to notify`);

    // Create a map of team names for the notification
    const teamNamesMap: Record<string, string> = {};
    for (const schedule of schedules) {
      // deno-lint-ignore no-explicit-any
      const teamData = schedule.worship_teams as any;
      teamNamesMap[schedule.team_id] = teamData?.name || "Team";
    }

    // Group members by user to create personalized messages
    const userNotifications: Record<string, { positions: string[]; teams: string[] }> = {};
    for (const member of teamMembers) {
      if (!member.user_id) continue;
      if (!userNotifications[member.user_id]) {
        userNotifications[member.user_id] = { positions: [], teams: [] };
      }
      userNotifications[member.user_id].positions.push(member.position);
      const teamName = teamNamesMap[member.team_id];
      if (teamName && !userNotifications[member.user_id].teams.includes(teamName)) {
        userNotifications[member.user_id].teams.push(teamName);
      }
    }

    // Send personalized push notifications
    let totalSent = 0;
    for (const [userId, data] of Object.entries(userNotifications)) {
      const positionsStr = data.positions.join(", ");
      const teamsStr = data.teams.join(" & ");
      
      try {
        const pushResponse = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            title: "🎵 You're Serving Today!",
            message: `You're on ${positionsStr} for ${teamsStr} today. See you at church!`,
            url: "/calendar",
            tag: "schedule-reminder",
            userIds: [userId],
          }),
        });

        if (pushResponse.ok) {
          const result = await pushResponse.json();
          totalSent += result.sent || 0;
        }
      } catch (err) {
        console.error(`Failed to send push to ${userId}:`, err);
      }
    }

    console.log(`Schedule reminder complete: ${totalSent} notifications sent`);

    return new Response(
      JSON.stringify({
        success: true,
        scheduledTeams: schedules.length,
        membersNotified: userIds.length,
        pushSent: totalSent,
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
