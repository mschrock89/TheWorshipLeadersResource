import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getValidAccessToken } from "../_shared/google-calendar-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_URL = Deno.env.get("APP_URL") || "";
const APP_TIMEZONE = Deno.env.get("APP_TIMEZONE") || "America/Chicago";

type SyncAction = "sync_setlist" | "sync_event" | "delete_event" | "sync_swap";

type GoogleEventInput = {
  summary: string;
  description?: string;
  location?: string;
  start: { date?: string; dateTime?: string; timeZone?: string };
  end: { date?: string; dateTime?: string; timeZone?: string };
  sourceType: "setlist" | "event";
  sourceId: string;
};

type GoogleConnection = {
  id: string;
  user_id: string;
  calendar_id: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string;
  token_expires_at: string;
};

function addOneDay(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

function formatMinistry(ministryType: string): string {
  const labelMap: Record<string, string> = {
    weekend: "Weekend Worship",
    weekend_team: "Weekend Worship",
    sunday_am: "Weekend Worship",
    prayer_night: "Prayer Night",
    audition: "Audition",
    production: "Production",
    video: "Video",
  };
  return labelMap[ministryType] || ministryType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

async function googleApi(
  method: "POST" | "PATCH" | "DELETE",
  accessToken: string,
  calendarId: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const encodedCalendarId = encodeURIComponent(calendarId || "primary");
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodedCalendarId}${path}`;

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Calendar API ${method} failed (${response.status}): ${text}`);
  }

  if (method === "DELETE") return null;
  return await response.json();
}

async function deleteMappedEvent(
  supabase: ReturnType<typeof createClient>,
  connection: GoogleConnection,
  sourceType: "setlist" | "event",
  sourceId: string,
): Promise<void> {
  const { data: existingSync } = await supabase
    .from("google_calendar_event_syncs")
    .select("id, google_event_id")
    .eq("user_id", connection.user_id)
    .eq("source_type", sourceType)
    .eq("source_id", sourceId)
    .maybeSingle();

  if (!existingSync?.google_event_id) {
    return;
  }

  try {
    const token = await getValidAccessToken(supabase, connection);
    await googleApi("DELETE", token, connection.calendar_id, `/events/${encodeURIComponent(existingSync.google_event_id)}`);
  } catch (error) {
    console.error("Failed deleting mapped Google event", error);
  }

  await supabase
    .from("google_calendar_event_syncs")
    .delete()
    .eq("id", existingSync.id);
}

async function upsertMappedEvent(
  supabase: ReturnType<typeof createClient>,
  connection: GoogleConnection,
  event: GoogleEventInput,
): Promise<void> {
  const { data: existingSync } = await supabase
    .from("google_calendar_event_syncs")
    .select("id, google_event_id")
    .eq("user_id", connection.user_id)
    .eq("source_type", event.sourceType)
    .eq("source_id", event.sourceId)
    .maybeSingle();

  const payload = {
    summary: event.summary,
    description: event.description,
    location: event.location,
    start: event.start,
    end: event.end,
    extendedProperties: {
      private: {
        sourceType: event.sourceType,
        sourceId: event.sourceId,
      },
    },
  };

  const accessToken = await getValidAccessToken(supabase, connection);

  if (existingSync?.google_event_id) {
    try {
      await googleApi(
        "PATCH",
        accessToken,
        connection.calendar_id,
        `/events/${encodeURIComponent(existingSync.google_event_id)}`,
        payload,
      );

      await supabase
        .from("google_calendar_event_syncs")
        .update({ last_synced_at: new Date().toISOString() })
        .eq("id", existingSync.id);

      return;
    } catch (error) {
      console.error("Google PATCH failed, trying fresh insert", error);
    }
  }

  const created = await googleApi("POST", accessToken, connection.calendar_id, "/events", payload) as { id: string };

  await supabase
    .from("google_calendar_event_syncs")
    .upsert({
      user_id: connection.user_id,
      source_type: event.sourceType,
      source_id: event.sourceId,
      google_event_id: created.id,
      metadata: {
        synced_at: new Date().toISOString(),
      },
      last_synced_at: new Date().toISOString(),
    }, { onConflict: "user_id,source_type,source_id" });
}

