import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SwapRequestCreatedNotification {
  swapRequestId: string;
}

interface RecipientProfile {
  id: string;
  email: string | null;
  full_name: string | null;
}

const POSITION_LABELS: Record<string, string> = {
  vocalist: "Vocalist",
  lead_vocals: "Lead Vocals",
  harmony_vocals: "Harmony Vocals",
  background_vocals: "Background Vocals",
  keys: "Keys",
  piano: "Piano",
  drums: "Drums",
  bass: "Bass",
  electric_guitar: "EG 1",
  electric_1: "EG 1",
  electric_2: "EG 2",
  acoustic_guitar: "AG 1",
  acoustic_1: "AG 1",
  acoustic_2: "AG 2",
  tracks: "Tracks",
  b3_organ: "B3 Organ",
  video_director: "Video Director",
  front_of_house: "Front of House",
  lighting: "Lighting",
  broadcast_mix: "Broadcast Mix",
  producer: "Producer",
  stage_manager: "Stage Manager",
  camera_operator: "Camera Operator",
  video_switcher: "Video Switcher",
  pro_presenter: "ProPresenter",
  engineer: "Engineer",
};

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

async function sendEmail(to: string[], subject: string, html: string) {
  if (!RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
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

function getFirstName(fullName?: string | null): string {
  const firstName = fullName?.trim().split(/\s+/)[0];
  return firstName || "there";
}

function formatPosition(position: string): string {
  return POSITION_LABELS[position] ||
    position
      .replace(/_/g, " ")
      .replace(/\b\w/g, (part) => part.toUpperCase());
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function generateSwapRequestEmailHtml({
  recipientName,
  requesterName,
  teamName,
  position,
  originalDate,
  swapDate,
  requestType,
  isDirectRequest,
  appUrl,
}: {
  recipientName: string;
  requesterName: string;
  teamName: string;
  position: string;
  originalDate: string;
  swapDate: string | null;
  requestType: string | null;
  isDirectRequest: boolean;
  appUrl: string;
}): string {
  const formattedPosition = escapeHtml(formatPosition(position));
  const formattedRequesterName = escapeHtml(requesterName);
  const formattedTeamName = escapeHtml(teamName);
  const formattedOriginalDate = escapeHtml(formatDate(originalDate));
  const formattedSwapDate = swapDate ? escapeHtml(formatDate(swapDate)) : null;
  const greetingName = escapeHtml(recipientName);
  const swapsUrl = `${appUrl.replace(/\/$/, "")}/swaps`;
  const isCoverRequest = requestType === "fill_in" || !swapDate;
  const headline = isCoverRequest
    ? isDirectRequest
      ? "You’ve Been Asked To Cover"
      : "New Cover Opportunity"
    : isDirectRequest
      ? "You’ve Received A Swap Request"
      : "New Swap Opportunity";
  const intro = isCoverRequest
    ? isDirectRequest
      ? `${formattedRequesterName} asked if you can cover <strong>${formattedPosition}</strong> on <strong>${formattedOriginalDate}</strong> for <strong>${formattedTeamName}</strong>.`
      : `${formattedRequesterName} is looking for someone in your position group to cover <strong>${formattedPosition}</strong> on <strong>${formattedOriginalDate}</strong> for <strong>${formattedTeamName}</strong>.`
    : isDirectRequest
      ? `${formattedRequesterName} wants to swap dates with you for <strong>${formattedPosition}</strong> on <strong>${formattedOriginalDate}</strong>.`
      : `${formattedRequesterName} posted an open swap request for <strong>${formattedPosition}</strong> on <strong>${formattedOriginalDate}</strong> with <strong>${formattedTeamName}</strong>.`;
  const detailLabel = isCoverRequest ? "Need Covered" : "Original Date";
  const actionText = isDirectRequest
    ? "Open the app to respond to this request."
    : "Open the app to view the request and respond if you're available.";

  return `
<!DOCTYPE html>
<html style="background-color: #000000;">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body bgcolor="#000000" style="margin: 0; padding: 0; font-family: 'Nunito Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif; background-color: #000000;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#000000" style="background-color: #000000; width: 100%;">
    <tr>
      <td align="center" bgcolor="#000000" style="background-color: #000000; padding: 0;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#000000" style="width: 600px; max-width: 600px; background-color: #000000;">
          <tr>
            <td style="padding: 32px 48px 16px; text-align: center;">
              <div style="color: #ffffff; font-size: 34px; font-weight: 800; letter-spacing: 0.01em; line-height: 1.1; margin: 0;">
                Experience Music
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 48px 24px; text-align: center;">
              <p style="color: #35B0E5; font-size: 12px; font-weight: 600; letter-spacing: 3px; margin: 0; text-transform: uppercase;">Worship Leader's Resource</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 48px;">
              <div style="height: 2px; background: linear-gradient(90deg, transparent, #35B0E5, transparent);"></div>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 48px;">
              <h2 style="color: #ffffff; font-size: 26px; font-weight: 700; line-height: 1.3; margin: 0 0 24px;">
                ${headline}
              </h2>
              <p style="color: #a3a3a3; font-size: 16px; line-height: 26px; margin: 0 0 16px;">
                Hey ${greetingName},
              </p>
              <p style="color: #a3a3a3; font-size: 16px; line-height: 26px; margin: 0 0 24px;">
                ${intro}
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px;">
                <tr>
                  <td style="background-color: #1a1a1a; border: 1px solid #262626; border-radius: 12px; padding: 20px;">
                    <p style="color: #737373; font-size: 13px; margin: 0 0 8px;">Team</p>
                    <p style="color: #ffffff; font-size: 15px; font-weight: 600; margin: 0 0 16px;">${formattedTeamName}</p>
                    <p style="color: #737373; font-size: 13px; margin: 0 0 8px;">Position</p>
                    <p style="color: #35B0E5; font-size: 15px; font-weight: 600; margin: 0 0 16px;">${formattedPosition}</p>
                    <p style="color: #737373; font-size: 13px; margin: 0 0 8px;">${detailLabel}</p>
                    <p style="color: #ffffff; font-size: 15px; font-weight: 600; margin: 0 0 ${formattedSwapDate ? "16px" : "0"};">${formattedOriginalDate}</p>
                    ${formattedSwapDate ? `
                    <p style="color: #737373; font-size: 13px; margin: 0 0 8px;">Your Swap Date</p>
                    <p style="color: #ffffff; font-size: 15px; font-weight: 600; margin: 0;">${formattedSwapDate}</p>
                    ` : ""}
                  </td>
                </tr>
              </table>
              <p style="color: #a3a3a3; font-size: 16px; line-height: 26px; margin: 0 0 24px;">
                ${actionText}
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 32px 0;">
                <tr>
                  <td align="center">
                    <a href="${swapsUrl}" style="display: inline-block; background: linear-gradient(135deg, #35B0E5, #27749D); border-radius: 10px; color: #ffffff; font-size: 16px; font-weight: 700; text-decoration: none; padding: 16px 40px; box-shadow: 0 4px 20px rgba(53, 176, 229, 0.3);">
                      Open Swap Requests
                    </a>
                  </td>
                </tr>
              </table>
              <p style="color: #a3a3a3; font-size: 16px; line-height: 26px; margin: 32px 0 0;">
                Blessings,<br>
                <strong style="color: #ffffff;">The ECC Worship Team</strong>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 48px;">
              <div style="height: 1px; background: linear-gradient(90deg, transparent, #262626, transparent);"></div>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 48px; text-align: center;">
              <p style="color: #525252; font-size: 14px; margin: 0 0 8px;">Experience Community Church</p>
              <p style="color: #404040; font-size: 12px; line-height: 18px; margin: 0;">
                This is an automated notification from the worship team portal.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
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
    let emailSubject = "";

    if (swapRequest.target_user_id) {
      const isDirectCoverRequest =
        swapRequest.request_type === "fill_in" || !swapRequest.swap_date;

      userIdsToNotify = [swapRequest.target_user_id];
      notificationTitle = isDirectCoverRequest ? "Cover Request" : "Swap Request";
      notificationMessage = isDirectCoverRequest
        ? `${requesterName} asked you to cover ${swapRequest.position} on ${dateStr} for ${teamName}`
        : `${requesterName} wants to swap ${swapRequest.position} with you on ${dateStr}`;
      emailSubject = isDirectCoverRequest
        ? `${requesterName} asked you to cover ${formatPosition(swapRequest.position)}`
        : `${requesterName} sent you a swap request`;
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

      const isOpenCoverRequest = swapRequest.request_type === "fill_in" || !swapRequest.swap_date;
      notificationTitle = isOpenCoverRequest ? "Open Cover Request" : "Open Swap Request";
      notificationMessage = isOpenCoverRequest
        ? `${requesterName} is looking for someone to cover ${swapRequest.position} on ${dateStr} for ${teamName}`
        : `${requesterName} posted a swap request for ${swapRequest.position} on ${dateStr} for ${teamName}`;
      emailSubject = isOpenCoverRequest
        ? `Open cover request for ${formatPosition(swapRequest.position)}`
        : `Open swap request for ${formatPosition(swapRequest.position)}`;
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

    let emailSent = 0;
    let emailSkipped = 0;

    if (!RESEND_API_KEY) {
      console.warn("RESEND_API_KEY is not configured, skipping swap request emails");
    } else {
      const { data: recipientProfiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .in("id", userIdsToNotify);

      if (profilesError) {
        console.error("Failed to fetch swap request email recipients:", profilesError);
      } else {
        const appUrl = Deno.env.get("APP_URL") || "https://worshipleadersresource.lovable.app";

        for (const recipient of (recipientProfiles || []) as RecipientProfile[]) {
          if (!recipient.email) {
            emailSkipped += 1;
            continue;
          }

          try {
            const html = generateSwapRequestEmailHtml({
              recipientName: getFirstName(recipient.full_name),
              requesterName,
              teamName,
              position: swapRequest.position,
              originalDate: swapRequest.original_date,
              swapDate: swapRequest.swap_date,
              requestType: swapRequest.request_type,
              isDirectRequest: Boolean(swapRequest.target_user_id),
              appUrl,
            });

            await sendEmail([recipient.email], emailSubject, html);
            emailSent += 1;
          } catch (emailError) {
            console.error(`Failed to send swap request email to ${recipient.id}:`, emailError);
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        notified: userIdsToNotify.length,
        pushSent,
        emailSent,
        emailSkipped,
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
