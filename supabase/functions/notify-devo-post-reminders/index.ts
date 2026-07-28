import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOOKBACK_MS = 20 * 60 * 1000;

function formatPostDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatPostTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    minute: "2-digit",
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

    const now = new Date();
    const windowStart = new Date(now.getTime() - LOOKBACK_MS).toISOString();
    const windowEnd = now.toISOString();

    let reminderSent = 0;
    let reminderFailed = 0;
    let goLiveNotified = 0;
    let goLiveFailed = 0;
    let markedPosted = 0;
    let permissionsGranted = 0;

    const isPublishedSeriesAssignment = (row: {
      series_id?: string | null;
      series?: { status?: string | null } | null;
    }) => !row.series_id || row.series?.status === "published";

    // 0) Open posting permission for assignees whose lead-up window has started
    const { data: permissionDue, error: permissionError } = await supabase
      .from("devo_assignments")
      .select(
        "id, assignee_id, resource_app_key, permission_starts_at, post_feed_expires_at, permission_duration_days, scheduled_post_at, series_id, series:devo_series(status)",
      )
      .in("status", ["assigned", "guide_uploaded", "scheduled"])
      .not("permission_starts_at", "is", null)
      .lte("permission_starts_at", windowEnd)
      .not("post_feed_expires_at", "is", null)
      .gt("post_feed_expires_at", windowEnd);

    if (permissionError) throw permissionError;

    const publishedPermissionDue = (permissionDue || []).filter(isPublishedSeriesAssignment);

    for (const row of publishedPermissionDue) {
      try {
        const { data: granted, error: grantError } = await supabase.rpc("grant_devo_post_feed", {
          _user_id: row.assignee_id,
          _resource_app: row.resource_app_key,
          _expires_at: row.post_feed_expires_at,
        });
        if (grantError) {
          console.error(`Permission grant failed for ${row.id}:`, grantError.message);
          continue;
        }
        if (granted) permissionsGranted++;
      } catch (err) {
        console.error(`Permission grant failed for ${row.id}:`, err);
      }
    }

    // 1) DEVO assignment reminders at scheduled go-live time
    const { data: dueAssignments, error } = await supabase
      .from("devo_assignments")
      .select(
        "id, assignee_id, chapter_reference, series_title, scheduled_post_at, resource_app_key, feed_post_id, status, series_id, series:devo_series(status)",
      )
      .in("status", ["assigned", "guide_uploaded", "scheduled"])
      .is("reminder_push_sent_at", null)
      .not("scheduled_post_at", "is", null)
      .gte("scheduled_post_at", windowStart)
      .lte("scheduled_post_at", windowEnd);

    if (error) throw error;

    const publishedDueAssignments = (dueAssignments || []).filter(isPublishedSeriesAssignment);

    for (const row of publishedDueAssignments) {
      const scheduled = row.scheduled_post_at as string;
      const chapter = row.chapter_reference as string;
      const seriesTitle = (row.series_title as string | null) || "DEVO";
      const appKey = (row.resource_app_key as string) || "worship";

      try {
        const pushResponse = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            title: `Time to post ${chapter}`,
            message:
              `Your ${chapter} DEVO is going live now on The Feed. Open The Feed to see it — or finish writing in DEVO if you have not yet. Need the how-to? Profile badge → DEVO.`,
            url: `/feed?compose=scripture&reference=${encodeURIComponent(chapter)}`,
            tag: `devo-post-reminder-${row.id}`,
            userIds: [row.assignee_id],
            contextType: "devo-post-reminder",
            metadata: {
              resourceAppKey: appKey,
              vars: {
                chapter,
                post_day: formatPostDay(scheduled),
                post_time: formatPostTime(scheduled),
                series_title: seriesTitle,
              },
            },
          }),
        });

        if (!pushResponse.ok) {
          reminderFailed++;
          console.error(`Reminder push failed for ${row.id}: ${await pushResponse.text()}`);
        } else {
          const result = await pushResponse.json();
          reminderSent += result.sent || 0;
          reminderFailed += result.failed || 0;
        }

        await supabase
          .from("devo_assignments")
          .update({ reminder_push_sent_at: new Date().toISOString() })
          .eq("id", row.id);
      } catch (err) {
        reminderFailed++;
        console.error(`Reminder failed for ${row.id}:`, err);
      }
    }

    // 2) Notify The Feed audience when scheduled posts go live
    const { data: livePosts, error: liveError } = await supabase
      .from("feed_posts")
      .select("id, title, created_by, resource_app_key, campus_id, camp_instance_id, ministry_type, goes_live_at")
      .not("goes_live_at", "is", null)
      .is("go_live_notified_at", null)
      .lte("goes_live_at", windowEnd)
      .gte("goes_live_at", windowStart);

    if (liveError) throw liveError;

    for (const post of livePosts || []) {
      try {
        const notifyResponse = await fetch(`${supabaseUrl}/functions/v1/notify-feed-post`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            postId: post.id,
            resourceAppKey: post.resource_app_key,
            campusId: post.campus_id,
            campInstanceId: post.camp_instance_id,
            ministryType: post.ministry_type,
          }),
        });

        if (!notifyResponse.ok) {
          goLiveFailed++;
          console.error(`Go-live notify failed for ${post.id}: ${await notifyResponse.text()}`);
        } else {
          goLiveNotified++;
        }

        await supabase
          .from("feed_posts")
          .update({ go_live_notified_at: new Date().toISOString() })
          .eq("id", post.id);

        // Mark linked DEVO assignment as posted once live.
        const { data: linked } = await supabase
          .from("devo_assignments")
          .update({ status: "posted" })
          .eq("feed_post_id", post.id)
          .in("status", ["assigned", "guide_uploaded", "scheduled"])
          .select("id");
        markedPosted += linked?.length || 0;
      } catch (err) {
        goLiveFailed++;
        console.error(`Go-live failed for ${post.id}:`, err);
      }
    }

    // Also mark scheduled assignments with past go-live + linked post even outside the narrow window.
    const { data: overdue } = await supabase
      .from("devo_assignments")
      .select("id, feed_post_id")
      .eq("status", "scheduled")
      .not("feed_post_id", "is", null)
      .not("scheduled_post_at", "is", null)
      .lte("scheduled_post_at", windowEnd);

    for (const row of overdue || []) {
      const { error: markError } = await supabase
        .from("devo_assignments")
        .update({ status: "posted" })
        .eq("id", row.id);
      if (!markError) markedPosted++;
    }

    return new Response(
      JSON.stringify({
        success: true,
        permissionsDue: publishedPermissionDue.length,
        permissionsGranted,
        remindersDue: publishedDueAssignments.length,
        reminderSent,
        reminderFailed,
        goLiveDue: (livePosts || []).length,
        goLiveNotified,
        goLiveFailed,
        markedPosted,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error in notify-devo-post-reminders:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