async function buildSetlistEvent(
  supabase: ReturnType<typeof createClient>,
  draftSetId: string,
): Promise<GoogleEventInput | null> {
  const { data: draftSet, error } = await supabase
    .from("draft_sets")
    .select(`
      id,
      campus_id,
      plan_date,
      ministry_type,
      notes,
      custom_service_id,
      campuses(name),
      custom_services(service_name, service_date, start_time, end_time)
    `)
    .eq("id", draftSetId)
    .maybeSingle();

  if (error) throw error;
  if (!draftSet) return null;

  const { data: songs } = await supabase
    .from("draft_set_songs")
    .select(`
      sequence_order,
      songs(title),
      profiles:vocalist_id(full_name)
    `)
    .eq("draft_set_id", draftSetId)
    .order("sequence_order", { ascending: true });

  const campusName = (draftSet.campuses as { name?: string } | null)?.name || "Campus";
  const customService = draftSet.custom_services as {
    service_name?: string;
    service_date?: string;
    start_time?: string | null;
    end_time?: string | null;
  } | null;

  const serviceName = customService?.service_name || formatMinistry(draftSet.ministry_type);
  const title = `${serviceName} • ${campusName}`;

  const songLines = (songs || []).map((song, index) => {
    const songTitle = (song.songs as { title?: string } | null)?.title || "Untitled Song";
    const vocalist = (song.profiles as { full_name?: string } | null)?.full_name;
    return `${index + 1}. ${songTitle}${vocalist ? ` (${vocalist})` : ""}`;
  });

  const dateLabel = new Date(`${draftSet.plan_date}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const url = APP_URL ? `${APP_URL.replace(/\/$/, "")}/my-setlists?setId=${draftSet.id}` : "";

  const descriptionParts = [
    `${serviceName} at ${campusName}`,
    `Date: ${dateLabel}`,
    songLines.length ? `Songs:\n${songLines.join("\n")}` : "",
    draftSet.notes ? `Notes:\n${draftSet.notes}` : "",
    url ? `Open in app: ${url}` : "",
  ].filter(Boolean);

  if (customService?.start_time) {
    const startTime = customService.start_time.length >= 8
      ? customService.start_time.slice(0, 8)
      : `${customService.start_time}:00`;

    const endRaw = customService.end_time || customService.start_time;
    const endTime = endRaw && endRaw.length >= 8 ? endRaw.slice(0, 8) : `${endRaw}:00`;

    return {
      summary: title,
      description: descriptionParts.join("\n\n"),
      location: campusName,
      start: {
        dateTime: `${draftSet.plan_date}T${startTime}`,
        timeZone: APP_TIMEZONE,
      },
      end: {
        dateTime: `${draftSet.plan_date}T${endTime}`,
        timeZone: APP_TIMEZONE,
      },
      sourceType: "setlist",
      sourceId: draftSet.id,
    };
  }

  return {
    summary: title,
    description: descriptionParts.join("\n\n"),
    location: campusName,
    start: { date: draftSet.plan_date },
    end: { date: addOneDay(draftSet.plan_date) },
    sourceType: "setlist",
    sourceId: draftSet.id,
  };
}

async function buildEventEvent(
  supabase: ReturnType<typeof createClient>,
  eventId: string,
): Promise<GoogleEventInput | null> {
  const { data: event, error } = await supabase
    .from("events")
    .select("id, title, description, event_date, start_time, end_time, campus_id, campuses(name)")
    .eq("id", eventId)
    .maybeSingle();

  if (error) throw error;
  if (!event) return null;

  const campusName = (event.campuses as { name?: string } | null)?.name || "Campus";
  const description = [event.description, `Campus: ${campusName}`].filter(Boolean).join("\n\n");

  if (event.start_time) {
    const startTime = event.start_time.length >= 8 ? event.start_time.slice(0, 8) : `${event.start_time}:00`;
    const endRaw = event.end_time || event.start_time;
    const endTime = endRaw && endRaw.length >= 8 ? endRaw.slice(0, 8) : `${endRaw}:00`;

    return {
      summary: event.title,
      description,
      location: campusName,
      start: {
        dateTime: `${event.event_date}T${startTime}`,
        timeZone: APP_TIMEZONE,
      },
      end: {
        dateTime: `${event.event_date}T${endTime}`,
        timeZone: APP_TIMEZONE,
      },
      sourceType: "event",
      sourceId: event.id,
    };
  }

  return {
    summary: event.title,
    description,
    location: campusName,
    start: { date: event.event_date },
    end: { date: addOneDay(event.event_date) },
    sourceType: "event",
    sourceId: event.id,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const bearer = authHeader.replace("Bearer ", "").trim();
    const isServiceRole = bearer === SUPABASE_SERVICE_ROLE_KEY;

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let authUserId: string | null = null;
    if (!isServiceRole) {
      const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error } = await supabaseUser.auth.getUser();
      if (error || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      authUserId = user.id;
    }

    const body = await req.json();
    const action = body.action as SyncAction;

    if (!action) throw new Error("Missing action");

    if (action === "delete_event") {
      const eventId = body.eventId as string | undefined;
      if (!eventId) throw new Error("eventId is required");

      let deleteQuery = supabaseAdmin
        .from("google_calendar_event_syncs")
        .select("id, user_id, google_event_id")
        .eq("source_type", "event")
        .eq("source_id", eventId);

      if (!isServiceRole && authUserId) {
        deleteQuery = deleteQuery.eq("user_id", authUserId);
      }

      const { data: syncRows, error } = await deleteQuery;
      if (error) throw error;

      if (!syncRows?.length) {
        return new Response(JSON.stringify({ success: true, synced: 0, failed: 0 }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const userIds = Array.from(new Set(syncRows.map((row) => row.user_id)));
      const { data: connections } = await supabaseAdmin
        .from("google_calendar_connections")
        .select("id, user_id, calendar_id, access_token_encrypted, refresh_token_encrypted, token_expires_at")
        .in("user_id", userIds);

      let deleted = 0;
      for (const syncRow of syncRows) {
        const connection = (connections || []).find((c) => c.user_id === syncRow.user_id) as GoogleConnection | undefined;
        if (!connection) continue;

        try {
          const accessToken = await getValidAccessToken(supabaseAdmin, connection);
          await googleApi("DELETE", accessToken, connection.calendar_id, `/events/${encodeURIComponent(syncRow.google_event_id)}`);
        } catch (error) {
          console.error("Failed deleting Google event", error);
        }

        await supabaseAdmin
          .from("google_calendar_event_syncs")
          .delete()
          .eq("id", syncRow.id);

        deleted += 1;
      }

      return new Response(JSON.stringify({ success: true, synced: deleted, failed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "sync_swap") {
      const swapRequestId = body.swapRequestId as string | undefined;
      if (!swapRequestId) throw new Error("swapRequestId is required");

      const { data: swapRequest, error: swapError } = await supabaseAdmin
        .from("swap_requests")
        .select("id, requester_id, accepted_by_id, original_date, swap_date, status")
        .eq("id", swapRequestId)
        .maybeSingle();

      if (swapError) throw swapError;
      if (!swapRequest || swapRequest.status !== "accepted") {
        return new Response(JSON.stringify({ success: true, synced: 0, failed: 0 }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const impactedUsers = Array.from(new Set([
        swapRequest.requester_id,
        swapRequest.accepted_by_id,
      ].filter(Boolean))) as string[];

      const impactedDates = Array.from(new Set([
        swapRequest.original_date,
        swapRequest.swap_date,
      ].filter(Boolean))) as string[];

      const { data: setlists, error: setlistError } = await supabaseAdmin
        .from("draft_sets")
        .select("id")
        .eq("status", "published")
        .in("plan_date", impactedDates);

      if (setlistError) throw setlistError;

      const results = [] as Array<{ synced: number; failed: number }>;

      for (const setlist of setlists || []) {
        const payload = {
          action: "sync_setlist",
          draftSetId: setlist.id,
          userIds: impactedUsers,
        };

        const response = await fetch(`${SUPABASE_URL}/functions/v1/google-calendar-sync`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify(payload),
        });

        const data = await response.json();
        results.push({ synced: data.synced || 0, failed: data.failed || 0 });
      }

      const synced = results.reduce((sum, item) => sum + item.synced, 0);
      const failed = results.reduce((sum, item) => sum + item.failed, 0);

      return new Response(JSON.stringify({ success: true, synced, failed }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const requestedUserIds = Array.isArray(body.userIds)
      ? (body.userIds as string[]).filter(Boolean)
      : [];

    const userIds = isServiceRole
      ? Array.from(new Set(requestedUserIds))
      : Array.from(new Set([...(requestedUserIds.length ? requestedUserIds : []), authUserId!])).filter(Boolean);

    if (!userIds.length) {
      return new Response(JSON.stringify({ success: true, synced: 0, failed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: connections, error: connectionError } = await supabaseAdmin
      .from("google_calendar_connections")
      .select("id, user_id, calendar_id, access_token_encrypted, refresh_token_encrypted, token_expires_at")
      .in("user_id", userIds);

    if (connectionError) throw connectionError;

    const connectionMap = new Map<string, GoogleConnection>(
      ((connections || []) as GoogleConnection[]).map((connection) => [connection.user_id, connection]),
    );

    let eventInput: GoogleEventInput | null = null;

    if (action === "sync_setlist") {
      const draftSetId = body.draftSetId as string | undefined;
      if (!draftSetId) throw new Error("draftSetId is required");
      eventInput = await buildSetlistEvent(supabaseAdmin, draftSetId);
    }

    if (action === "sync_event") {
      const eventId = body.eventId as string | undefined;
      if (!eventId) throw new Error("eventId is required");
      eventInput = await buildEventEvent(supabaseAdmin, eventId);
    }

    if (!eventInput) {
      return new Response(JSON.stringify({ success: true, synced: 0, failed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let synced = 0;
    let failed = 0;

    for (const userId of userIds) {
      const connection = connectionMap.get(userId);
      if (!connection) continue;

      try {
        if (eventInput.sourceType === "setlist") {
          const { data: onRoster, error: rosterError } = await supabaseAdmin.rpc("is_user_on_setlist_roster", {
            p_draft_set_id: eventInput.sourceId,
            p_user_id: userId,
          });

          if (rosterError) {
            throw rosterError;
          }

          if (!onRoster) {
            await deleteMappedEvent(supabaseAdmin, connection, "setlist", eventInput.sourceId);
            continue;
          }
        }

        await upsertMappedEvent(supabaseAdmin, connection, eventInput);
        synced += 1;
      } catch (error) {
        console.error("google sync failed", { userId, action, error });
        failed += 1;
      }
    }

    return new Response(JSON.stringify({ success: true, synced, failed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("google-calendar-sync error", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
