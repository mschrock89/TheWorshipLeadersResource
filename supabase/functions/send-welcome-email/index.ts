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

interface SendEmailRequest {
  userIds: string[];
  isResend?: boolean;
}

interface EmailResult {
  userId: string;
  email: string;
  success: boolean;
  error?: string;
}

// Email HTML template generator - ECC Brand Style
function generateWelcomeEmailHtml(firstName: string, campusName: string | undefined, loginUrl: string, userEmail: string, isResend: boolean): string {
  // ECC Brand Colors: Blue #35B0E5, Dark Blue #27749D, Yellow #FFB838
  // Logo hosted in public assets
  const logoUrl = "https://worshipleadersresource.lovable.app/em-badge.png";
  
  return `
<!DOCTYPE html>
<html style="background-color: #000000;">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body bgcolor="#000000" style="margin: 0; padding: 0; font-family: 'Nunito Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif; background-color: #000000;">
  <!-- Full-bleed background wrapper (helps email clients that ignore body bg) -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#000000" style="background-color: #000000; width: 100%;">
    <tr>
      <td align="center" bgcolor="#000000" style="background-color: #000000; padding: 0;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#000000" style="width: 600px; max-width: 600px; background-color: #000000;">
    <!-- Logo Header -->
    <tr>
      <td style="padding: 32px 48px 16px; text-align: center;">
        <img src="${logoUrl}" alt="Experience Music" style="height: 60px; width: auto;" />
      </td>
    </tr>
    
    <!-- Header Text -->
    <tr>
      <td style="padding: 0 48px 24px; text-align: center;">
        <p style="color: #35B0E5; font-size: 12px; font-weight: 600; letter-spacing: 3px; margin: 0; text-transform: uppercase;">Worship Leader's Resource</p>
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
          ${isResend ? `Hey ${firstName}, just a reminder!` : `Welcome to the team, ${firstName}!`}
        </h2>
        
        <p style="color: #a3a3a3; font-size: 16px; line-height: 26px; margin: 0 0 16px;">
          ${isResend 
            ? `We wanted to make sure you got set up with the Experience Community Worship team portal${campusName ? ` at our <span style="color: #35B0E5; font-weight: 600;">${campusName}</span> campus` : ''}.`
            : `We're thrilled to have you join the Experience Community Worship family${campusName ? ` at our <span style="color: #35B0E5; font-weight: 600;">${campusName}</span> campus` : ''}!`
          }
        </p>

        <p style="color: #a3a3a3; font-size: 16px; line-height: 26px; margin: 0 0 16px;">
          As a member of our worship team, you'll have access to our team portal where you can:
        </p>

        <ul style="color: #a3a3a3; font-size: 16px; line-height: 26px; margin: 0 0 24px; padding-left: 24px;">
          <li style="margin-bottom: 8px;">View upcoming schedules and events</li>
          <li style="margin-bottom: 8px;">Connect with other team members</li>
          <li style="margin-bottom: 8px;">Update your profile and availability</li>
        </ul>

        <p style="color: #a3a3a3; font-size: 16px; line-height: 26px; margin: 0 0 16px;">
          To get started, use these credentials to sign in:
        </p>

        <!-- Credentials Box -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px;">
          <tr>
            <td style="background-color: #1a1a1a; border: 1px solid #262626; border-radius: 12px; padding: 20px;">
              <p style="color: #d4d4d4; font-size: 14px; margin: 0 0 8px;">
                <strong style="color: #737373;">Email:</strong> <span style="color: #35B0E5;">${userEmail}</span>
              </p>
              <p style="color: #d4d4d4; font-size: 14px; margin: 0;">
                <strong style="color: #737373;">Temporary Password:</strong> <code style="background: #262626; padding: 4px 10px; border-radius: 6px; font-family: monospace; color: #FFB838; font-weight: 600;">123456</code>
              </p>
            </td>
          </tr>
        </table>

        <p style="color: #a3a3a3; font-size: 16px; line-height: 26px; margin: 0 0 16px;">
          You'll be asked to create a new password when you first log in.
        </p>

        <!-- Button -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin: 32px 0;">
          <tr>
            <td align="center">
              <a href="${loginUrl}" style="display: inline-block; background: linear-gradient(135deg, #35B0E5, #27749D); border-radius: 10px; color: #ffffff; font-size: 16px; font-weight: 700; text-decoration: none; padding: 16px 40px; box-shadow: 0 4px 20px rgba(53, 176, 229, 0.3);">
                Sign In Now
              </a>
            </td>
          </tr>
        </table>

        <p style="color: #a3a3a3; font-size: 16px; line-height: 26px; margin: 0 0 16px;">
          If you have any questions or need assistance, don't hesitate to reach out to your campus worship pastor. We're here to help you settle in and thrive!
        </p>

        <p style="color: #a3a3a3; font-size: 16px; line-height: 26px; margin: 32px 0 0;">
          See you soon,<br>
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
          This email was sent because you were added to the worship team.<br>
          If you believe this was a mistake, please contact your campus worship pastor.
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
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { userIds, isResend = false }: SendEmailRequest = await req.json();

    if (!userIds || userIds.length === 0) {
      return new Response(
        JSON.stringify({ error: "No user IDs provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing ${userIds.length} welcome emails (isResend: ${isResend})`);

    // Fetch profiles with campus information
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select(`
        id,
        email,
        full_name,
        welcome_email_sent_at
      `)
      .in("id", userIds);

    if (profilesError) {
      console.error("Error fetching profiles:", profilesError);
      throw new Error("Failed to fetch profiles");
    }

    // Fetch campus assignments
    const { data: userCampuses, error: campusError } = await supabase
      .from("user_campuses")
      .select(`
        user_id,
        campuses (name)
      `)
      .in("user_id", userIds);

    if (campusError) {
      console.error("Error fetching campuses:", campusError);
    }

    // Build campus map
    const campusMap: Record<string, string> = {};
    if (userCampuses) {
      for (const uc of userCampuses) {
        if (uc.campuses && typeof uc.campuses === 'object' && 'name' in uc.campuses) {
          campusMap[uc.user_id] = (uc.campuses as { name: string }).name;
        }
      }
    }

    // Get the app URL for login link - use the production app URL
    const appUrl = Deno.env.get("APP_URL") || "https://worshipleadersresource.lovable.app";
    const loginUrl = `${appUrl}/auth`;

    const results: EmailResult[] = [];

    for (const profile of profiles || []) {
      try {
        // Extract first name
        const firstName = profile.full_name?.split(" ")[0] || "Team Member";
        const campusName = campusMap[profile.id];

        // Generate the email HTML
        const html = generateWelcomeEmailHtml(firstName, campusName, loginUrl, profile.email, isResend);

        // Send the email
        await sendEmail(
          [profile.email],
          isResend 
            ? "Reminder: Welcome to the ECC Worship Team!" 
            : "Welcome to the ECC Worship Team!",
          html
        );

        // Update the profile with sent timestamp
        const { error: updateError } = await supabase
          .from("profiles")
          .update({ welcome_email_sent_at: new Date().toISOString() })
          .eq("id", profile.id);

        if (updateError) {
          console.error(`Failed to update profile ${profile.id}:`, updateError);
        }

        console.log(`Successfully sent welcome email to ${profile.email}`);
        results.push({
          userId: profile.id,
          email: profile.email,
          success: true,
        });
      } catch (err) {
        console.error(`Error processing ${profile.email}:`, err);
        results.push({
          userId: profile.id,
          email: profile.email,
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    console.log(`Email sending complete: ${successCount} success, ${failCount} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        sent: successCount,
        failed: failCount,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in send-welcome-email:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
