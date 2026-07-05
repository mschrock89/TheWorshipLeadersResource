import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-resource-app-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface NotifyWeekendTrackRequest {
  playlistId: string;
  referenceTrackId: string;
  trackTitle: string;
}

// Roster recipients are resolved by the authoritative get_setlist_notifiable_user_ids
// RPC (the same source the published-setlist push uses), so weekend-track pushes
// stay in sync with setlist pushes for the same set. This guard only drops stale
// accounts that have no recognised role.
const LEADERSHIP_ROLES = [
  "admin", "campus_admin", "campus_worship_pastor", "student_worship_pastor", "childrens_pastor",
  "network_worship_pastor", "network_worship_leader", "leader",
  "video_director", "production_manager", "campus_pastor",
];

async function filterNotifiableRosterUserIds(
  supabase: ReturnType<typeof createClient>,
  userIds: string[],
): Promise<string[]> {
  const dedupedUserIds = Array.from(new Set(userIds.filter(Boolean)));
  if (dedupedUserIds.length === 0) {
    return [];
  }

  const { data: userRoles, error: rolesError } = await supabase
    .from("user_roles")
    .select("user_id, role")
    .in("user_id", dedupedUserIds);

  if (rolesError) {
    console.error("Error fetching user roles:", rolesError);
    return [];
  }

  const userRolesMap = new Map<string, string[]>();
  for (const userRole of userRoles || []) {
    const existingRoles = userRolesMap.get(userRole.user_id as string) || [];
    existingRoles.push(userRole.role as string);
    userRolesMap.set(userRole.user_id as string, existingRoles);
  }

  return dedupedUserIds.filter((userId) => {
    const roles = userRolesMap.get(userId) || [];
    const hasLeadershipRole = roles.some((role) => LEADERSHIP_ROLES.includes(role));
    const isVolunteer = roles.includes("volunteer") || roles.includes("member");
    return isVolunteer || hasLeadershipRole;
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { playlistId, referenceTrackId, trackTitle }: NotifyWeekendTrackRequest = await req.json();

    if (!playlistId || !referenceTrackId || !trackTitle?.trim()) {
      return new Response(
        JSON.stringify({ error: "playlistId, referenceTrackId, and trackTitle are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: playlist, error: playlistError } = await supabase
      .from("setlist_playlists")
      .select(`
        id,
        draft_set_id,
        campus_id,
        service_date,
        ministry_type,
        campuses(name),
        draft_sets(
          id,
          campus_id,
          custom_service_id,
          plan_date,
          ministry_type
        )
      `)
      .eq("id", playlistId)
      .maybeSingle();

    if (playlistError || !playlist) {
      console.error("Playlist not found:", playlistError);
      return new Response(
        JSON.stringify({ error: "Playlist not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const draftSet = playlist.draft_sets as {
      id?: string;
      plan_date?: string;
    } | null;
    if (!draftSet?.id) {
      return new Response(
        JSON.stringify({ error: "Playlist is not linked to a published set" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: trackRecord, error: trackError } = await supabase
      .from("setlist_playlist_reference_tracks")
      .select("id, created_by")
      .eq("id", referenceTrackId)
      .eq("playlist_id", playlistId)
      .maybeSingle();

    if (trackError || !trackRecord) {
      console.error("Reference track not found:", trackError);
      return new Response(
        JSON.stringify({ error: "Reference track not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (trackRecord.created_by && trackRecord.created_by !== user.id) {
      return new Response(
        JSON.stringify({ error: "You can only notify for tracks you uploaded" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Authoritative roster for this set (handles audition / custom service /
    // team builder, plus swaps, overrides, weekend pairing and support teams).
    const { data: rosterRows, error: rosterError } = await supabase.rpc(
      "get_setlist_notifiable_user_ids",
      { p_draft_set_id: draftSet.id },
    );

    if (rosterError) {
      console.error("Error resolving setlist roster:", rosterError);
      throw new Error("Failed to resolve roster recipients");
    }

    const rosterUserIds = Array.from(
      new Set((rosterRows || []).map((row: { user_id: string }) => row.user_id).filter(Boolean)),
    ) as string[];

    let userIdsToNotify = await filterNotifiableRosterUserIds(supabase, rosterUserIds);
    userIdsToNotify = Array.from(new Set(userIdsToNotify)).filter((userId) => userId !== user.id);

    if (userIdsToNotify.length === 0) {
      return new Response(
        JSON.stringify({ success: true, recipients: 0, pushSent: 0, pushFailed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const campusName = (playlist.campuses as { name?: string } | null)?.name || "";
    const formattedDate = new Date(`${draftSet.plan_date}T12:00:00Z`).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });

    let pushSent = 0;
    let pushFailed = 0;
    let pushError: string | null = null;
    try {
      const pushResponse = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          title: "Weekend Tracks Uploaded",
          message: `"${trackTitle.trim()}" was added for ${formattedDate}${campusName ? ` at ${campusName}` : ""}.`,
          url: `/my-setlists?setId=${draftSet.id}`,
          tag: `weekend-track-${referenceTrackId}`,
          userIds: userIdsToNotify,
          contextType: "weekend-track-uploaded",
          contextId: referenceTrackId,
          createdBy: user.id,
          metadata: {
            draftSetId: draftSet.id,
            playlistId,
            referenceTrackId,
            type: "weekend_track_uploaded",
            // Weekend tracks are a Worship-only feature; scope to worship subscriptions.
            resourceAppKey: "worship",
          },
        }),
      });

      if (!pushResponse.ok) {
        pushError = `send-push-notification returned ${pushResponse.status}`;
        const text = await pushResponse.text();
        console.error(`Weekend track push failed: ${pushResponse.status} ${text}`);
      } else {
        const pushResult = await pushResponse.json();
        pushSent = pushResult.sent || 0;
        pushFailed = pushResult.failed || 0;
      }
    } catch (error) {
      pushError = error instanceof Error ? error.message : "Unknown error";
      console.error("Error calling send-push-notification:", error);
    }

    return new Response(
      JSON.stringify({
        success: true,
        recipients: userIdsToNotify.length,
        pushSent,
        pushFailed,
        pushError,
        draftSetId: draftSet.id,
        playlistId,
        referenceTrackId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    console.error("Error in notify-weekend-track-uploaded:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
