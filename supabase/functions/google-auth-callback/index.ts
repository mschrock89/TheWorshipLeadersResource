import { createClient } from "npm:@supabase/supabase-js@2";

const APP_URL = Deno.env.get("APP_URL") ?? "https://www.theworshipleadersresource.com";
const CALLBACK_URL = "https://fgemlokxbugfihaxbfyp.functions.supabase.co/google-auth-callback";

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");

    if (!code) {
      return Response.redirect(
        `${APP_URL}/settings/planning-center?error=${encodeURIComponent("missing_oauth_code")}`,
        302
      );
    }

    if (!state) {
      return Response.redirect(
        `${APP_URL}/settings/planning-center?error=${encodeURIComponent("missing_oauth_state")}`,
        302
      );
    }

    const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const googleClientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!googleClientId || !googleClientSecret || !supabaseUrl || !serviceRoleKey) {
      return Response.redirect(
        `${APP_URL}/settings/planning-center?error=${encodeURIComponent("google_oauth_not_configured")}`,
        302
      );
    }

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: googleClientId,
        client_secret: googleClientSecret,
        redirect_uri: CALLBACK_URL,
        grant_type: "authorization_code",
      }),
    });

    const tokenData: {
      refresh_token?: string;
      error?: string;
      error_description?: string;
    } = await tokenRes.json();

    if (!tokenRes.ok) {
      const errorMessage = tokenData.error_description || tokenData.error || "google_token_exchange_failed";
      return Response.redirect(
        `${APP_URL}/settings/planning-center?error=${encodeURIComponent(errorMessage)}`,
        302
      );
    }

    if (!tokenData.refresh_token) {
      return Response.redirect(
        `${APP_URL}/settings/planning-center?error=${encodeURIComponent("missing_refresh_token")}`,
        302
      );
    }

    // state contains the signed-in Supabase user id from auth-start
    const userId = state;
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { error: upsertError } = await supabase
      .from("google_integrations")
      .upsert(
        {
          user_id: userId,
          refresh_token: tokenData.refresh_token,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (upsertError) {
      return Response.redirect(
        `${APP_URL}/settings/planning-center?error=${encodeURIComponent(`save_connection_failed_${upsertError.code || "unknown"}`)}`,
        302
      );
    }

    return Response.redirect(`${APP_URL}/settings/planning-center?google_connected=1`, 302);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unexpected_google_callback_error";
    return Response.redirect(
      `${APP_URL}/settings/planning-center?error=${encodeURIComponent(message)}`,
      302
    );
  }
});
