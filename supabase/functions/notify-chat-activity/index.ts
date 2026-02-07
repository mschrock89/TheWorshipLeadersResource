import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// This function is called by a cron job every 30 minutes
// It checks if chat activity in the last 30 mins is higher than the average
// and sends a push notification if so

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Checking chat activity levels...");

    // Get message count for the last 30 minutes
    const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { count: recentCount, error: recentError } = await supabase
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .gte("created_at", thirtyMinsAgo);

    if (recentError) {
      throw new Error(`Failed to get recent messages: ${recentError.message}`);
    }

    console.log(`Messages in last 30 mins: ${recentCount}`);

    // Get average message count per 30-min window over the last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 1000).toISOString();
    const { count: weekCount, error: weekError } = await supabase
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .gte("created_at", sevenDaysAgo);

    if (weekError) {
      throw new Error(`Failed to get week messages: ${weekError.message}`);
    }

    // Calculate average per 30-min window (336 windows in 7 days)
    const windowsIn7Days = 336;
    const avgPerWindow = (weekCount || 0) / windowsIn7Days;
    
    console.log(`Average messages per 30-min window: ${avgPerWindow.toFixed(2)}`);

    // Threshold: activity must be at least 3x the average and at least 5 messages
    const activityThreshold = Math.max(avgPerWindow * 3, 5);
    const currentActivity = recentCount || 0;

    if (currentActivity < activityThreshold) {
      console.log(`Activity (${currentActivity}) below threshold (${activityThreshold.toFixed(0)}), no notification`);
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Activity normal",
          recentMessages: currentActivity,
          threshold: activityThreshold,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`High activity detected! ${currentActivity} messages (threshold: ${activityThreshold.toFixed(0)})`);

    // Get all users who have push notifications enabled
    const { data: subscriptions, error: subError } = await supabase
      .from("push_subscriptions")
      .select("user_id");

    if (subError) {
      console.error("Error fetching subscriptions:", subError);
    }

    const userIds = [...new Set(subscriptions?.map(s => s.user_id) || [])];

    if (userIds.length === 0) {
      console.log("No users with push subscriptions");
      return new Response(
        JSON.stringify({ success: true, message: "No subscribers to notify" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine which campus is most active
    const { data: campusActivity, error: campusError } = await supabase
      .from("chat_messages")
      .select("campus_id, campuses!inner(name)")
      .gte("created_at", thirtyMinsAgo);

    let campusName = "your campus";
    if (!campusError && campusActivity && campusActivity.length > 0) {
      // Count messages per campus
      const campusCounts: Record<string, { count: number; name: string }> = {};
      for (const msg of campusActivity) {
        const cid = msg.campus_id;
        // deno-lint-ignore no-explicit-any
        const campusData = msg.campuses as any;
        const cname = campusData?.name || "Unknown";
        if (!campusCounts[cid]) {
          campusCounts[cid] = { count: 0, name: cname };
        }
        campusCounts[cid].count++;
      }
      // Find most active
      let maxCount = 0;
      for (const [, data] of Object.entries(campusCounts)) {
        if (data.count > maxCount) {
          maxCount = data.count;
          campusName = data.name;
        }
      }
    }

    // Send push notification
    const pushResponse = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        title: "🔥 Chat is Active!",
        message: `${currentActivity} messages in the last 30 minutes. Join the conversation at ${campusName}!`,
        url: "/chat",
        tag: "chat-activity",
        userIds,
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
        recentMessages: currentActivity,
        threshold: activityThreshold,
        pushSent,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in notify-chat-activity:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
