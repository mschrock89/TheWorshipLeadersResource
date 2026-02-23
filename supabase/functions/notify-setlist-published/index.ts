import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotifyRequest {
  draftSetId: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    const { draftSetId }: NotifyRequest = await req.json();

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

    // 3. Build notification recipient list
    let userIdsToNotify: string[] = [];

    if (draftSet.ministry_type === "audition") {
      // Audition setlists are handled through explicit assignment flows.
      userIdsToNotify = [];
    } else if (draftSet.custom_service_id) {
      const { data: assignments, error: assignmentsError } = await supabase
        .from("custom_service_assignments")
        .select("user_id")
        .eq("custom_service_id", draftSet.custom_service_id)
        .eq("assignment_date", draftSet.plan_date);

      if (assignmentsError) {
        console.error("Error fetching custom service assignments:", assignmentsError);
      }

      userIdsToNotify = Array.from(
        new Set((assignments || []).map((a) => a.user_id).filter(Boolean))
      ) as string[];

      // Only notify volunteer/member accounts that are actually on this set's roster.
      if (userIdsToNotify.length > 0) {
        const { data: userRoles, error: rolesError } = await supabase
          .from("user_roles")
          .select("user_id, role")
          .in("user_id", userIdsToNotify);

        if (rolesError) {
          console.error("Error fetching user roles:", rolesError);
        }

        const leadershipRoles = [
          "admin", "campus_admin", "campus_worship_pastor", "student_worship_pastor",
          "network_worship_pastor", "network_worship_leader", "leader",
          "video_director", "production_manager", "campus_pastor"
        ];

        const userRolesMap = new Map<string, string[]>();
        for (const ur of userRoles || []) {
          const existing = userRolesMap.get(ur.user_id) || [];
          existing.push(ur.role);
          userRolesMap.set(ur.user_id, existing);
        }

        userIdsToNotify = userIdsToNotify.filter((userId) => {
          const roles = userRolesMap.get(userId) || [];
          const hasLeadershipRole = roles.some((r) => leadershipRoles.includes(r));
          const isVolunteer = roles.includes("volunteer") || roles.includes("member");
          return isVolunteer && !hasLeadershipRole;
        });
      }
    } else {
      // Fall back to standard scheduled-team recipient resolution
      const { data: teamSchedule, error: scheduleError } = await supabase
        .from("team_schedule")
        .select("team_id")
        .eq("schedule_date", draftSet.plan_date)
        .limit(1)
        .maybeSingle();

      if (scheduleError) {
        console.error("Error fetching team schedule:", scheduleError);
      }

      const { data: rotationPeriods, error: rotationError } = await supabase
        .from("rotation_periods")
        .select("id")
        .eq("campus_id", draftSet.campus_id)
        .lte("start_date", draftSet.plan_date)
        .gte("end_date", draftSet.plan_date);

      if (rotationError) {
        console.error("Error fetching rotation periods:", rotationError);
      }

      const rotationPeriodIds = (rotationPeriods || []).map(rp => rp.id);

      if (teamSchedule?.team_id && rotationPeriodIds.length > 0) {
        const { data: teamMembers, error: membersError } = await supabase
          .from("team_members")
          .select("user_id, ministry_types")
          .eq("team_id", teamSchedule.team_id)
          .in("rotation_period_id", rotationPeriodIds)
          .not("user_id", "is", null);

        if (membersError) {
          console.error("Error fetching team members:", membersError);
        }

        // Filter by ministry type
        const filteredMembers = (teamMembers || []).filter(m => {
          if (!m.ministry_types || m.ministry_types.length === 0) return true;
          return m.ministry_types.includes(draftSet.ministry_type);
        });

        const potentialUserIds = filteredMembers
          .map(m => m.user_id)
          .filter(Boolean) as string[];

        // Filter to only include volunteers (exclude leadership roles)
        if (potentialUserIds.length > 0) {
          const { data: userRoles, error: rolesError } = await supabase
            .from("user_roles")
            .select("user_id, role")
            .in("user_id", potentialUserIds);

          if (rolesError) {
            console.error("Error fetching user roles:", rolesError);
          }

          const leadershipRoles = [
            "admin", "campus_admin", "campus_worship_pastor", "student_worship_pastor",
            "network_worship_pastor", "network_worship_leader", "leader",
            "video_director", "production_manager", "campus_pastor"
          ];

          // Build a map of user_id -> roles
          const userRolesMap = new Map<string, string[]>();
          for (const ur of userRoles || []) {
            const existing = userRolesMap.get(ur.user_id) || [];
            existing.push(ur.role);
            userRolesMap.set(ur.user_id, existing);
          }

          // Only include users who are volunteers/members AND don't have leadership role
          const volunteerUserIds = potentialUserIds.filter(userId => {
            const roles = userRolesMap.get(userId) || [];
            const hasLeadershipRole = roles.some(r => leadershipRoles.includes(r));
            const isVolunteer = roles.includes("volunteer") || roles.includes("member");
            return isVolunteer && !hasLeadershipRole;
          });

          // Final roster guard: only notify users who are actually on this set's roster.
          // This uses the same source of truth as confirm permissions.
          const rosterChecks = await Promise.all(
            volunteerUserIds.map(async (userId) => {
              const { data, error } = await supabase.rpc("is_user_on_setlist_roster", {
                p_draft_set_id: draftSetId,
                p_user_id: userId,
              });
              if (error) {
                console.error("Roster check failed for user", userId, error);
                return null;
              }
              return data ? userId : null;
            })
          );

          userIdsToNotify = rosterChecks.filter(Boolean) as string[];
        }
      }
    }

    // Final guard across ALL set types:
    // only notify users who are actually on this set's roster.
    if (userIdsToNotify.length > 0) {
      const dedupedUserIds = Array.from(new Set(userIdsToNotify));
      const rosterChecks = await Promise.all(
        dedupedUserIds.map(async (userId) => {
          const { data, error } = await supabase.rpc("is_user_on_setlist_roster", {
            p_draft_set_id: draftSetId,
            p_user_id: userId,
          });

          if (error) {
            console.error("Final roster check failed for user", userId, error);
            return null;
          }

          return data ? userId : null;
        })
      );

      userIdsToNotify = rosterChecks.filter(Boolean) as string[];
    }

    console.log(`Found ${userIdsToNotify.length} team members to notify for setlist ${draftSetId}`);

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

    if (userIdsToNotify.length > 0) {
      const campusName = (draftSet.campuses as any)?.name || "";
      const formattedDate = new Date(draftSet.plan_date).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });

      const notificationPayload = {
        title: "New Setlist Published",
        message: `${songCount} songs for ${formattedDate}${campusName ? ` at ${campusName}` : ""}`,
        url: `/my-setlists?setId=${draftSetId}`,
        tag: `setlist-${draftSetId}`,
        userIds: userIdsToNotify,
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
        pushSent,
        pushFailed,
        draftSetId,
        planDate: draftSet.plan_date,
        ministryType: draftSet.ministry_type,
        playlistCreated: true,
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
