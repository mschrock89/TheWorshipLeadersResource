import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-resource-app-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SENDER_ROLES = new Set([
  "admin",
  "campus_admin",
  "network_worship_pastor",
  "network_worship_leader",
  "network_student_pastor",
  "campus_worship_pastor",
  "student_pastor",
  "student_worship_pastor",
  "childrens_pastor",
]);

const LEADER_RECIPIENT_ROLES = new Set([
  "leader",
  "ms_leader",
  "ms_leader_weekend",
  "hs_leader",
  "network_student_pastor",
  "student_pastor",
  "student_worship_pastor",
  "campus_worship_pastor",
  "childrens_pastor",
]);

const STUDENT_APP_KEYS = new Set(["students_hs", "students_ms"]);

// Path prefix each resource app is mounted under. Push notifications must open a
// URL inside the target app's PWA scope, otherwise tapping the notification
// lands on the default (worship) app served at the root path.
const RESOURCE_APP_PATH_PREFIXES: Record<string, string> = {
  worship: "",
  students_hs: "/hs",
  students_ms: "/ms",
  my_church_resource: "/admin",
};

function buildAppUrl(resourceAppKey: string, path: string) {
  const prefix = RESOURCE_APP_PATH_PREFIXES[resourceAppKey] ?? "";
  const normalizedPath = path === "/" ? "" : path.startsWith("/") ? path : `/${path}`;
  return `${prefix}${normalizedPath}` || "/";
}

interface AdminPingRequest {
  title?: string;
  message?: string;
  campusId?: string | null;
  resourceAppKey?: string;
  campInstanceId?: string | null;
  ministryKeys?: string[];
  genders?: string[];
  grades?: number[];
  userIds?: string[];
  dryRun?: boolean;
}

interface RecipientPreview {
  id: string;
  full_name: string | null;
  gender: string | null;
}

function normalizeToken(value: string | null | undefined) {
  return (value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

function uniqueNumbers(values: Array<number | string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value)),
    ),
  );
}

function isStudentAppAdmin(roleNames: string[], resourceAppKey: string) {
  return (
    STUDENT_APP_KEYS.has(resourceAppKey) &&
    (roleNames.includes("student_pastor") || roleNames.includes("network_student_pastor"))
  );
}

function hasSendPermission(roleRows: Array<{ role: string; admin_campus_id: string | null }>, resourceAppKey: string, campusId: string | null) {
  const roleNames = roleRows.map((row) => row.role);
  if (roleNames.includes("admin") || isStudentAppAdmin(roleNames, resourceAppKey)) return true;

  return roleRows.some((row) => {
    if (!SENDER_ROLES.has(row.role)) return false;
    if (row.role === "campus_admin") {
      return Boolean(campusId && row.admin_campus_id === campusId);
    }
    return true;
  });
}

