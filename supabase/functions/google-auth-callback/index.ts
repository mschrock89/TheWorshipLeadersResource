import { createClient } from "npm:@supabase/supabase-js@2";

const APP_URL = Deno.env.get("APP_URL") ?? "https://www.theworshipleadersresource.com";
const CALLBACK_URL =
  Deno.env.get("GOOGLE_REDIRECT_URI") ??
  "https://fgemlokxbugfihaxbfyp.functions.supabase.co/google-auth-callback";

const ALLOWED_RETURN_HOSTS = [
  "theworshipleadersresource.com",
  "mychurchresource.com",
  "worship.mychurchresource.com",
  "students.mychurchresource.com",
  "localhost",
  "127.0.0.1",
];

type OAuthState = {
  purpose: "calendar" | "gmail";
  userId: string;
  returnTo?: string;
};

function parseOAuthState(raw: string): OAuthState {
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRe.test(raw)) {
    return { purpose: "calendar", userId: raw };
  }

  if (raw.startsWith("gmail:")) {
    return { purpose: "gmail", userId: raw.slice("gmail:".length) };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<OAuthState>;
    if (parsed?.userId && (parsed.purpose === "gmail" || parsed.purpose === "calendar")) {
      return {
        purpose: parsed.purpose,
        userId: parsed.userId,
        returnTo: typeof parsed.returnTo === "string" ? parsed.returnTo : undefined,
      };
    }
  } catch {
    // Fall through to calendar default for legacy states.
  }

  return { purpose: "calendar", userId: raw };
}

function isAllowedHost(hostname: string): boolean {
  const host = hostname.replace(/^www\./, "").toLowerCase();
  return ALLOWED_RETURN_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

function safeGmailReturnTo(returnTo: string | undefined): string {
  const fallback = `${APP_URL.replace(/\/$/, "")}/audition-inbox`;
  if (!returnTo) return fallback;

  try {
    const url = new URL(returnTo);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1"))) {
      return fallback;
    }
    if (!isAllowedHost(url.hostname)) return fallback;
    if (!url.pathname.includes("audition-inbox")) {
      url.pathname = `${url.pathname.replace(/\/$/, "")}/audition-inbox`;
    }
    url.hash = "";
    return url.toString();
  } catch {
    return fallback;
  }
}

function withQuery(url: string, params: Record<string, string>): string {
  const parsed = new URL(url);
  for (const [key, value] of Object.entries(params)) {
    parsed.searchParams.set(key, value);
  }
  return parsed.toString();
}

function readableGmailError(message: string): string {
  if (/gmail api has not been used in project|gmail api .* disabled/i.test(message)) {
    return "The Gmail API is turned off in Google Cloud. Enable it for this project, wait a minute, then connect again.";
  }
  return message.length > 280 ? `${message.slice(0, 277)}...` : message;
}

Deno.serve(async (req) => {
  let gmailReturnTo: string | null = null;

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const parsedState = state ? parseOAuthState(state) : null;
    gmailReturnTo = parsedState?.purpose === "gmail" ? safeGmailReturnTo(parsedState.returnTo) : null;
    const errorRedirect = (message: string) => {
      console.error(JSON.stringify({ gmail_oauth_failed: parsedState?.purpose === "gmail", message }));
      if (parsedState?.purpose === "gmail") {
        return Response.redirect(
          withQuery(gmailReturnTo || `${APP_URL}/audition-inbox`, { error: readableGmailError(message) }),
          302,
        );
      }
      return Response.redirect(
        `${APP_URL}/settings/planning-center?error=${encodeURIComponent(message)}`,
        302,
      );
    };

    if (!code) {
      return errorRedirect("missing_oauth_code");
    }

    if (!parsedState?.userId) {
      return errorRedirect("missing_oauth_state");
    }

    const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const googleClientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!googleClientId || !googleClientSecret || !supabaseUrl || !serviceRoleKey) {
      return errorRedirect("google_oauth_not_configured");
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
      access_token?: string;
      refresh_token?: string;
      error?: string;
      error_description?: string;
    } = await tokenRes.json();

    if (!tokenRes.ok) {
      const errorMessage = tokenData.error_description || tokenData.error || "google_token_exchange_failed";
      return errorRedirect(`Google refused the connection: ${errorMessage}`);
    }

    if (!tokenData.refresh_token) {
      return errorRedirect(
        "Google signed you in, but did not give ongoing access to the inbox. Open your Google Account permissions, remove Worship Leader's Resource, then connect Gmail again.",
      );
    }

    const userId = parsedState.userId;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    if (parsedState.purpose === "gmail") {
      if (!tokenData.access_token) {
        return errorRedirect("missing_access_token");
      }

      const profileRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const profile = await profileRes.json().catch(() => ({}));
      if (!profileRes.ok || !profile?.emailAddress) {
        const googleMessage = profile?.error?.message || profile?.error || `Gmail profile request failed (${profileRes.status})`;
        return errorRedirect(`Gmail could not be opened: ${googleMessage}`);
      }

      const { error: upsertError } = await supabase.from("gmail_integrations").upsert(
        {
          user_id: userId,
          email_address: String(profile.emailAddress).toLowerCase(),
          refresh_token: tokenData.refresh_token,
          // Leave the history cursor empty so the first sync searches existing mail.
          history_id: null,
          last_synced_at: null,
          last_sync_error: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

      if (upsertError) {
        return errorRedirect(`The inbox connection could not be saved: ${upsertError.message || upsertError.code || "unknown error"}`);
      }

      return Response.redirect(withQuery(gmailReturnTo || `${APP_URL}/audition-inbox`, { gmail_connected: "1" }), 302);
    }

    const { error: upsertError } = await supabase
      .from("google_integrations")
      .upsert(
        {
          user_id: userId,
          refresh_token: tokenData.refresh_token,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

    if (upsertError) {
      return errorRedirect(`save_connection_failed_${upsertError.code || "unknown"}`);
    }

    return Response.redirect(`${APP_URL}/settings/planning-center?google_connected=1`, 302);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unexpected_google_callback_error";
    console.error(JSON.stringify({ gmail_oauth_failed: true, message }));
    if (gmailReturnTo) {
      return Response.redirect(withQuery(gmailReturnTo, { error: readableGmailError(message) }), 302);
    }
    return Response.redirect(
      `${APP_URL}/settings/planning-center?error=${encodeURIComponent(message)}`,
      302,
    );
  }
});
