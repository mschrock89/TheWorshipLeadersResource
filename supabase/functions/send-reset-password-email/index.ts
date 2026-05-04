import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendResetPasswordEmailRequest {
  email?: string;
  redirectTo?: string;
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
      from: "The Worship Leader's Resource <worship@theworshipleadersresource.com>",
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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getFirstName(fullName?: string | null, fallbackEmail?: string | null): string {
  const fromName = fullName?.trim().split(/\s+/)[0];
  if (fromName) return fromName;

  const emailName = fallbackEmail?.split("@")[0]?.trim();
  if (emailName) {
    return emailName.charAt(0).toUpperCase() + emailName.slice(1);
  }

  return "there";
}

function getBaseAppUrl() {
  return (Deno.env.get("APP_URL") || "https://www.theworshipleadersresource.com").replace(/\/$/, "");
}

function resolveRedirectUrl(redirectTo?: string) {
  const fallback = `${getBaseAppUrl()}/auth`;

  if (!redirectTo?.trim()) return fallback;

  try {
    const parsed = new URL(redirectTo);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
  } catch {
    // Fall back to the default app auth route when redirectTo is invalid.
  }

  return fallback;
}

function generateResetPasswordEmailHtml(firstName: string, resetUrl: string): string {
  const safeFirstName = escapeHtml(firstName);
  const safeResetUrl = escapeHtml(resetUrl);

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
              <div style="color: #ffffff; font-size: 30px; font-weight: 800; letter-spacing: 0.01em; line-height: 1.1; margin: 0;">
                The Worship Leader's Resource
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 48px 24px; text-align: center;">
              <p style="color: #35B0E5; font-size: 12px; font-weight: 600; letter-spacing: 3px; margin: 0; text-transform: uppercase;">Password Reset</p>
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
                Reset your password
              </h2>

              <p style="color: #a3a3a3; font-size: 16px; line-height: 26px; margin: 0 0 16px;">
                Hey ${safeFirstName},
              </p>

              <p style="color: #a3a3a3; font-size: 16px; line-height: 26px; margin: 0 0 16px;">
                We received a request to reset your password for The Worship Leader's Resource.
              </p>

              <p style="color: #a3a3a3; font-size: 16px; line-height: 26px; margin: 0 0 16px;">
                To complete the password reset, click the button below. That will log you in and reset your password back to the default <strong style="color: #FFB838;">123456</strong>.
              </p>

              <p style="color: #a3a3a3; font-size: 16px; line-height: 26px; margin: 0 0 16px;">
                After you are back in the app, open <strong style="color: #ffffff;">My Profile</strong> and set a new password there.
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 32px 0;">
                <tr>
                  <td align="center">
                    <a href="${safeResetUrl}" style="display: inline-block; background: linear-gradient(135deg, #35B0E5, #27749D); border-radius: 10px; color: #ffffff; font-size: 16px; font-weight: 700; text-decoration: none; padding: 16px 40px; box-shadow: 0 4px 20px rgba(53, 176, 229, 0.3);">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px;">
                <tr>
                  <td style="background-color: #1a1a1a; border: 1px solid #262626; border-radius: 12px; padding: 20px;">
                    <p style="color: #737373; font-size: 13px; margin: 0 0 8px;">Having trouble with the button?</p>
                    <p style="color: #d4d4d4; font-size: 14px; line-height: 24px; margin: 0; word-break: break-all;">
                      Copy and paste this link into your browser:<br>
                      <a href="${safeResetUrl}" style="color: #35B0E5; text-decoration: none;">${safeResetUrl}</a>
                    </p>
                  </td>
                </tr>
              </table>

              <p style="color: #a3a3a3; font-size: 16px; line-height: 26px; margin: 0 0 16px;">
                If you didn't request this, you can safely ignore this email. Your password won't change until you finish the reset process.
              </p>

              <p style="color: #a3a3a3; font-size: 16px; line-height: 26px; margin: 32px 0 0;">
                Grace and peace,<br>
                <strong style="color: #ffffff;">The Worship Leader's Resource</strong>
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
              <p style="color: #525252; font-size: 14px; margin: 0 0 8px;">The Worship Leader's Resource</p>
              <p style="color: #404040; font-size: 12px; line-height: 18px; margin: 0;">
                This email was sent because a password reset was requested for your account.
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
    const { email, redirectTo }: SendResetPasswordEmailRequest = await req.json();
    const normalizedEmail = email?.trim().toLowerCase();

    if (!normalizedEmail) {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const finalRedirectTo = resolveRedirectUrl(redirectTo);

    const { data, error } = await adminClient.auth.admin.generateLink({
      type: "recovery",
      email: normalizedEmail,
      options: {
        redirectTo: finalRedirectTo,
      },
    });

    if (error) {
      console.warn(`Password reset link generation skipped for ${normalizedEmail}:`, error.message);
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const actionLink = data.properties?.action_link;
    if (!actionLink) {
      console.warn(`No action link returned for ${normalizedEmail}`);
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const userProfileName =
      typeof data.user?.user_metadata?.full_name === "string"
        ? data.user.user_metadata.full_name
        : typeof data.user?.user_metadata?.name === "string"
          ? data.user.user_metadata.name
          : null;

    const firstName = getFirstName(userProfileName, normalizedEmail);
    const html = generateResetPasswordEmailHtml(firstName, actionLink);

    await sendEmail(
      [normalizedEmail],
      "Reset your password for The Worship Leader's Resource",
      html,
    );

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error in send-reset-password-email:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
