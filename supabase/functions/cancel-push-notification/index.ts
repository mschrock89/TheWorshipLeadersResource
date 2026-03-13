import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CancelPushRequest {
  notificationLogId: string;
  reason?: string;
  sendCorrection?: boolean;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

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

    const { data: roleRows, error: roleError } = await serviceClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    if (roleError) throw roleError;

    const isAdmin = (roleRows || []).some((row) => row.role === "admin");
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { notificationLogId, reason, sendCorrection = false }: CancelPushRequest = await req.json();
    if (!notificationLogId) {
      return new Response(JSON.stringify({ error: "notificationLogId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: notificationLog, error: notificationError } = await serviceClient
      .from("push_notification_logs")
      .update({
        canceled_at: new Date().toISOString(),
        canceled_by: user.id,
        cancel_reason: reason || null,
      })
      .eq("id", notificationLogId)
      .is("canceled_at", null)
      .select("id, title, message, url")
      .single();

    if (notificationError) throw notificationError;

    const { data: recipients, error: recipientsError } = await serviceClient
      .from("push_notification_recipients")
      .select("user_id, delivery_status")
      .eq("notification_log_id", notificationLogId);

    if (recipientsError) throw recipientsError;

    const recipientUserIds = Array.from(
      new Set(
        (recipients || [])
          .filter((recipient) => recipient.delivery_status === "sent")
          .map((recipient) => recipient.user_id)
      )
    );

    await serviceClient
      .from("push_notification_recipients")
      .update({ delivery_status: "canceled" })
      .eq("notification_log_id", notificationLogId);

    let correctionSent = 0;
    if (sendCorrection && recipientUserIds.length > 0) {
      const correctionResponse = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          title: "Notification withdrawn",
          message: `Please ignore the earlier notification${notificationLog.title ? `: ${notificationLog.title}` : "."}`,
          url: notificationLog.url || "/calendar",
          tag: `cancellation-${notificationLogId}`,
          userIds: recipientUserIds,
          createdBy: user.id,
          metadata: {
            canceledNotificationLogId: notificationLogId,
            reason: reason || null,
          },
        }),
      });

      if (correctionResponse.ok) {
        const correctionPayload = await correctionResponse.json();
        correctionSent = correctionPayload.sent || 0;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        canceledNotificationLogId: notificationLog.id,
        affectedUsers: recipientUserIds.length,
        correctionSent,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error canceling push notification:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
