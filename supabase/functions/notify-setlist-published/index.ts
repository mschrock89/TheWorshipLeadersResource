import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-resource-app-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface NotifyRequest {
  draftSetId: string;
  manual?: boolean;
  previewOnly?: boolean;
}

interface RecipientPreview {
  userId: string;
  name: string;
  hasPushSubscription: boolean;
}

const LEADERSHIP_ROLES = [
  "admin", "campus_admin", "campus_worship_pastor", "student_worship_pastor", "childrens_pastor",
  "network_worship_pastor", "network_worship_leader", "network_student_pastor", "leader",
  "video_director", "production_manager", "campus_pastor",
];
const MANUAL_NOTIFY_ROLES = new Set(LEADERSHIP_ROLES);
const NETWORK_ADMIN_ROLES = new Set([
  "admin",
  "network_worship_pastor",
  "network_worship_leader",
  "network_student_pastor",
]);
const CAMPUS_ADMIN_LIKE_ROLES = new Set([
  "admin",
  "campus_admin",
  "campus_worship_pastor",
  "student_pastor",
  "student_worship_pastor",
  "childrens_pastor",
  "network_worship_pastor",
  "network_worship_leader",
]);
const CAMPUS_WIDE_MANUAL_NOTIFY_ROLES = new Set([
  "campus_worship_pastor",
  "student_pastor",
  "student_worship_pastor",
  "childrens_pastor",
  "leader",
  "video_director",
  "production_manager",
  "campus_pastor",
]);

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
    const existingRoles = userRolesMap.get(userRole.user_id) || [];
    existingRoles.push(userRole.role);
    userRolesMap.set(userRole.user_id, existingRoles);
  }

  return dedupedUserIds.filter((userId) => {
    const roles = userRolesMap.get(userId) || [];
    const hasLeadershipRole = roles.some((role) => LEADERSHIP_ROLES.includes(role));
    const isVolunteer = roles.includes("volunteer") || roles.includes("member");
    // Notify everyone on the roster — volunteers/members as well as rostered leaders.
    // Roster membership is already guaranteed by get_setlist_notifiable_user_ids;
    // this guard just prevents notifying stale accounts with no recognised role.
    return isVolunteer || hasLeadershipRole;
  });
}

