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
        position,
        team_id,
        requester_id,
        target_user_id,
        message,
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
      // Direct swap request - notify the target user
      userIdsToNotify = [swapRequest.target_user_id];
      notificationTitle = "Swap Request";
      notificationMessage = `${requesterName} wants to swap ${swapRequest.position} with you on ${dateStr}`;
    } else {
      // Open swap request - notify team members with same position AND same campus as requester
      
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
      const { data: teamMembers, error: membersError } = await supabase
        .from("team_members")
        .select("user_id")
        .eq("position", swapRequest.position)
        .not("user_id", "is", null)
        .in("user_id", sameCampusUserIds);

      if (membersError) {
        console.error("Error fetching team members:", membersError);
      }

      userIdsToNotify = [...new Set(teamMembers?.map(m => m.user_id!).filter(Boolean) || [])];
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
        url: "/swap-requests",
        tag: "swap-request-new",
        userIds: userIdsToNotify,
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