function matchesAnyFilter(tokens: Set<string>, filters: string[]) {
  if (filters.length === 0) return true;
  return filters.some((filter) => tokens.has(filter));
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
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

    const body = (await req.json()) as AdminPingRequest;
    const resourceAppKey = body.resourceAppKey || "worship";
    const campInstanceId = body.campInstanceId || null;
    const campusId = body.campusId || null;
    const title = (body.title || "Leader Ping").trim();
    const message = (body.message || "").trim();
    const ministryFilters = uniqueStrings(body.ministryKeys || []).map(normalizeToken).filter(Boolean);
    const genderFilters = uniqueStrings(body.genders || []).map(normalizeToken).filter(Boolean);
    const gradeFilters = uniqueNumbers(body.grades || []);
    const explicitUserIds = uniqueStrings(body.userIds || []);

    if (!body.dryRun && !message) {
      return new Response(
        JSON.stringify({ error: "Message is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const [roleResult, senderProfileResult] = await Promise.all([
      supabase.from("user_roles").select("role, admin_campus_id").eq("user_id", user.id),
      supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    ]);

    if (roleResult.error || senderProfileResult.error) {
      console.error("Failed to load admin ping sender context:", {
        roleError: roleResult.error,
        senderProfileError: senderProfileResult.error,
      });
      return new Response(
        JSON.stringify({ error: "Failed to verify permissions" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const senderRoles = roleResult.data || [];
    if (!hasSendPermission(senderRoles, resourceAppKey, campusId)) {
      return new Response(
        JSON.stringify({ error: "You do not have permission to ping leaders for this audience" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let campResourceAppKeys: string[] = [];
    if (campInstanceId) {
      const { data: camp, error: campError } = await supabase
        .from("camp_instances")
        .select("resource_app_keys")
        .eq("id", campInstanceId)
        .maybeSingle();

      if (campError || !camp) {
        return new Response(
          JSON.stringify({ error: "Camp Mode audience was not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      campResourceAppKeys = Array.isArray(camp.resource_app_keys) ? camp.resource_app_keys : [];
    }

    const targetResourceAppKeys = campResourceAppKeys.length > 0 ? campResourceAppKeys : [resourceAppKey];

    const [
      profileResult,
      recipientRoleResult,
      campusResult,
      ministryCampusResult,
      ministryPositionResult,
      teamMemberResult,
      lifeGroupLeaderResult,
      pushUserResult,
    ] = await Promise.all([
      supabase.from("profiles").select("id, full_name, gender"),
      supabase.from("user_roles").select("user_id, role"),
      campusId
        ? supabase.from("user_campuses").select("user_id, campus_id").eq("campus_id", campusId)
        : Promise.resolve({ data: [], error: null }),
      supabase.from("user_ministry_campuses").select("user_id, campus_id, ministry_type"),
      supabase.from("user_campus_ministry_positions").select("user_id, campus_id, ministry_type, position"),
      supabase
        .from("team_members")
        .select("user_id, team_id, ministry_types, worship_teams(id, name, resource_app_key)")
        .not("user_id", "is", null),
      supabase
        .from("life_group_leaders")
        .select("user_id, life_groups!inner(id, campus_id, resource_app_key, grade_level, gender)"),
      campResourceAppKeys.length > 0
        ? supabase.from("push_subscriptions").select("user_id").in("resource_app_key", campResourceAppKeys)
        : supabase.from("push_subscriptions").select("user_id").eq("resource_app_key", resourceAppKey),
    ]);

    const loadError =
      profileResult.error ||
      recipientRoleResult.error ||
      campusResult.error ||
      ministryCampusResult.error ||
      ministryPositionResult.error ||
      teamMemberResult.error ||
      lifeGroupLeaderResult.error ||
      pushUserResult.error;

    if (loadError) {
      console.error("Failed to load admin ping recipients:", loadError);
      return new Response(
        JSON.stringify({ error: "Failed to resolve ping recipients" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const profilesById = new Map<string, RecipientPreview>(
      (profileResult.data || []).map((profile) => [profile.id, profile]),
    );
    const leaderIds = new Set<string>();
    const pushSubscribedUserIds = new Set<string>((pushUserResult.data || []).map((row) => row.user_id).filter(Boolean));
    const appUserIds = new Set<string>(pushSubscribedUserIds);
    const campusUserIds = new Set<string>((campusResult.data || []).map((row) => row.user_id).filter(Boolean));
    const ministryTokensByUser = new Map<string, Set<string>>();
    const campusTokensByUser = new Map<string, Set<string>>();
    const gradesByUser = new Map<string, Set<number>>();
    const lifeGroupResourceUsers = new Set<string>();

    const addToken = (map: Map<string, Set<string>>, userId: string | null | undefined, token: string | null | undefined) => {
      if (!userId) return;
      const normalized = normalizeToken(token);
      if (!normalized) return;
      const tokens = map.get(userId) || new Set<string>();
      tokens.add(normalized);
      map.set(userId, tokens);
    };

    for (const row of recipientRoleResult.data || []) {
      if (LEADER_RECIPIENT_ROLES.has(row.role)) {
        leaderIds.add(row.user_id);
      }
      if (
        row.role === "leader" ||
        row.role === "network_student_pastor" ||
        row.role === "student_pastor" ||
        row.role === "student_worship_pastor" ||
        (targetResourceAppKeys.includes("students_ms") &&
          (row.role === "ms_leader" || row.role === "ms_leader_weekend")) ||
        (targetResourceAppKeys.includes("students_hs") && row.role === "hs_leader")
      ) {
        appUserIds.add(row.user_id);
      }
    }

    for (const row of ministryCampusResult.data || []) {
      addToken(ministryTokensByUser, row.user_id, row.ministry_type);
      if (row.campus_id) addToken(campusTokensByUser, row.user_id, row.campus_id);
    }

    for (const row of ministryPositionResult.data || []) {
      addToken(ministryTokensByUser, row.user_id, row.ministry_type);
      addToken(ministryTokensByUser, row.user_id, row.position);
      if (row.position === "student_small_group_leader") {
        leaderIds.add(row.user_id);
      }
      if (row.campus_id) addToken(campusTokensByUser, row.user_id, row.campus_id);
    }

    for (const row of teamMemberResult.data || []) {
      const team = Array.isArray(row.worship_teams) ? row.worship_teams[0] : row.worship_teams;
      if (!targetResourceAppKeys.includes(team?.resource_app_key)) continue;

      addToken(ministryTokensByUser, row.user_id, `team:${row.team_id}`);
      addToken(ministryTokensByUser, row.user_id, team?.name);
      for (const ministryType of row.ministry_types || []) {
        addToken(ministryTokensByUser, row.user_id, ministryType);
      }
      appUserIds.add(row.user_id);
    }

    for (const row of lifeGroupLeaderResult.data || []) {
      const group = Array.isArray(row.life_groups) ? row.life_groups[0] : row.life_groups;
      if (!targetResourceAppKeys.includes(group?.resource_app_key)) continue;
      if (campusId && group.campus_id && group.campus_id !== campusId) continue;

      leaderIds.add(row.user_id);
      lifeGroupResourceUsers.add(row.user_id);
      appUserIds.add(row.user_id);
      addToken(ministryTokensByUser, row.user_id, "life_groups");
      addToken(ministryTokensByUser, row.user_id, "small_groups");
      addToken(ministryTokensByUser, row.user_id, group.gender);
      const grades = gradesByUser.get(row.user_id) || new Set<number>();
      grades.add(group.grade_level);
      gradesByUser.set(row.user_id, grades);
    }

    const roleNames = senderRoles.map((row) => row.role);
    const isGlobalSender = roleNames.includes("admin") || isStudentAppAdmin(roleNames, resourceAppKey);
    const allowedExplicitIds = explicitUserIds.filter((userId) => profilesById.has(userId) && leaderIds.has(userId));

    const filteredRecipientIds = Array.from(leaderIds).filter((userId) => {
      if (userId === user.id) return false;
      const profile = profilesById.get(userId);
      if (!profile) return false;

      if (!appUserIds.has(userId) && !lifeGroupResourceUsers.has(userId)) return false;

      if (campusId && !campusUserIds.has(userId)) {
        const campusTokens = campusTokensByUser.get(userId) || new Set<string>();
        const groupCampusMatch = (lifeGroupLeaderResult.data || []).some((row) => {
          const group = Array.isArray(row.life_groups) ? row.life_groups[0] : row.life_groups;
          return row.user_id === userId && group?.campus_id === campusId;
        });
        if (!campusTokens.has(normalizeToken(campusId)) && !groupCampusMatch) return false;
      }

      if (!isGlobalSender && campusId) {
        const hasScopedCampusAdminRole = senderRoles.some((row) => row.role === "campus_admin" && row.admin_campus_id === campusId);
        if (roleNames.includes("campus_admin") && !hasScopedCampusAdminRole) return false;
      }

      if (genderFilters.length > 0 && !genderFilters.includes(normalizeToken(profile.gender))) {
        return false;
      }

      if (gradeFilters.length > 0) {
        const grades = gradesByUser.get(userId) || new Set<number>();
        if (!gradeFilters.some((grade) => grades.has(grade))) return false;
      }

      const ministryTokens = ministryTokensByUser.get(userId) || new Set<string>();
      return matchesAnyFilter(ministryTokens, ministryFilters);
    });

    let recipientUserIds = (explicitUserIds.length > 0 ? allowedExplicitIds : filteredRecipientIds)
      .filter((id) => id !== user.id);

    if (campInstanceId) {
      const accessResults = await Promise.all(
        recipientUserIds.map(async (recipientUserId) => {
          const { data, error } = await supabase.rpc("user_can_access_camp_instance", {
            _user_id: recipientUserId,
            _camp_instance_id: campInstanceId,
          });
          if (error) {
            console.error("Failed to check camp ping access:", error);
            return null;
          }
          return data ? recipientUserId : null;
        }),
      );
      recipientUserIds = accessResults.filter((recipientUserId): recipientUserId is string => Boolean(recipientUserId));
    }
    const recipientPreviews = recipientUserIds
      .map((id) => profilesById.get(id))
      .filter((profile): profile is RecipientPreview => Boolean(profile))
      .sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));

    if (body.dryRun) {
      return new Response(
        JSON.stringify({
          success: true,
          recipients: recipientPreviews.length,
          pushEligibleRecipients: recipientUserIds.filter((recipientUserId) => pushSubscribedUserIds.has(recipientUserId)).length,
          recipientPreviews: recipientPreviews.slice(0, 30),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (recipientUserIds.length === 0) {
      return new Response(
        JSON.stringify({ error: "No leaders matched those filters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const filters = {
      campusId,
      ministryKeys: body.ministryKeys || [],
      genders: body.genders || [],
      grades: gradeFilters,
      userIds: explicitUserIds,
      resourceAppKey,
      campInstanceId,
    };

    const { data: ping, error: pingError } = await supabase
      .from("admin_pings")
      .insert({
        resource_app_key: resourceAppKey,
        camp_instance_id: campInstanceId,
        campus_id: campusId,
        sent_by_user_id: user.id,
        title,
        message,
        filters,
        recipient_count: recipientUserIds.length,
      })
      .select("id")
      .single();

    if (pingError || !ping) {
      console.error("Failed to save admin ping:", pingError);
      return new Response(
        JSON.stringify({ error: "Failed to save ping" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { error: recipientsError } = await supabase
      .from("admin_ping_recipients")
      .insert(recipientUserIds.map((recipientUserId) => ({
        ping_id: ping.id,
        user_id: recipientUserId,
      })));

    if (recipientsError) {
      console.error("Failed to save admin ping recipients:", recipientsError);
      return new Response(
        JSON.stringify({ error: "Ping saved, but recipients could not be recorded" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let pushSent = 0;
    let pushFailed = 0;
    const senderName = senderProfileResult.data?.full_name?.trim() || "A leader";
    const pingPath = campInstanceId ? "/camp" : "/";

    // Send one push per target app so each app's subscribers open the
    // notification inside their own PWA scope (e.g. /hs or /ms) instead of the
    // default worship app at the root path. send-push-notification filters
    // subscriptions by metadata.resourceAppKey, so a user only receives the push
    // for apps they actually have a subscription in.
    for (const targetAppKey of targetResourceAppKeys) {
      try {
        const pushResponse = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            title,
            message: `${senderName}: ${message}`,
            url: buildAppUrl(targetAppKey, pingPath),
            tag: `admin-ping-${ping.id}-${targetAppKey}`,
            userIds: recipientUserIds,
            contextType: "admin-ping",
            contextId: ping.id,
            createdBy: user.id,
            metadata: { resourceAppKey: targetAppKey, campInstanceId, filters },
          }),
        });
        const pushResult = await pushResponse.json();
        pushSent += pushResult.sent || 0;
        pushFailed += pushResult.failed || 0;
      } catch (error) {
        console.error(`Failed to send admin ping push for ${targetAppKey}:`, error);
      }
    }

    await supabase
      .from("admin_pings")
      .update({
        push_sent_count: pushSent,
        push_failed_count: pushFailed,
      })
      .eq("id", ping.id);

    return new Response(
      JSON.stringify({
        success: true,
        pingId: ping.id,
        recipients: recipientUserIds.length,
        pushSent,
        pushFailed,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error in send-admin-ping:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
