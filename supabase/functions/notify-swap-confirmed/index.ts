import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

// Helper to send email via Resend API
async function sendEmail(to: string[], subject: string, html: string) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: "ECC Worship <worship@theworshipleadersresource.com>",
      to,
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Resend API error: ${response.status} ${errorText}`);
  }

  return response.json();
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SwapNotificationRequest {
  swapRequestId: string;
}

const PRODUCTION_POSITIONS = new Set([
  "front_of_house",
  "lighting",
  "broadcast_mix",
  "producer",
  "stage_manager",
  "engineer",
]);

const VIDEO_POSITIONS = new Set([
  "video_director",
  "camera_operator",
  "video_switcher",
  "pro_presenter",
  "graphics",
  "director",
  "switcher",
  "tri_pod_camera",
  "hand_held_camera",
  "other",
]);

const WEEKEND_MINISTRY_ALIASES = new Set(["weekend", "weekend_team", "sunday_am", "speaker"]);

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function normalizePosition(position: string | null | undefined): string {
  return (position || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function normalizeMinistryType(ministryType: string | null | undefined): string {
  const normalized = (ministryType || "weekend").trim().toLowerCase();
  return WEEKEND_MINISTRY_ALIASES.has(normalized) ? "weekend_team" : normalized;
}

function getLeaderRolesForSwap(params: {
  position: string | null | undefined;
  ministryType: string | null | undefined;
}) {
  const normalizedPosition = normalizePosition(params.position);
  const normalizedMinistryType = normalizeMinistryType(params.ministryType);

  if (
    VIDEO_POSITIONS.has(normalizedPosition) ||
    (normalizedMinistryType === "video" && !PRODUCTION_POSITIONS.has(normalizedPosition))
  ) {
    return {
      ministryType: "video",
      roles: ["video_director"],
    };
  }

  if (
    PRODUCTION_POSITIONS.has(normalizedPosition) ||
    (normalizedMinistryType === "production" && !VIDEO_POSITIONS.has(normalizedPosition))
  ) {
    return {
      ministryType: "production",
      roles: ["production_manager"],
    };
  }

  return {
    ministryType: normalizedMinistryType,
    roles: [
      "campus_worship_pastor",
      "student_worship_pastor",
      "network_worship_pastor",
      "network_worship_leader",
    ],
  };
}

// ECC Brand Colors: Blue #35B0E5, Dark Blue #27749D, Yellow #FFB838
function generateSwapConfirmedEmailHtml(
  pastorName: string,
  requesterName: string,
  accepterName: string,
  originalDate: string,
  swapDate: string | null,
  position: string,
  teamName: string,
  isDirectSwap: boolean
): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Nunito Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif; background-color: #0a0a0a;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #0d0d0d;">
    <!-- Logo Header -->
    <tr>
      <td style="padding: 32px 48px 16px; text-align: center; background: linear-gradient(180deg, #141414 0%, #0d0d0d 100%);">
        <img src="https://worshipleadersresource.lovable.app/lovable-uploads/c439528b-da42-46da-b665-52d1dfe138fb.png" alt="Experience Music" style="height: 60px; width: auto;" />
      </td>
    </tr>
    
    <!-- Header Text -->
    <tr>
      <td style="padding: 0 48px 24px; text-align: center;">
        <p style="color: #35B0E5; font-size: 12px; font-weight: 600; letter-spacing: 3px; margin: 0; text-transform: uppercase;">Worship Team Portal</p>
      </td>
    </tr>
    
    <!-- Accent Line -->
    <tr>
      <td style="padding: 0 48px;">
        <div style="height: 2px; background: linear-gradient(90deg, transparent, #35B0E5, transparent);"></div>
      </td>
    </tr>
    
    <!-- Main Content -->
    <tr>
      <td style="padding: 32px 48px;">
        <h2 style="color: #ffffff; font-size: 26px; font-weight: 700; line-height: 1.3; margin: 0 0 24px;">
          Swap Request Confirmed 🔄
        </h2>
        
        <p style="color: #a3a3a3; font-size: 16px; line-height: 26px; margin: 0 0 16px;">
          Hey ${pastorName},
        </p>

        <p style="color: #a3a3a3; font-size: 16px; line-height: 26px; margin: 0 0 24px;">
          A swap request has been confirmed between team members. Here are the details:
        </p>

        <!-- Swap Details Box -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px;">
          <tr>
            <td style="background-color: #1a1a1a; border: 1px solid #262626; border-radius: 12px; padding: 24px;">
              <p style="color: #FFB838; font-size: 14px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; margin: 0 0 16px;">
                ${isDirectSwap ? "Direct Swap" : "Open Request Accepted"}
              </p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #262626;">
                    <span style="color: #737373; font-size: 13px;">Position</span><br>
                    <span style="color: #35B0E5; font-size: 15px; font-weight: 600;">${position}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #262626;">
                    <span style="color: #737373; font-size: 13px;">Team</span><br>
                    <span style="color: #ffffff; font-size: 15px; font-weight: 600;">${teamName}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #262626;">
                    <span style="color: #737373; font-size: 13px;">Original Player</span><br>
                    <span style="color: #ffffff; font-size: 15px; font-weight: 600;">${requesterName}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #262626;">
                    <span style="color: #737373; font-size: 13px;">Original Date</span><br>
                    <span style="color: #ffffff; font-size: 15px; font-weight: 600;">${formatDate(originalDate)}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 8px 0;${swapDate ? ' border-bottom: 1px solid #262626;' : ''}">
                    <span style="color: #737373; font-size: 13px;">Covering</span><br>
                    <span style="color: #35B0E5; font-size: 15px; font-weight: 600;">${accepterName}</span>
                  </td>
                </tr>
                ${swapDate ? `
                <tr>
                  <td style="padding: 8px 0;">
                    <span style="color: #737373; font-size: 13px;">Swap Date</span><br>
                    <span style="color: #ffffff; font-size: 15px; font-weight: 600;">${formatDate(swapDate)}</span>
                  </td>
                </tr>
                ` : ""}
              </table>
            </td>
          </tr>
        </table>

        <!-- Action Required Box -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px;">
          <tr>
            <td style="background: linear-gradient(135deg, rgba(53, 176, 229, 0.15), rgba(39, 116, 157, 0.15)); border: 1px solid rgba(53, 176, 229, 0.3); border-radius: 10px; padding: 16px 20px;">
              <p style="color: #35B0E5; font-size: 14px; font-weight: 700; margin: 0 0 4px;">⚡ Action Required</p>
              <p style="color: #a3a3a3; font-size: 14px; margin: 0;">Please update the schedule to reflect this change.</p>
            </td>
          </tr>
        </table>

        <p style="color: #a3a3a3; font-size: 16px; line-height: 26px; margin: 32px 0 0;">
          Blessings,<br>
          <strong style="color: #ffffff;">The ECC Worship Team</strong>
        </p>
      </td>
    </tr>
    
    <!-- Accent Line -->
    <tr>
      <td style="padding: 0 48px;">
        <div style="height: 1px; background: linear-gradient(90deg, transparent, #262626, transparent);"></div>
      </td>
    </tr>
    
    <!-- Footer -->
    <tr>
      <td style="padding: 24px 48px; text-align: center;">
        <p style="color: #525252; font-size: 14px; margin: 0 0 8px;">Experience Community Church</p>
        <p style="color: #404040; font-size: 12px; line-height: 18px; margin: 0;">
          This is an automated notification from the worship team portal.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { swapRequestId }: SwapNotificationRequest = await req.json();

    if (!swapRequestId) {
      return new Response(
        JSON.stringify({ error: "No swap request ID provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing swap notification for request: ${swapRequestId}`);

    // Fetch the swap request with related data
    const { data: swapRequest, error: swapError } = await supabase
      .from("swap_requests")
      .select(`
        id,
        original_date,
        swap_date,
        position,
        team_id,
        status,
        requester_id,
        accepted_by_id,
        target_user_id
      `)
      .eq("id", swapRequestId)
      .single();

    if (swapError || !swapRequest) {
      console.error("Error fetching swap request:", swapError);
      throw new Error("Failed to fetch swap request");
    }

    if (swapRequest.status !== "accepted") {
      return new Response(
        JSON.stringify({ error: "Swap request is not accepted" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch requester profile
    const { data: requester } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", swapRequest.requester_id)
      .single();

    // Fetch accepter profile
    const { data: accepter } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", swapRequest.accepted_by_id)
      .single();

    // Fetch team info
    const { data: team } = await supabase
      .from("worship_teams")
      .select("name")
      .eq("id", swapRequest.team_id)
      .single();

    const { data: scheduleEntry } = await supabase
      .from("team_schedule")
      .select("campus_id, ministry_type")
      .eq("team_id", swapRequest.team_id)
      .eq("schedule_date", swapRequest.original_date)
      .limit(1)
      .maybeSingle();

    const swapCampusId = scheduleEntry?.campus_id || null;
    const leaderAudience = getLeaderRolesForSwap({
      position: swapRequest.position,
      ministryType: scheduleEntry?.ministry_type,
    });

    if (!swapCampusId) {
      console.log("No campus found for requester, skipping notification");
      return new Response(
        JSON.stringify({ success: true, message: "No campus found, no notification sent" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: leaderRoles, error: leaderRolesError } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("role", leaderAudience.roles);

    if (leaderRolesError) {
      throw leaderRolesError;
    }

    const leaderRoleUserIds = [...new Set((leaderRoles || []).map((role) => role.user_id))];

    if (leaderRoleUserIds.length === 0) {
      console.log("No matching leader roles for this swap");
      return new Response(
        JSON.stringify({ success: true, message: "No matching leader roles" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: ministryAssignments, error: ministryAssignmentsError } = await supabase
      .from("user_ministry_campuses")
      .select("user_id")
      .eq("campus_id", swapCampusId)
      .eq("ministry_type", leaderAudience.ministryType)
      .in("user_id", leaderRoleUserIds);

    if (ministryAssignmentsError) {
      throw ministryAssignmentsError;
    }

    const leaderIdsToNotify = [...new Set(
      (ministryAssignments || [])
        .map((assignment) => assignment.user_id)
        .filter((userId) =>
          userId &&
          userId !== swapRequest.requester_id &&
          userId !== swapRequest.accepted_by_id,
        ),
    )];

    if (leaderIdsToNotify.length === 0) {
      console.log("No one to notify");
      return new Response(
        JSON.stringify({ success: true, message: "No one to notify" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    try {
      const pushResponse = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          title: "Swap Request Confirmed",
          message: `${requester?.full_name || "Someone"} and ${accepter?.full_name || "someone"} have confirmed a swap for ${formatDate(swapRequest.original_date)}`,
          url: "/swap-requests",
          tag: "swap-confirmed",
          userIds: leaderIdsToNotify,
        }),
      });

      if (pushResponse.ok) {
        const pushResult = await pushResponse.json();
        console.log(`Push notifications sent: ${pushResult.sent} success, ${pushResult.failed} failed`);
      }
    } catch (pushError) {
      console.error("Failed to send push notifications:", pushError);
      // Don't throw - continue with email notifications
    }

    // Fetch profiles of people to notify
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email, full_name")
      .in("id", leaderIdsToNotify);

    if (!profiles || profiles.length === 0) {
      console.log("No profiles found to notify");
      return new Response(
        JSON.stringify({ success: true, message: "No profiles found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Sending swap notifications to ${profiles.length} people`);

    const isDirectSwap = !!swapRequest.target_user_id;
    let successCount = 0;
    let failCount = 0;

    for (const profile of profiles) {
      try {
        const pastorName = profile.full_name?.split(" ")[0] || "Team Leader";
        
        const html = generateSwapConfirmedEmailHtml(
          pastorName,
          requester?.full_name || "Unknown",
          accepter?.full_name || "Unknown",
          swapRequest.original_date,
          swapRequest.swap_date,
          swapRequest.position,
          team?.name || "Unknown Team",
          isDirectSwap
        );

        await sendEmail(
          [profile.email],
          `Swap Confirmed: ${requester?.full_name} ↔ ${accepter?.full_name}`,
          html
        );

        console.log(`Successfully sent swap notification to ${profile.email}`);
        successCount++;
      } catch (err) {
        console.error(`Error sending to ${profile.email}:`, err);
        failCount++;
      }
    }

    console.log(`Swap notification complete: ${successCount} success, ${failCount} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        sent: successCount,
        failed: failCount,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in notify-swap-confirmed:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
