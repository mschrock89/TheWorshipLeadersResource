import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveFeedAudienceUserIds } from "../_shared/feedAudienceRecipients.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-resource-app-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Frontend-invoked fallback for feed-post pushes (mirrors notify-chat-message).
// The Postgres trigger remains the server-side guarantee for immediate posts;
// scheduled / DEVO go-live is handled here (cron + client). send-push-notification
// dedupes by tag so the two paths never double-send.

interface FeedPostNotifyRequest {
  postId?: string;
  resourceAppKey?: string;
  campusId?: string | null;
  campInstanceId?: string | null;
  ministryType?: string | null;
}

function bearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization");
    const token = bearerToken(authHeader);
    const isServiceRole = Boolean(token && token === supabaseServiceKey);

    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!isServiceRole) {
      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const {
        data: { user },
        error: userError,
      } = await userClient.auth.getUser();

      if (userError || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const body: FeedPostNotifyRequest = await req.json().catch(() => ({}));
    if (!body.postId) {
      return new Response(JSON.stringify({ error: "postId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: post, error: postError } = await supabase
      .from("feed_posts")
      .select("id, title, category, scripture_reference, created_by, resource_app_key, campus_id, camp_instance_id, ministry_type")
      .eq("id", body.postId)
      .maybeSingle();

    if (postError || !post) {
      return new Response(JSON.stringify({ error: "Feed post not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: assignment } = await supabase
      .from("devo_assignments")
      .select("id, chapter_reference, series_title")
      .eq("feed_post_id", post.id)
      .neq("status", "cancelled")
      .maybeSingle();

    const isDevo = Boolean(assignment);
    const campInstanceId = post.camp_instance_id || body.campInstanceId || null;
    const campusId = post.campus_id || body.campusId || null;
    const ministryType = post.ministry_type || body.ministryType || null;
    const resourceAppKey = post.resource_app_key || body.resourceAppKey || null;
    let campResourceAppKeys: string[] = [];

    if (campInstanceId) {
      const { data: camp, error: campError } = await supabase
        .from("camp_instances")
        .select("resource_app_keys")
        .eq("id", campInstanceId)
        .maybeSingle();

      if (campError) {
        console.error("Error loading camp instance for feed push:", campError);
      }

      campResourceAppKeys = Array.isArray(camp?.resource_app_keys) ? camp.resource_app_keys : [];
    }

    const recipientUserIds = await resolveFeedAudienceUserIds(supabase, {
      resourceAppKey,
      campusId,
      ministryType: isDevo && !campInstanceId ? ministryType : null,
      campInstanceId,
      campResourceAppKeys,
      excludeUserId: post.created_by,
    });

    if (recipientUserIds.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No recipients for this feed post", pushSent: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: author } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", post.created_by)
      .maybeSingle();

    const authorName = author?.full_name?.trim() || "Someone";
    const titlePreview = (post.title || "New post").length > 97
      ? `${post.title.slice(0, 97)}...`
      : (post.title || "New post");
    const chapter = assignment?.chapter_reference || post.scripture_reference || "";
    const seriesTitle = assignment?.series_title || "DEVO";

    const pushPayload = isDevo
      ? {
          title: "New DEVO is live",
          message: chapter
            ? `${authorName} shared ${chapter}: ${titlePreview}`
            : `${authorName} shared a new DEVO: ${titlePreview}`,
          url: campInstanceId ? "/camp" : "/feed",
          tag: `devo-live-${post.id}`,
          userIds: recipientUserIds,
          contextType: "devo-live",
          contextId: post.id,
          createdBy: post.created_by,
          metadata: {
            postId: post.id,
            category: post.category,
            resourceAppKey,
            campusId,
            campInstanceId,
            ministryType,
            vars: {
              author: authorName,
              chapter,
              title_preview: titlePreview,
              series_title: seriesTitle,
            },
          },
        }
      : {
          title: campInstanceId ? "New Camp Feed Post" : "New Post in The Feed",
          message: `${authorName} shared: ${titlePreview}`,
          url: campInstanceId ? "/camp" : "/feed",
          tag: `feed-post-${post.id}`,
          userIds: recipientUserIds,
          contextType: "feed-post",
          contextId: post.id,
          createdBy: post.created_by,
          metadata: {
            postId: post.id,
            category: post.category,
            resourceAppKey,
            campusId,
            campInstanceId,
            ministryType,
            vars: {
              author: authorName,
              title_preview: titlePreview,
            },
          },
        };

    let pushSent = 0;
    let pushFailed = 0;
    let pushError: string | null = null;
    try {
      const pushResponse = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify(pushPayload),
      });

      if (!pushResponse.ok) {
        pushError = `send-push-notification returned ${pushResponse.status}`;
        const text = await pushResponse.text();
        console.error(`Feed push failed: ${pushResponse.status} ${text}`);
      } else {
        const result = await pushResponse.json();
        pushSent = result.sent || 0;
        pushFailed = result.failed || 0;
      }
    } catch (error) {
      pushError = error instanceof Error ? error.message : "Unknown error";
      console.error("Error calling send-push-notification:", error);
    }

    return new Response(
      JSON.stringify({
        success: true,
        recipients: recipientUserIds.length,
        pushSent,
        pushFailed,
        pushError,
        contextType: pushPayload.contextType,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error in notify-feed-post:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
