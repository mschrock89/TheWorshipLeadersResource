import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = (origin: string) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
});

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "*";
  const headers = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "missing_auth_header" }), {
        status: 401,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      return new Response(JSON.stringify({ error: "missing_env_configuration" }), {
        status: 500,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const service = createClient(supabaseUrl, supabaseServiceKey);

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: userError?.message || "unauthorized" }), {
        status: 401,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    const { data: integration, error: integrationError } = await service
      .from("google_integrations")
      .select("id,refresh_token")
      .eq("user_id", user.id)
      .maybeSingle();

    if (integrationError) {
      return new Response(JSON.stringify({ error: `integration_lookup_failed_${integrationError.code ?? "unknown"}`, details: integrationError.message }), {
        status: 500,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    if (!integration?.id) {
      const { error: mappingCleanupError } = await service
        .from("google_calendar_mappings")
        .delete()
        .eq("user_id", user.id);

      if (mappingCleanupError) {
        return new Response(JSON.stringify({ error: `mapping_cleanup_failed_${mappingCleanupError.code ?? "unknown"}`, details: mappingCleanupError.message }), {
          status: 500,
          headers: { ...headers, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        success: true,
        disconnected: false,
        removed_events: 0,
        removed_mappings: 0,
      }), {
        status: 200,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    const { data: mappings, error: mappingsError } = await service
      .from("google_calendar_mappings")
      .select("id,google_event_id,calendar_id")
      .eq("user_id", user.id);

    if (mappingsError) {
      return new Response(JSON.stringify({ error: `mappings_lookup_failed_${mappingsError.code ?? "unknown"}`, details: mappingsError.message }), {
        status: 500,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    let googleAccessToken: string | null = null;
    let revokeAttempted = false;
    let revokeSucceeded = false;

    if (integration.refresh_token) {
      const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID");
      const googleClientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");

      if (googleClientId && googleClientSecret) {
        const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: googleClientId,
            client_secret: googleClientSecret,
            refresh_token: integration.refresh_token,
            grant_type: "refresh_token",
          }),
        });

        const tokenPayload = await tokenResponse.json().catch(() => null);
        if (tokenResponse.ok && tokenPayload?.access_token) {
          googleAccessToken = tokenPayload.access_token;
        }
      }

      revokeAttempted = true;
      const revokeResponse = await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: integration.refresh_token }),
      });
      revokeSucceeded = revokeResponse.ok;
    }

    let removedEvents = 0;
    for (const mapping of mappings ?? []) {
      if (!mapping.google_event_id || !googleAccessToken) continue;

      const deleteResponse = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(mapping.calendar_id || "primary")}/events/${encodeURIComponent(mapping.google_event_id)}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${googleAccessToken}`,
          },
        }
      );

      if (deleteResponse.ok || deleteResponse.status === 404) {
        removedEvents += 1;
      }
    }

    const { error: deleteMappingsError } = await service
      .from("google_calendar_mappings")
      .delete()
      .eq("user_id", user.id);

    if (deleteMappingsError) {
      return new Response(JSON.stringify({ error: `mapping_delete_failed_${deleteMappingsError.code ?? "unknown"}`, details: deleteMappingsError.message }), {
        status: 500,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    const { error: deleteIntegrationError } = await service
      .from("google_integrations")
      .delete()
      .eq("id", integration.id);

    if (deleteIntegrationError) {
      return new Response(JSON.stringify({ error: `integration_delete_failed_${deleteIntegrationError.code ?? "unknown"}`, details: deleteIntegrationError.message }), {
        status: 500,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      disconnected: true,
      removed_events: removedEvents,
      removed_mappings: mappings?.length ?? 0,
      revoke_attempted: revokeAttempted,
      revoke_succeeded: revokeSucceeded,
    }), {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "unexpected_google_disconnect_error",
    }), {
      status: 500,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }
});
