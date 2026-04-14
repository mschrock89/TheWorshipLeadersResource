import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SwapRequestCreatedNotification {
  swapRequestId: string;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { swapRequestId }: SwapRequestCreatedNotification = await req.json();

    if (!swapRequestId) {
      return new Response(
        JSON.stringify({ error: "No swap request ID provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing new swap request notification: ${swapRequestId}`);

    // Fetch the swap request with related data
    const { data: swapRequest, error: swapError } = await supabase
      .from("swap_requests")
      .select(`
        id,
        original_date,
        swap_date,
        position,
        team_id,
        requester_id,
        target_user_id,
        message,
        request_type,
        worship_teams!inner(name)
      `)
      .eq("id", swapRequestId)
      .single();

    if (swapError || !swapRequest) {
      console.error("Error fetching swap request:", swapError);
      throw new Error("Failed to fetch swap request");
    }

    // Fetch requester profile
    const { data: requester } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", swapRequest.requester_id)
      .single();

    const requesterName = requester?.full_name || "A team member";
    // deno-lint-ignore no-explicit-any
    const teamData = swapRequest.worship_teams as any;
    const teamName = teamData?.name || "the team";
    const dateStr = formatDate(swapRequest.original_date);

    // Determine who to notify
    let userIdsToNotify: string[] = [];
    let notificationTitle = "";
    let notificationMessage = "";

    if (swapRequest.target_user_id) {
      const isDirectCoverRequest =
        swapRequest.request_type === "fill_in" || !swapRequest.swap_date;

      userIdsToNotify = [swapRequest.target_user_id];
      notificationTitle = isDirectCoverRequest ? "Cover Request" : "Swap Request";
      notificationMessage = isDirectCoverRequest
        ? `${requesterName} asked you to cover ${swapRequest.position} on ${dateStr} for ${teamName}`
        : `${requesterName} wants to swap ${swapRequest.position} with you on ${dateStr}`;
    } else {
      // Open swap request - notify team members with same position AND same campus as requester
      const isVocalistPosition = ["vocalist", "lead_vocals", "harmony_vocals", "background_vocals"].includes(swapRequest.position);

      const { data: requesterProfile } = await supabase
        .from("profiles")
        .select("gender")
        .eq("id", swapRequest.requester_id)
        .maybeSingle();

      let scheduleMinistryType: string | null = null;
      const { data: matchingSchedule } = await supabase
        .from("team_schedule")
        .select("ministry_type")
        .eq("team_id", swapRequest.team_id)
        .eq("schedule_date", swapRequest.original_date)
        .limit(1)
        .maybeSingle();

      scheduleMinistryType = matchingSchedule?.ministry_type || null;
      
      // First, get the requester's campuses
      const { data: requesterCampuses, error: campusError } = await supabase
        .from("user_campuses")
        .select("campus_id")
        .eq("user_id", swapRequest.requester_id);

      if (campusError) {
        console.error("Error fetching requester campuses:", campusError);
      }

      const requesterCampusIds = requesterCampuses?.map(c => c.campus_id) || [];
      console.log(`Requester campus IDs: ${requesterCampusIds.join(", ")}`);

      if (requesterCampusIds.length === 0) {
        console.log("Requester has no campus assignments, no users to notify");
        return new Response(
          JSON.stringify({ success: true, message: "Requester has no campus", notified: 0 }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get users who share a campus with the requester
      const { data: sameCampusUsers, error: sameCampusError } = await supabase
        .from("user_campuses")
        .select("user_id")
        .in("campus_id", requesterCampusIds)
        .neq("user_id", swapRequest.requester_id);

      if (sameCampusError) {
        console.error("Error fetching same campus users:", sameCampusError);
      }

      const sameCampusUserIds = [...new Set(sameCampusUsers?.map(u => u.user_id) || [])];
      console.log(`Users sharing campus with requester: ${sameCampusUserIds.length}`);

      if (sameCampusUserIds.length === 0) {
        console.log("No other users at requester's campus");
        return new Response(
          JSON.stringify({ success: true, message: "No users at same campus", notified: 0 }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get team members with the same position who are in the same campus
      let teamMembersQuery = supabase
        .from("team_members")
        .select("user_id, ministry_types")
        .not("user_id", "is", null)
        .in("user_id", sameCampusUserIds);

      if (isVocalistPosition) {
        teamMembersQuery = teamMembersQuery.in("position", ["vocalist", "lead_vocals", "harmony_vocals", "background_vocals"]);
      } else {
        teamMembersQuery = teamMembersQuery.eq("position", swapRequest.position);
      }

      const { data: teamMembers, error: membersError } = await teamMembersQuery;

      if (membersError) {
        console.error("Error fetching team members:", membersError);
      }

      let eligibleTeamMembers = teamMembers || [];

      if (scheduleMinistryType) {
        const weekendAliases = new Set(["weekend", "sunday_am", "weekend_team"]);
        eligibleTeamMembers = eligibleTeamMembers.filter((member: any) => {
          const ministryTypes = (member.ministry_types || []) as string[];
          if (ministryTypes.length === 0) return false;
          return ministryTypes.some((ministryType) => {
            if (ministryType === scheduleMinistryType) return true;
            if (weekendAliases.has(ministryType) && weekendAliases.has(scheduleMinistryType)) return true;
            return false;
          });
        });
      }

      let eligibleUserIds = [...new Set(eligibleTeamMembers.map((member: any) => member.user_id).filter(Boolean))];

      if (isVocalistPosition && requesterProfile?.gender && eligibleUserIds.length > 0) {
        const { data: vocalistProfiles } = await supabase
          .from("profiles")
          .select("id, gender")
          .in("id", eligibleUserIds);

        const normalizedRequesterGender = requesterProfile.gender.trim().toLowerCase();
        eligibleUserIds = (vocalistProfiles || [])
          .filter((profile) => ((profile.gender || "").trim().toLowerCase() === normalizedRequesterGender))
          .map((profile) => profile.id);
      }

      userIdsToNotify = eligibleUserIds;
      console.log(`Position members at same campus: ${userIdsToNotify.length}`);
      
      notificationTitle = "Open Swap Request";
      notificationMessage = `${requesterName} is looking for someone to cover ${swapRequest.position} on ${dateStr} for ${teamName}`;
    }

    if (userIdsToNotify.length === 0) {
      console.log("No users to notify");
      return new Response(
        JSON.stringify({ success: true, message: "No users to notify", notified: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Sending push to ${userIdsToNotify.length} users`);

    // Send push notification
    const pushResponse = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        title: notificationTitle,
        message: notificationMessage,
        url: "/swaps",
        tag: `swap-request-${swapRequest.id}`,
        userIds: userIdsToNotify,
        contextType: "swap-request",
        contextId: swapRequest.id,
        createdBy: swapRequest.requester_id,
        metadata: {
          swapRequestId: swapRequest.id,
          requestType: swapRequest.request_type,
          directRequest: Boolean(swapRequest.target_user_id),
          teamId: swapRequest.team_id,
          originalDate: swapRequest.original_date,
          swapDate: swapRequest.swap_date,
        },
      }),
    });

    let pushSent = 0;
    if (pushResponse.ok) {
      const pushResult = await pushResponse.json();
      pushSent = pushResult.sent || 0;
      console.log(`Push notifications sent: ${pushSent}`);
    } else {
      console.error("Failed to send push:", await pushResponse.text());
    }

    return new Response(
      JSON.stringify({
        success: true,
        notified: userIdsToNotify.length,
        pushSent,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in notify-swap-request-created:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
