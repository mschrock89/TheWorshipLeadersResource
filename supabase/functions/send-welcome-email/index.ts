import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const STUDENT_EMAIL_BACKGROUND_URL =
  "https://fgemlokxbugfihaxbfyp.supabase.co/storage/v1/object/public/email-assets/experience-students-email-background.png";

type ResourceAppKey = "my_church_resource" | "worship" | "students_hs" | "students_ms";

const STUDENT_RESOURCE_APP_KEYS = new Set<ResourceAppKey>(["students_hs", "students_ms"]);

// Helper to send email via Resend API
async function sendEmail(to: string[], subject: string, html: string, fromName = "ECC Worship") {
  if (!RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: `${fromName} <worship@theworshipleadersresource.com>`,
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
  "Access-Control-Allow-Headers": [
    "authorization",
    "x-client-info",
    "apikey",
    "content-type",
    "x-resource-app-key",
    "x-supabase-client-platform",
    "x-supabase-client-platform-version",
    "x-supabase-client-runtime",
    "x-supabase-client-runtime-version",
  ].join(", "),
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface SendEmailRequest {
  userIds: string[];
  isResend?: boolean;
  resourceAppKey?: ResourceAppKey;
}

interface EmailResult {
  userId: string;
  email: string;
  success: boolean;
  error?: string;
}

interface WelcomeEmailTheme {
  resourceAppKey: ResourceAppKey;
  fromName: string;
  appName: string;
  appLabel: string;
  portalLabel: string;
  familyLabel: string;
  teamDescription: string;
  contactLabel: string;
  signature: string;
  footerReason: string;
  accent: string;
  accentDark: string;
  warmAccent: string;
  pageBackground: string;
  tableBackground: string;
  headerBackground: string;
  headerText: string;
  bodyText: string;
  mutedText: string;
  borderColor: string;
  credentialsBackground: string;
  backgroundImageUrl?: string;
}

function isStudentResourceAppKey(resourceAppKey: ResourceAppKey) {
  return STUDENT_RESOURCE_APP_KEYS.has(resourceAppKey);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeBaseUrl(url: string) {
  return url.replace(/\/+$/, "");
}

function getLoginUrl(resourceAppKey: ResourceAppKey) {
  const baseUrl = normalizeBaseUrl(Deno.env.get("APP_URL") || "https://worshipleadersresource.lovable.app");
  const url = new URL(baseUrl);
  const appPrefix = resourceAppKey === "students_hs" ? "/hs" : resourceAppKey === "students_ms" ? "/ms" : "";
  const normalizedPathname = url.pathname.replace(/\/+$/, "");
  const hasPrefix = appPrefix && (normalizedPathname === appPrefix || normalizedPathname.startsWith(`${appPrefix}/`));
  url.pathname = `${hasPrefix ? normalizedPathname : `${normalizedPathname}${appPrefix}`}/auth`.replace(/\/+/g, "/");
  url.search = "";
  url.hash = "";
  return url.toString();
}

function getWelcomeEmailTheme(resourceAppKey: ResourceAppKey): WelcomeEmailTheme {
  if (isStudentResourceAppKey(resourceAppKey)) {
    const gradeLabel = resourceAppKey === "students_hs" ? "HS" : "MS";

    return {
      resourceAppKey,
      fromName: "ECC Students",
      appName: `Experience Students ${gradeLabel}`,
      appLabel: "Experience Students",
      portalLabel: `${gradeLabel} Resource`,
      familyLabel: `Experience Students ${gradeLabel}`,
      teamDescription: "student ministry team",
      contactLabel: "student pastor",
      signature: "The ECC Students Team",
      footerReason: "student ministry team",
      accent: "#FF7A1A",
      accentDark: "#E23A12",
      warmAccent: "#FFB21A",
      pageBackground: "#ffffff",
      tableBackground: "#170B05",
      headerBackground: "#FF7A1A",
      headerText: "#ffffff",
      bodyText: "#F8E9DD",
      mutedText: "#F6C7A5",
      borderColor: "#763114",
      credentialsBackground: "#241007",
      backgroundImageUrl: STUDENT_EMAIL_BACKGROUND_URL,
    };
  }

  return {
    resourceAppKey: "worship",
    fromName: "ECC Worship",
    appName: "Experience Music",
    appLabel: "Experience Music",
    portalLabel: "Worship Leader's Resource",
    familyLabel: "Experience Community Worship",
    teamDescription: "worship team",
    contactLabel: "campus worship pastor",
    signature: "The ECC Worship Team",
    footerReason: "worship team",
    accent: "#35B0E5",
    accentDark: "#27749D",
    warmAccent: "#FFB838",
    pageBackground: "#000000",
    tableBackground: "#000000",
    headerBackground: "#000000",
    headerText: "#ffffff",
    bodyText: "#a3a3a3",
    mutedText: "#a3a3a3",
    borderColor: "#262626",
    credentialsBackground: "#1a1a1a",
  };
}

function getWelcomeEmailSubject(theme: WelcomeEmailTheme, isResend: boolean) {
  if (isResend) {
    return `Reminder: Welcome to ${theme.appName}!`;
  }

  return `Welcome to ${theme.appName}!`;
}

// Email HTML template generator - ECC Brand Style
function generateWelcomeEmailHtml(
  firstName: string,
  campusName: string | undefined,
  loginUrl: string,
  userEmail: string,
  isResend: boolean,
  theme: WelcomeEmailTheme,
): string {
  const safeFirstName = escapeHtml(firstName);
  const safeCampusName = campusName ? escapeHtml(campusName) : undefined;
  const safeUserEmail = escapeHtml(userEmail);
  const safeLoginUrl = escapeHtml(loginUrl);
  const headerBackgroundImageAttributes = theme.backgroundImageUrl
    ? ` background="${escapeHtml(theme.backgroundImageUrl)}"`
    : "";
  const headerBackgroundImageStyle = theme.backgroundImageUrl
    ? ` background-image: url('${escapeHtml(theme.backgroundImageUrl)}'); background-size: cover; background-position: center 8%;`
    : "";
  const isStudentEmail = isStudentResourceAppKey(theme.resourceAppKey);
  const headerHtml = isStudentEmail
    ? `
    <!-- Brand Header -->
    <tr>
      <td${headerBackgroundImageAttributes} height="400" style="height: 400px; padding: 0; text-align: center; background-color: ${theme.headerBackground};${headerBackgroundImageStyle} line-height: 0; font-size: 0;">
        &nbsp;
      </td>
    </tr>
    `
    : `
    <!-- Brand Header -->
    <tr>
      <td style="padding: 32px 48px 16px; text-align: center; background-color: ${theme.headerBackground};">
        <div style="color: ${theme.headerText}; font-size: 34px; font-weight: 800; letter-spacing: 0.01em; line-height: 1.1; margin: 0;">
          ${theme.appLabel}
        </div>
      </td>
    </tr>
    
    <!-- Header Text -->
    <tr>
      <td style="padding: 0 48px 24px; text-align: center;">
        <p style="color: ${theme.accent}; font-size: 12px; font-weight: 600; letter-spacing: 3px; margin: 0; text-transform: uppercase;">${theme.portalLabel}</p>
      </td>
    </tr>
    
    <!-- Accent Line -->
    <tr>
      <td style="padding: 0 48px;">
        <div style="height: 2px; background: linear-gradient(90deg, transparent, ${theme.accent}, transparent);"></div>
      </td>
    </tr>
    `;

  return `
<!DOCTYPE html>
<html style="background-color: ${theme.pageBackground};">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body bgcolor="${theme.pageBackground}" style="margin: 0; padding: 0; font-family: 'Nunito Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif; background-color: ${theme.pageBackground};">
  <!-- Full-bleed background wrapper (helps email clients that ignore body bg) -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${theme.pageBackground}" style="background-color: ${theme.pageBackground}; width: 100%;">
    <tr>
      <td align="center" bgcolor="${theme.pageBackground}" style="background-color: ${theme.pageBackground}; padding: 0;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="${theme.tableBackground}" style="width: 600px; max-width: 600px; background-color: ${theme.tableBackground};">
    ${headerHtml}
    
    <!-- Main Content -->
    <tr>
      <td style="padding: 32px 48px;">
        <h2 style="color: ${theme.headerText}; font-size: 26px; font-weight: 700; line-height: 1.3; margin: 0 0 24px;">
          ${isResend ? `Hey ${safeFirstName}, just a reminder!` : `Welcome to the team, ${safeFirstName}!`}
        </h2>
        
        <p style="color: ${theme.bodyText}; font-size: 16px; line-height: 26px; margin: 0 0 16px;">
          ${isResend 
            ? `We wanted to make sure you got set up with the ${theme.familyLabel} team portal${safeCampusName ? ` at our <span style="color: ${theme.accent}; font-weight: 600;">${safeCampusName}</span> campus` : ''}.`
            : `We're thrilled to have you join the ${theme.familyLabel} family${safeCampusName ? ` at our <span style="color: ${theme.accent}; font-weight: 600;">${safeCampusName}</span> campus` : ''}!`
          }
        </p>

        <p style="color: ${theme.bodyText}; font-size: 16px; line-height: 26px; margin: 0 0 16px;">
          As a member of our ${theme.teamDescription}, you'll have access to our team portal where you can:
        </p>

        <ul style="color: ${theme.bodyText}; font-size: 16px; line-height: 26px; margin: 0 0 24px; padding-left: 24px;">
          <li style="margin-bottom: 8px;">View upcoming schedules and events</li>
          <li style="margin-bottom: 8px;">Connect with other team members</li>
          <li style="margin-bottom: 8px;">Update your profile and availability</li>
        </ul>

        <p style="color: ${theme.bodyText}; font-size: 16px; line-height: 26px; margin: 0 0 16px;">
          To get started, use these credentials to sign in:
        </p>

        <!-- Credentials Box -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px;">
          <tr>
            <td style="background-color: ${theme.credentialsBackground}; border: 1px solid ${theme.borderColor}; border-radius: 12px; padding: 20px;">
              <p style="color: #d4d4d4; font-size: 14px; margin: 0 0 8px;">
                <strong style="color: ${theme.mutedText};">Email:</strong> <span style="color: ${theme.accent};">${safeUserEmail}</span>
              </p>
              <p style="color: #d4d4d4; font-size: 14px; margin: 0;">
                <strong style="color: ${theme.mutedText};">Temporary Password:</strong> <code style="background: ${theme.borderColor}; padding: 4px 10px; border-radius: 6px; font-family: monospace; color: ${theme.warmAccent}; font-weight: 600;">123456</code>
              </p>
            </td>
          </tr>
        </table>

        <p style="color: ${theme.bodyText}; font-size: 16px; line-height: 26px; margin: 0 0 16px;">
          You'll be asked to create a new password when you first log in.
        </p>

        <!-- Button -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin: 32px 0;">
          <tr>
            <td align="center">
              <a href="${safeLoginUrl}" style="display: inline-block; background: linear-gradient(135deg, ${theme.accent}, ${theme.accentDark}); border-radius: 10px; color: #ffffff; font-size: 16px; font-weight: 700; text-decoration: none; padding: 16px 40px; box-shadow: 0 4px 20px rgba(255, 122, 26, 0.3);">
                Sign In Now
              </a>
            </td>
          </tr>
        </table>

        <p style="color: ${theme.bodyText}; font-size: 16px; line-height: 26px; margin: 0 0 16px;">
          If you have any questions or need assistance, don't hesitate to reach out to your ${theme.contactLabel}. We're here to help you settle in and thrive!
        </p>

        <p style="color: ${theme.bodyText}; font-size: 16px; line-height: 26px; margin: 32px 0 0;">
          See you soon,<br>
          <strong style="color: ${theme.headerText};">${theme.signature}</strong>
        </p>
      </td>
    </tr>
    
    <!-- Accent Line -->
    <tr>
      <td style="padding: 0 48px;">
        <div style="height: 1px; background: linear-gradient(90deg, transparent, ${theme.borderColor}, transparent);"></div>
      </td>
    </tr>
    
    <!-- Footer -->
    <tr>
      <td style="padding: 24px 48px; text-align: center;">
        <p style="color: ${theme.mutedText}; font-size: 14px; margin: 0 0 8px;">Experience Community Church</p>
        <p style="color: ${theme.mutedText}; font-size: 12px; line-height: 18px; margin: 0;">
          This email was sent because you were added to the ${theme.footerReason}.<br>
          If you believe this was a mistake, please contact your ${theme.contactLabel}.
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

    const { userIds, isResend = false, resourceAppKey = "worship" }: SendEmailRequest = await req.json();
    const normalizedResourceAppKey: ResourceAppKey = isStudentResourceAppKey(resourceAppKey) ? resourceAppKey : "worship";
    const theme = getWelcomeEmailTheme(normalizedResourceAppKey);

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

    const loginUrl = getLoginUrl(normalizedResourceAppKey);

    const results: EmailResult[] = [];

    for (const profile of profiles || []) {
      try {
        // Extract first name
        const firstName = profile.full_name?.split(" ")[0] || "Team Member";
        const campusName = campusMap[profile.id];

        // Generate the email HTML
        const html = generateWelcomeEmailHtml(firstName, campusName, loginUrl, profile.email, isResend, theme);

        // Send the email
        await sendEmail(
          [profile.email],
          getWelcomeEmailSubject(theme, isResend),
          html,
          theme.fromName
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
