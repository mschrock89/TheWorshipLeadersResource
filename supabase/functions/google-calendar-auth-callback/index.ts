import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const APP_URL = Deno.env.get("APP_URL") || "";

function redirectToApp(redirectUri: string, params: Record<string, string>): Response {
  const safeBase = redirectUri || `${APP_URL.replace(/\/$/, "")}/settings/planning-center`;
  const url = new URL(safeBase);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return Response.redirect(url.toString(), 302);
}

serve(async (req) => {
  try {
    const requestUrl = new URL(req.url);
    const code = requestUrl.searchParams.get("code");
    const state = requestUrl.searchParams.get("state");
    const oauthError = requestUrl.searchParams.get("error");

    let redirectUri = `${APP_URL.replace(/\/$/, "")}/settings/planning-center`;

    if (state) {
      try {
        const parsed = JSON.parse(atob(state));
        if (parsed?.redirectUri) {
          redirectUri = parsed.redirectUri;
        }
      } catch {
        // Ignore malformed state and use default redirect.
      }
    }

    if (oauthError) {
      return redirectToApp(redirectUri, { google_error: oauthError });
    }

    if (!code || !GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !SUPABASE_URL) {
      return redirectToApp(redirectUri, { google_error: "invalid_callback" });
    }

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: `${SUPABASE_URL}/functions/v1/google-calendar-auth-callback`,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      const body = await tokenResponse.text();
      console.error("google token exchange failed", body);
      return redirectToApp(redirectUri, { google_error: "token_exchange_failed" });
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token as string | undefined;
    const refreshToken = tokenData.refresh_token as string | undefined;
    const expiresIn = Number(tokenData.expires_in ?? 3600);

    if (!accessToken || !refreshToken) {
      return redirectToApp(redirectUri, { google_error: "missing_tokens" });
    }

    let googleEmail = "";
    try {
      const userInfo = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (userInfo.ok) {
        const info = await userInfo.json();
        googleEmail = (info.email as string | undefined) || "";
      }
    } catch (e) {
      console.error("google userinfo error", e);
    }

    const connectionCode = btoa(JSON.stringify({
      access_token: accessToken,
      refresh_token: refreshToken,
      token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
      google_email: googleEmail,
      calendar_id: "primary",
    }));

    return redirectToApp(redirectUri, { google_connection: connectionCode });
  } catch (error) {
    console.error("google auth callback error", error);
    const fallback = `${APP_URL.replace(/\/$/, "")}/settings/planning-center`;
    return redirectToApp(fallback, { google_error: "callback_failed" });
  }
});
