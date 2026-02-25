import { createClient } from "npm:@supabase/supabase-js@2";

const DEFAULT_TIME_ZONE = Deno.env.get("GOOGLE_CALENDAR_TIMEZONE") ?? "America/Chicago";

const corsHeaders = (origin: string) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
});

type SyncSourceType = "event" | "setlist";

interface SyncSource {
  sourceType: SyncSourceType;
  sourceId: string;
  summary: string;
  description?: string;
  location?: string;
  start: { date?: string; dateTime?: string; timeZone?: string };
  end: { date?: string; dateTime?: string; timeZone?: string };
}

interface MappingRow {
  id: string;
  source_type: SyncSourceType;
  source_id: string;
  google_event_id: string;
  calendar_id: string;
}

const formatDate = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const addDays = (date: string, days: number): string => {
  const base = new Date(`${date}T00:00:00`);
  base.setDate(base.getDate() + days);
  return formatDate(base);
};

const normalizeTime = (time: string): string => {
  if (!time) return "00:00:00";
  const clean = time.trim();
  if (/^\d{2}:\d{2}:\d{2}$/.test(clean)) return clean;
  if (/^\d{2}:\d{2}$/.test(clean)) return `${clean}:00`;
  return clean.slice(0, 8);
};

const addMinutesToTime = (time: string, minutes: number): string => {
  const [h, m, s] = normalizeTime(time).split(":").map((v) => Number(v) || 0);
  const totalSeconds = h * 3600 + m * 60 + s + minutes * 60;
  const wrapped = ((totalSeconds % 86400) + 86400) % 86400;
  const hh = String(Math.floor(wrapped / 3600)).padStart(2, "0");
  const mm = String(Math.floor((wrapped % 3600) / 60)).padStart(2, "0");
  const ss = String(wrapped % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
};

const formatMinistry = (value: string | null | undefined): string => {
  if (!value) return "Ministry";
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const createAllDayRange = (date: string) => ({
  start: { date },
  end: { date: addDays(date, 1) },
});

const createTimedRange = (date: string, startTime: string, endTime?: string | null) => {
  const normalizedStart = normalizeTime(startTime);
  const normalizedEnd = normalizeTime(endTime || addMinutesToTime(startTime, 60));

  return {
    start: {
      dateTime: `${date}T${normalizedStart}`,
      timeZone: DEFAULT_TIME_ZONE,
    },
    end: {
      dateTime: `${date}T${normalizedEnd}`,
      timeZone: DEFAULT_TIME_ZONE,
    },
  };
};

const buildGoogleEventPayload = (source: SyncSource, userId: string) => {
  const payload: Record<string, unknown> = {
    summary: source.summary,
    description: source.description,
    location: source.location,
    start: source.start,
    end: source.end,
    extendedProperties: {
      private: {
        wlr_source_type: source.sourceType,
        wlr_source_id: source.sourceId,
        wlr_user_id: userId,
      },
    },
  };

  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined || value === null || value === "") {
      delete payload[key];
    }
  }

  return payload;
};

