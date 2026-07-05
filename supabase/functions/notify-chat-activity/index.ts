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

    // Each resource app (worship / student / church) has its own chat and its own
    // push subscriptions. Evaluate and notify each app independently so a busy
    // Worship chat never pushes to Student installs and vice-versa.
    const RESOURCE_APP_KEYS = ["worship", "students_hs", "students_ms", "my_church_resource"] as const;
    const windowsIn7Days = 336;
    const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 1000).toISOString();

    const perApp: Array<{ resourceAppKey: string; recentMessages: number; threshold: number; pushSent: number }> = [];

    for (const resourceAppKey of RESOURCE_APP_KEYS) {
      // Recent + weekly counts scoped to this app's chat.
      const { count: recentCount, error: recentError } = await supabase
        .from("chat_messages")
        .select("id", { count: "exact", head: true })
        .eq("resource_app_key", resourceAppKey)
        .gte("created_at", thirtyMinsAgo);

      if (recentError) {
        console.error(`[${resourceAppKey}] Failed to get recent messages:`, recentError.message);
        continue;
      }

      const { count: weekCount, error: weekError } = await supabase
        .from("chat_messages")
        .select("id", { count: "exact", head: true })
        .eq("resource_app_key", resourceAppKey)
        .gte("created_at", sevenDaysAgo);

      if (weekError) {
        console.error(`[${resourceAppKey}] Failed to get week messages:`, weekError.message);
        continue;
      }

      const avgPerWindow = (weekCount || 0) / windowsIn7Days;
      // Threshold: activity must be at least 3x the average and at least 5 messages.
      const activityThreshold = Math.max(avgPerWindow * 3, 5);
      const currentActivity = recentCount || 0;

      if (currentActivity < activityThreshold) {
        console.log(`[${resourceAppKey}] Activity (${currentActivity}) below threshold (${activityThreshold.toFixed(0)}), no notification`);
        continue;
      }

      console.log(`[${resourceAppKey}] High activity detected! ${currentActivity} messages (threshold: ${activityThreshold.toFixed(0)})`);

      // Recipients: users subscribed to push under THIS app only.
      const { data: subscriptions, error: subError } = await supabase
        .from("push_subscriptions")
        .select("user_id")
        .eq("resource_app_key", resourceAppKey);

      if (subError) {
        console.error(`[${resourceAppKey}] Error fetching subscriptions:`, subError);
        continue;
      }

      const userIds = [...new Set(subscriptions?.map((s) => s.user_id).filter(Boolean) || [])];
      if (userIds.length === 0) {
        console.log(`[${resourceAppKey}] No subscribers to notify`);
        continue;
      }

      // Determine which campus is most active within this app.
      const { data: campusActivity, error: campusError } = await supabase
        .from("chat_messages")
        .select("campus_id, campuses!inner(name)")
        .eq("resource_app_key", resourceAppKey)
        .gte("created_at", thirtyMinsAgo);

      let campusName = "your campus";
      if (!campusError && campusActivity && campusActivity.length > 0) {
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
        let maxCount = 0;
        for (const [, data] of Object.entries(campusCounts)) {
          if (data.count > maxCount) {
            maxCount = data.count;
            campusName = data.name;
          }
        }
      }

      // Send push scoped to this app (distinct tag per app so pushes don't dedupe together).
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
          tag: `chat-activity-${resourceAppKey}`,
          userIds,
          metadata: { resourceAppKey },
        }),
      });

      let pushSent = 0;
      if (pushResponse.ok) {
        const pushResult = await pushResponse.json();
        pushSent = pushResult.sent || 0;
        console.log(`[${resourceAppKey}] Push notifications sent: ${pushSent}`);
      } else {
        console.error(`[${resourceAppKey}] Failed to send push:`, await pushResponse.text());
      }

      perApp.push({ resourceAppKey, recentMessages: currentActivity, threshold: activityThreshold, pushSent });
    }

    return new Response(
      JSON.stringify({ success: true, notifiedApps: perApp }),
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