async function verifyManualNotifyPermission(
  supabase: ReturnType<typeof createClient>,
  supabaseUrl: string,
  supabaseAnonKey: string,
  authHeader: string | null,
  campusId: string | null,
): Promise<{ allowed: true } | { allowed: false; status: number; error: string }> {
  if (!authHeader?.startsWith("Bearer ")) {
    return { allowed: false, status: 401, error: "Missing authorization header" };
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();

  if (userError || !user) {
    return { allowed: false, status: 401, error: "Unauthorized" };
  }

  const [roleResult, campusResult] = await Promise.all([
    supabase
      .from("user_roles")
      .select("role, admin_campus_id")
      .eq("user_id", user.id),
    supabase
      .from("user_campuses")
      .select("campus_id")
      .eq("user_id", user.id),
  ]);

  if (roleResult.error || campusResult.error) {
    console.error("Failed to verify manual setlist notification permission:", {
      roleError: roleResult.error,
      campusError: campusResult.error,
    });
    return { allowed: false, status: 500, error: "Failed to verify notification permissions" };
  }

  const roleRows = roleResult.data || [];
  const userCampusIds = new Set((campusResult.data || []).map((row) => row.campus_id).filter(Boolean));
  const hasManualNotifyRole = roleRows.some((row) => MANUAL_NOTIFY_ROLES.has(row.role));
  const hasNetworkAccess = roleRows.some((row) => NETWORK_ADMIN_ROLES.has(row.role));
  const hasCampusAdminLikeAccess = roleRows.some((row) =>
    CAMPUS_ADMIN_LIKE_ROLES.has(row.role) &&
    (
      row.role !== "campus_admin" ||
      !campusId ||
      row.admin_campus_id === campusId
    ),
  );
  const hasCampusWideManagerRole = roleRows.some((row) =>
    CAMPUS_WIDE_MANUAL_NOTIFY_ROLES.has(row.role),
  );
  const hasCampusAccess =
    hasNetworkAccess ||
    hasCampusAdminLikeAccess ||
    hasCampusWideManagerRole ||
    !campusId ||
    userCampusIds.has(campusId) ||
    roleRows.some((row) => row.role === "campus_admin" && row.admin_campus_id === campusId);

  if (!hasManualNotifyRole || !hasCampusAccess) {
    return {
      allowed: false,
      status: 403,
      error: "You do not have permission to send this setlist notification",
    };
  }

  return { allowed: true };
}

async function buildRecipientPreview(
  supabase: ReturnType<typeof createClient>,
  userIdsToNotify: string[],
): Promise<RecipientPreview[]> {
  const dedupedUserIds = Array.from(new Set(userIdsToNotify.filter(Boolean)));
  if (dedupedUserIds.length === 0) {
    return [];
  }

  const [{ data: profiles, error: profilesError }, { data: subscriptions, error: subscriptionsError }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", dedupedUserIds),
    supabase
      .from("push_subscriptions")
      .select("user_id")
      .in("user_id", dedupedUserIds),
  ]);

  if (profilesError) {
    console.error("Error fetching notification recipient profiles:", profilesError);
  }

  if (subscriptionsError) {
    console.error("Error fetching notification recipient push subscriptions:", subscriptionsError);
  }

  const profileNameById = new Map(
    (profiles || []).map((profile) => [profile.id, profile.full_name || "Team Member"]),
  );
  const pushEnabledUserIds = new Set((subscriptions || []).map((subscription) => subscription.user_id).filter(Boolean));

  return dedupedUserIds
    .map((userId) => ({
      userId,
      name: profileNameById.get(userId) || "Team Member",
      hasPushSubscription: pushEnabledUserIds.has(userId),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    const { draftSetId, manual = false, previewOnly = false }: NotifyRequest = await req.json();

    if (!draftSetId) {
      return new Response(
        JSON.stringify({ error: "draftSetId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Get the draft set details
    const { data: draftSet, error: draftSetError } = await supabase
      .from("draft_sets")
      .select(`
        id,
        campus_id,
        custom_service_id,
        plan_date,
        ministry_type,
        notes,
        campuses(name)
      `)
      .eq("id", draftSetId)
      .single();

    if (draftSetError || !draftSet) {
      console.error("Draft set not found:", draftSetError);
      return new Response(
        JSON.stringify({ error: "Draft set not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (manual || previewOnly) {
      const permission = await verifyManualNotifyPermission(
        supabase,
        supabaseUrl,
        supabaseAnonKey,
        req.headers.get("authorization") ?? req.headers.get("Authorization"),
        draftSet.campus_id,
      );

      if (!permission.allowed) {
        return new Response(
          JSON.stringify({ error: permission.error }),
          { status: permission.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // 2. Get the songs in this setlist
    const { data: setlistSongs, error: songsError } = await supabase
      .from("draft_set_songs")
      .select(`
        sequence_order,
        songs(title)
      `)
      .eq("draft_set_id", draftSetId)
      .order("sequence_order");

    if (songsError) {
      console.error("Error fetching setlist songs:", songsError);
    }

    const songCount = setlistSongs?.length || 0;

    // 3. Build notification recipient list using the authoritative roster function.
    // get_setlist_notifiable_user_ids handles all set types (audition, custom service,
    // team builder), applies accepted swaps / date overrides, and includes support
    // teams — all in a single DB round-trip.
    let userIdsToNotify: string[] = [];

    const { data: rosterRows, error: rosterError } = await supabase.rpc(
      "get_setlist_notifiable_user_ids",
      { p_draft_set_id: draftSetId },
    );

    if (rosterError) {
      console.error("Error fetching setlist notifiable user IDs:", rosterError);
    } else {
      const allRosterUserIds = (rosterRows || [])
        .map((row: { user_id: string }) => row.user_id)
        .filter(Boolean) as string[];

      // Filter to users with a recognised role (volunteer / member / leadership).
      // This prevents notifying stale accounts that have no role in the system.
      userIdsToNotify = await filterNotifiableRosterUserIds(supabase, allRosterUserIds);
    }

    console.log(`Found ${userIdsToNotify.length} team members to notify for setlist ${draftSetId}`);

    if (previewOnly) {
      const recipients = await buildRecipientPreview(supabase, userIdsToNotify);
      const pushRecipientUserCount = recipients.filter((recipient) => recipient.hasPushSubscription).length;

      return new Response(
        JSON.stringify({
          success: true,
          previewOnly: true,
          recipients,
          teamMembersNotified: userIdsToNotify.length,
          pushRecipientUserCount,
          draftSetId,
          planDate: draftSet.plan_date,
          ministryType: draftSet.ministry_type,
          manual,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 7. Always create setlist playlist for published setlists
    // Audio resolution happens on the client side using album_tracks matching
    // so we create the playlist regardless of songs.audio_url status
    const { error: playlistError } = await supabase
      .from("setlist_playlists")
      .upsert({
        draft_set_id: draftSetId,
        campus_id: draftSet.campus_id,
        service_date: draftSet.plan_date,
        ministry_type: draftSet.ministry_type,
      }, { onConflict: "draft_set_id" });

    if (playlistError) {
      console.error("Error creating setlist playlist:", playlistError);
    } else {
      console.log(`Created setlist playlist for ${draftSetId}`);
    }

    // 8. Send push notifications via OneSignal
    let pushSent = 0;
    let pushFailed = 0;
    let pushRecipientUserCount = 0;

    if (userIdsToNotify.length > 0) {
      const campusName = (draftSet.campuses as { name?: string } | null)?.name || "";
      const formattedDate = new Date(draftSet.plan_date).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });

      const notificationPayload = {
        title: "Setlist Posted",
        message: manual
          ? `The setlist for ${formattedDate}${campusName ? ` at ${campusName}` : ""} is posted.`
          : `${songCount} songs for ${formattedDate}${campusName ? ` at ${campusName}` : ""}`,
        url: `/my-setlists?setId=${draftSetId}`,
        tag: manual ? `setlist-manual-${draftSetId}-${Date.now()}` : `setlist-${draftSetId}`,
        userIds: userIdsToNotify,
        contextType: manual ? "setlist-manual-reminder" : "setlist-published",
        contextId: draftSetId,
        metadata: {
          draftSetId,
          campusId: draftSet.campus_id,
          planDate: draftSet.plan_date,
          ministryType: draftSet.ministry_type,
          manual,
        },
      };

      try {
        const pushResponse = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify(notificationPayload),
        });

        const pushResult = await pushResponse.json();
        console.log("Push notification result:", pushResult);
        pushSent = pushResult.sent || 0;
        pushFailed = pushResult.failed || 0;
        pushRecipientUserCount = pushResult.recipientUserCount || 0;
      } catch (error) {
        console.error("Error calling send-push-notification:", error);
      }
    }

    // 9. Create in-app notifications (insert into a notifications concept if exists)
    // For now, the published set itself serves as the notification via the My Setlists page

    return new Response(
      JSON.stringify({
        success: true,
        teamMembersNotified: userIdsToNotify.length,
        pushRecipientUserCount,
        pushSent,
        pushFailed,
        draftSetId,
        planDate: draftSet.plan_date,
        ministryType: draftSet.ministry_type,
        playlistCreated: true,
        manual,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in notify-setlist-published:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