const googleRequest = async (
  accessToken: string,
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: Record<string, unknown>
) => {
  const response = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  return { response, payload };
};

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
    const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const googleClientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey || !googleClientId || !googleClientSecret) {
      return new Response(JSON.stringify({ error: "missing_env_configuration" }), {
        status: 500,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

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

    const service = createClient(supabaseUrl, supabaseServiceKey);

    const { data: integration, error: integrationError } = await service
      .from("google_integrations")
      .select("refresh_token")
      .eq("user_id", user.id)
      .maybeSingle();

    if (integrationError) {
      return new Response(
        JSON.stringify({
          error: `integration_lookup_failed_${integrationError.code ?? "unknown"}`,
          details: integrationError.message,
        }),
        {
          status: 500,
          headers: { ...headers, "Content-Type": "application/json" },
        }
      );
    }

    if (!integration?.refresh_token) {
      return new Response(JSON.stringify({ error: "google_not_connected" }), {
        status: 400,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

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

    const tokenPayload = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenPayload?.access_token) {
      return new Response(
        JSON.stringify({
          error: "google_refresh_token_failed",
          details: tokenPayload?.error_description || tokenPayload?.error || "unknown",
        }),
        {
          status: 502,
          headers: { ...headers, "Content-Type": "application/json" },
        }
      );
    }

    const googleAccessToken: string = tokenPayload.access_token;
    const calendarId = "primary";

    const now = new Date();
    const fromDate = formatDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
    const toDate = formatDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 180));

    const { data: campusRows, error: campusError } = await service
      .from("user_campuses")
      .select("campus_id")
      .eq("user_id", user.id);

    if (campusError) {
      return new Response(
        JSON.stringify({
          error: `campus_lookup_failed_${campusError.code ?? "unknown"}`,
          details: campusError.message,
        }),
        {
          status: 500,
          headers: { ...headers, "Content-Type": "application/json" },
        }
      );
    }

    const campusIds = Array.from(new Set((campusRows ?? []).map((row: { campus_id: string }) => row.campus_id)));

    if (campusIds.length === 0) {
      const { data: profile } = await service
        .from("profiles")
        .select("default_campus_id")
        .eq("id", user.id)
        .maybeSingle();
      if (profile?.default_campus_id) {
        campusIds.push(profile.default_campus_id);
      }
    }

    const eventSources: SyncSource[] = [];
    const fetchedEventIds = new Set<string>();

    const appendEvents = (rows: any[] | null) => {
      for (const row of rows ?? []) {
        if (!row?.id || fetchedEventIds.has(row.id)) continue;
        fetchedEventIds.add(row.id);

        const title = row.title || "Team Event";
        const campusName = row.campuses?.name ?? undefined;
        const eventDate = row.event_date;
        if (!eventDate) continue;

        let range: { start: SyncSource["start"]; end: SyncSource["end"] };
        if (row.start_time) {
          range = createTimedRange(eventDate, row.start_time, row.end_time);
        } else {
          range = createAllDayRange(eventDate);
        }

        eventSources.push({
          sourceType: "event",
          sourceId: row.id,
          summary: title,
          description: row.description ?? undefined,
          location: campusName,
          start: range.start,
          end: range.end,
        });
      }
    };

    if (campusIds.length > 0) {
      const { data: campusEvents, error: campusEventsError } = await service
        .from("events")
        .select("id,title,description,event_date,start_time,end_time,campus_id,campuses(name)")
        .in("campus_id", campusIds)
        .gte("event_date", fromDate)
        .lte("event_date", toDate)
        .order("event_date", { ascending: true });

      if (campusEventsError) {
        return new Response(
          JSON.stringify({
            error: `events_lookup_failed_${campusEventsError.code ?? "unknown"}`,
            details: campusEventsError.message,
          }),
          {
            status: 500,
            headers: { ...headers, "Content-Type": "application/json" },
          }
        );
      }

      appendEvents(campusEvents as any[]);
    }

    const { data: globalEvents, error: globalEventsError } = await service
      .from("events")
      .select("id,title,description,event_date,start_time,end_time,campus_id,campuses(name)")
      .is("campus_id", null)
      .gte("event_date", fromDate)
      .lte("event_date", toDate)
      .order("event_date", { ascending: true });

    if (globalEventsError) {
      return new Response(
        JSON.stringify({
          error: `global_events_lookup_failed_${globalEventsError.code ?? "unknown"}`,
          details: globalEventsError.message,
        }),
        {
          status: 500,
          headers: { ...headers, "Content-Type": "application/json" },
        }
      );
    }

    appendEvents(globalEvents as any[]);

    const { data: publishedSets, error: publishedSetsError } = await service
      .from("draft_sets")
      .select(
        "id,plan_date,ministry_type,campus_id,custom_service_id,campuses(name),custom_services(service_name,start_time,end_time),draft_set_songs(sequence_order,song_key,songs(title))"
      )
      .eq("status", "published")
      .gte("plan_date", fromDate)
      .lte("plan_date", toDate)
      .order("plan_date", { ascending: true });

    if (publishedSetsError) {
      return new Response(
        JSON.stringify({
          error: `published_sets_lookup_failed_${publishedSetsError.code ?? "unknown"}`,
          details: publishedSetsError.message,
        }),
        {
          status: 500,
          headers: { ...headers, "Content-Type": "application/json" },
        }
      );
    }

    const setlistSources: SyncSource[] = [];
    for (const set of (publishedSets as any[]) ?? []) {
      const { data: isOnRoster, error: rosterError } = await service.rpc("is_user_on_setlist_roster", {
        p_draft_set_id: set.id,
        p_user_id: user.id,
      });

      if (rosterError) {
        return new Response(
          JSON.stringify({
            error: `roster_check_failed_${rosterError.code ?? "unknown"}`,
            details: rosterError.message,
          }),
          {
            status: 500,
            headers: { ...headers, "Content-Type": "application/json" },
          }
        );
      }

      if (!isOnRoster) continue;

      const campusName = set.campuses?.name ?? "Campus";
      const customServiceName = set.custom_services?.service_name ?? null;
      const ministryLabel = formatMinistry(set.ministry_type);
      const summary = customServiceName
        ? `${campusName} • ${customServiceName}`
        : `${campusName} • ${ministryLabel} Setlist`;

      const songs = [...(set.draft_set_songs ?? [])]
        .sort((a, b) => (a.sequence_order ?? 0) - (b.sequence_order ?? 0))
        .map((row, index) => {
          const title = row.songs?.title ?? "Song";
          const songKey = row.song_key ? ` (${row.song_key})` : "";
          return `${index + 1}. ${title}${songKey}`;
        });

      const description = songs.length
        ? `Published setlist\n\nSongs:\n${songs.join("\n")}`
        : "Published setlist";

      let range: { start: SyncSource["start"]; end: SyncSource["end"] };
      if (set.custom_services?.start_time) {
        range = createTimedRange(set.plan_date, set.custom_services.start_time, set.custom_services?.end_time);
      } else {
        range = createAllDayRange(set.plan_date);
      }

      setlistSources.push({
        sourceType: "setlist",
        sourceId: set.id,
        summary,
        description,
        location: campusName,
        start: range.start,
        end: range.end,
      });
    }

    const syncSources = [...eventSources, ...setlistSources];
    const activeSourceKeys = new Set(syncSources.map((source) => `${source.sourceType}:${source.sourceId}`));

    const { data: existingMappings, error: mappingsError } = await service
      .from("google_calendar_mappings")
      .select("id,source_type,source_id,google_event_id,calendar_id")
      .eq("user_id", user.id)
      .in("source_type", ["event", "setlist"]);

    if (mappingsError) {
      return new Response(
        JSON.stringify({
          error: `mappings_lookup_failed_${mappingsError.code ?? "unknown"}`,
          details: mappingsError.message,
        }),
        {
          status: 500,
          headers: { ...headers, "Content-Type": "application/json" },
        }
      );
    }

    const mappingByKey = new Map<string, MappingRow>();
    for (const mapping of (existingMappings as MappingRow[]) ?? []) {
      mappingByKey.set(`${mapping.source_type}:${mapping.source_id}`, mapping);
    }

    const failures: Array<{ sourceType: SyncSourceType; sourceId: string; reason: string }> = [];
    let created = 0;
    let updated = 0;
    let removed = 0;

    const upsertMapping = async (source: SyncSource, googleEventId: string) => {
      const { error } = await service.from("google_calendar_mappings").upsert(
        {
          user_id: user.id,
          source_type: source.sourceType,
          source_id: source.sourceId,
          google_event_id: googleEventId,
          calendar_id: calendarId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,source_type,source_id" }
      );
      return error;
    };

    for (const source of syncSources) {
      const key = `${source.sourceType}:${source.sourceId}`;
      const mapping = mappingByKey.get(key);
      const payload = buildGoogleEventPayload(source, user.id);

      if (mapping?.google_event_id) {
        const updateResult = await googleRequest(
          googleAccessToken,
          `/calendars/${encodeURIComponent(mapping.calendar_id || calendarId)}/events/${encodeURIComponent(mapping.google_event_id)}`,
          "PATCH",
          payload
        );

        if (updateResult.response.ok) {
          updated += 1;
          continue;
        }

        if (updateResult.response.status !== 404) {
          failures.push({
            sourceType: source.sourceType,
            sourceId: source.sourceId,
            reason: `update_failed_${updateResult.response.status}`,
          });
          continue;
        }
      }

      const createResult = await googleRequest(
        googleAccessToken,
        `/calendars/${encodeURIComponent(calendarId)}/events`,
        "POST",
        payload
      );

      if (!createResult.response.ok) {
        failures.push({
          sourceType: source.sourceType,
          sourceId: source.sourceId,
          reason: `create_failed_${createResult.response.status}`,
        });
        continue;
      }

      const googleEventId = (createResult.payload as { id?: string } | null)?.id;
      if (!googleEventId) {
        failures.push({
          sourceType: source.sourceType,
          sourceId: source.sourceId,
          reason: "create_missing_google_event_id",
        });
        continue;
      }

      const mappingError = await upsertMapping(source, googleEventId);
      if (mappingError) {
        // Best effort rollback so we don't orphan Google events without app mapping.
        await googleRequest(
          googleAccessToken,
          `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleEventId)}`,
          "DELETE"
        );
        failures.push({
          sourceType: source.sourceType,
          sourceId: source.sourceId,
          reason: `mapping_upsert_failed_${mappingError.code ?? "unknown"}`,
        });
        continue;
      }

      created += 1;
    }

    for (const mapping of (existingMappings as MappingRow[]) ?? []) {
      const key = `${mapping.source_type}:${mapping.source_id}`;
      if (activeSourceKeys.has(key)) continue;

      await googleRequest(
        googleAccessToken,
        `/calendars/${encodeURIComponent(mapping.calendar_id || calendarId)}/events/${encodeURIComponent(mapping.google_event_id)}`,
        "DELETE"
      );

      const { error: deleteError } = await service
        .from("google_calendar_mappings")
        .delete()
        .eq("id", mapping.id);

      if (deleteError) {
        failures.push({
          sourceType: mapping.source_type,
          sourceId: mapping.source_id,
          reason: `mapping_delete_failed_${deleteError.code ?? "unknown"}`,
        });
        continue;
      }

      removed += 1;
    }

    return new Response(
      JSON.stringify({
        success: true,
        synced_at: new Date().toISOString(),
        totals: {
          source_count: syncSources.length,
          event_count: eventSources.length,
          setlist_count: setlistSources.length,
        },
        results: {
          created,
          updated,
          removed,
          failed: failures.length,
        },
        failures,
      }),
      {
        status: 200,
        headers: { ...headers, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "unexpected_google_sync_error",
      }),
      {
        status: 500,
        headers: { ...headers, "Content-Type": "application/json" },
      }
    );
  }
});
