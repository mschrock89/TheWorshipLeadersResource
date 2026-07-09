import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useToast } from "./use-toast";
import { getGlobalPriorUseCountsByDate } from "./useSongs";
import { isMissingYoutubeUrlColumnError } from "@/lib/youtube";
import { formatDateForDB, getWeekendPairDate, isWeekend } from "@/lib/utils";
import { normalizeWeekendWorshipMinistryType, isSessionSetMinistryType, normalizeSessionSetMinistryType } from "@/lib/constants";
import { getCurrentResourceAppKey } from "@/lib/resourceApp";
import { filterByResourceAppMinistry, filterStudentWednesdayFlows } from "@/lib/studentFlow";

export interface SetlistConfirmation {
  id: string;
  draft_set_id: string;
  user_id: string;
  confirmed_at: string;
  created_at: string;
}

export interface PublishedSetlist {
  id: string;
  campus_id: string | null;
  plan_date: string;
  ministry_type: string;
  custom_service_id: string | null;
  notes: string | null;
  published_at: string;
  campuses: { name: string } | null;
  songs: {
    id: string;
    song_id: string;
    sequence_order: number;
    song_key: string | null;
    vocalist: { id: string; full_name: string | null; avatar_url: string | null } | null;
    vocalists?: { id: string; full_name: string | null; avatar_url: string | null }[];
    song: { title: string; author: string | null } | null;
    isFirstUse?: boolean;
  }[];
  myConfirmation: SetlistConfirmation | null;
  /** True if the current user is on the team roster for this setlist's date/campus/ministry (can confirm). */
  amIOnRoster?: boolean;
}

type PublishedSetlistRow = Omit<PublishedSetlist, "songs" | "myConfirmation" | "amIOnRoster">;

interface DraftSetSongRow {
  id: string;
  draft_set_id: string;
  song_id: string;
  sequence_order: number;
  song_key: string | null;
  youtube_url?: string | null;
  vocalist_id: string | null;
  songs: { title: string; author: string | null } | null;
}

interface CustomServiceConfirmationAssignment {
  user_id: string | null;
  profiles?: { full_name: string | null } | { full_name: string | null }[] | null;
}

interface TeamMemberConfirmationRow {
  user_id: string | null;
  member_name: string | null;
  ministry_types?: string[] | null;
}

function getJoinedFullName(profile: unknown): string | null {
  const value = Array.isArray(profile) ? profile[0] : profile;
  if (!value || typeof value !== "object") return null;

  const fullName = (value as { full_name?: unknown }).full_name;
  return typeof fullName === "string" ? fullName : null;
}

const WEEKEND_MINISTRY_ALIASES = new Set(["weekend", "sunday_am", "weekend_team"]);
const WEEKEND_SUPPORTING_MINISTRIES = new Set(["production", "video"]);

// How far back "past" setlists load. The My Setlists UI pages one weekend at a
// time, so preloading unbounded history only slows the initial load down.
const PAST_SETLIST_WINDOW_DAYS = 90;

function getPastWindowFloorDate(): string {
  const floor = new Date();
  floor.setDate(floor.getDate() - PAST_SETLIST_WINDOW_DAYS);
  return formatDateForDB(floor);
}

// Module-level so a missing batched RPC (migration not applied yet) only costs
// one failed request per session before falling back to per-set checks.
let batchedRosterRpcMissing = false;

function getServiceDayForDate(dateStr: string): "saturday" | "sunday" | null {
  const dayOfWeek = new Date(`${dateStr}T00:00:00`).getDay();
  if (dayOfWeek === 6) return "saturday";
  if (dayOfWeek === 0) return "sunday";
  return null;
}

function assignmentMatchesServiceDay(
  assignment: { service_day?: string | null },
  dateStr: string,
): boolean {
  const rawServiceDay = assignment.service_day;
  if (!rawServiceDay) return true;

  const serviceDay = rawServiceDay.toLowerCase();
  if (serviceDay === "both" || serviceDay === "weekend") return true;

  const dateServiceDay = getServiceDayForDate(dateStr);
  if (!dateServiceDay) return true;

  return serviceDay === dateServiceDay;
}

function ministriesMatch(memberMinistry: string, setMinistry: string): boolean {
  if (!memberMinistry || !setMinistry) return false;
  const normalizedMemberMinistry =
    normalizeWeekendWorshipMinistryType(normalizeSessionSetMinistryType(memberMinistry)) ||
    normalizeSessionSetMinistryType(memberMinistry) ||
    memberMinistry;
  const normalizedSetMinistry =
    normalizeWeekendWorshipMinistryType(normalizeSessionSetMinistryType(setMinistry)) ||
    normalizeSessionSetMinistryType(setMinistry) ||
    setMinistry;

  if (normalizedMemberMinistry === normalizedSetMinistry) return true;
  if (
    WEEKEND_MINISTRY_ALIASES.has(memberMinistry) &&
    WEEKEND_MINISTRY_ALIASES.has(setMinistry)
  ) {
    return true;
  }
  return false;
}

function shouldExpandScheduleDateToWeekendPair(scheduleMinistryType: string | null): boolean {
  if (!scheduleMinistryType) return false;

  const normalizedScheduleMinistry =
    normalizeWeekendWorshipMinistryType(scheduleMinistryType) || scheduleMinistryType;

  return normalizedScheduleMinistry === "weekend" || WEEKEND_SUPPORTING_MINISTRIES.has(scheduleMinistryType);
}

function shouldIncludeScheduledDateForMember(
  memberMinistries: string[],
  scheduleMinistryType: string | null,
): boolean {
  // No explicit ministry restrictions on the member record means include by default.
  if (memberMinistries.length === 0) return true;
  if (!scheduleMinistryType) return true;

  // Standard direct/alias match.
  if (memberMinistries.some((memberMinistry) => ministriesMatch(memberMinistry, scheduleMinistryType))) {
    return true;
  }

  // Weekend services always involve Production + Video teams.
  // If a weekend schedule exists, include members tagged for production/video.
  if (WEEKEND_MINISTRY_ALIASES.has(scheduleMinistryType)) {
    return memberMinistries.some((memberMinistry) => WEEKEND_SUPPORTING_MINISTRIES.has(memberMinistry));
  }

  return false;
}

// Fetch published setlists for the current user's campuses
export function usePublishedSetlists(campusId?: string, ministryType?: string, includePast: boolean = false) {
  const { user } = useAuth();
  const resourceAppKey = getCurrentResourceAppKey();

  return useQuery({
    queryKey: ["published-setlists", user?.id, campusId, ministryType, includePast, resourceAppKey],
    queryFn: async (): Promise<PublishedSetlist[]> => {
      if (!user?.id) return [];

      // Check user's role to determine if they're a volunteer
      const { data: userRoles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      // Lower bound for every setlist/date fetch below: today for upcoming-only,
      // or the trailing PAST_SETLIST_WINDOW_DAYS window when past sets are included.
      const minPlanDate = includePast ? getPastWindowFloorDate() : formatDateForDB(new Date());

      const roles = (userRoles || []).map(r => r.role);
      const leadershipRoles = [
        "admin", "campus_admin", "campus_worship_pastor", "network_student_pastor", "student_pastor", "student_worship_pastor", "childrens_pastor",
        "network_worship_pastor", "network_worship_leader", "leader",
        "video_director", "production_manager", "campus_pastor"
      ];
      const hasLeadershipRole = roles.some(r => leadershipRoles.includes(r));
      const isFullAdmin = roles.some((role) => ["admin", "campus_admin"].includes(role));
      const canViewAllSetlists = roles.some((role) =>
        [
          "admin",
          "campus_admin",
          "campus_worship_pastor",
          "network_student_pastor",
          "student_pastor",
          "student_worship_pastor",
          "childrens_pastor",
          "network_worship_pastor",
          "network_worship_leader",
          "campus_pastor",
        ].includes(role),
      );
      const isVolunteerOnly = (roles.includes("volunteer") || roles.includes("member")) && !hasLeadershipRole;

      // Get user's campuses
      const { data: userCampuses } = await supabase
        .from("user_campuses")
        .select("campus_id")
        .eq("user_id", user.id);

      const userCampusIds = campusId 
        ? [campusId] 
        : (userCampuses || []).map(uc => uc.campus_id);

      // Also get dates where the user has swapped IN
      // User swaps in on original_date when they're the accepted_by
      const { data: swapsAsAcceptor } = await supabase
        .from("swap_requests")
        .select("original_date")
        .eq("accepted_by_id", user.id)
        .eq("resource_app_key", resourceAppKey)
        .eq("status", "accepted");

      // User swaps in on swap_date when they're the requester
      const { data: swapsAsRequester } = await supabase
        .from("swap_requests")
        .select("swap_date")
        .eq("requester_id", user.id)
        .eq("resource_app_key", resourceAppKey)
        .eq("status", "accepted")
        .not("swap_date", "is", null);

      const rawSwapDates = [
        ...(swapsAsAcceptor || []).map(s => s.original_date),
        ...(swapsAsRequester || []).map(s => s.swap_date),
      ].filter(Boolean) as string[];
      const swapDatesSet = new Set<string>(rawSwapDates);
      for (const date of rawSwapDates) {
        if (!isWeekend(date)) continue;
        const pair = getWeekendPairDate(date);
        if (pair) swapDatesSet.add(pair);
      }
      const swapDates = Array.from(swapDatesSet);

      // Dates where user is assigned to a custom service.
      const { data: customAssignments } = await supabase
        .from("custom_service_assignments")
        .select("assignment_date, custom_service_id")
        .eq("user_id", user.id);

      const customAssignmentDates = new Set<string>();
      const customAssignmentServiceIdsByDate = new Map<string, Set<string>>();
      for (const row of customAssignments || []) {
        if (!row.assignment_date) continue;
        if (row.assignment_date < minPlanDate) continue;
        customAssignmentDates.add(row.assignment_date);
        if (row.custom_service_id) {
          if (!customAssignmentServiceIdsByDate.has(row.assignment_date)) {
            customAssignmentServiceIdsByDate.set(row.assignment_date, new Set<string>());
          }
          customAssignmentServiceIdsByDate.get(row.assignment_date)!.add(row.custom_service_id);
        }
      }

      // Dates where the user was manually assigned for a specific service date.
      // These override rows are used by Team Builder for one-off/split-role assignments
      // and may point to a campus that is not on the user's profile.
      const dateOverrideQuery = supabase
        .from("team_member_date_overrides")
        .select("schedule_date")
        .eq("user_id", user.id)
        .gte("schedule_date", minPlanDate);

      const { data: dateOverrideAssignments } = await dateOverrideQuery;
      const dateOverrideDatesSet = new Set<string>();
      for (const row of dateOverrideAssignments || []) {
        if (!row.schedule_date) continue;
        dateOverrideDatesSet.add(row.schedule_date);

        if (isWeekend(row.schedule_date)) {
          const pairDate = getWeekendPairDate(row.schedule_date);
          if (pairDate) dateOverrideDatesSet.add(pairDate);
        }
      }
      const dateOverrideDates = Array.from(dateOverrideDatesSet);

      // Fetch published setlists for user's campuses, plus Network Wide setlists
      // (campus_id IS NULL, e.g. Student Camp) which are shared across every campus.
      let setlistsFromCampuses: PublishedSetlistRow[] = [];
      {
        const campusFilters = [
          "campus_id.is.null",
          ...(userCampusIds.length > 0 ? [`campus_id.in.(${userCampusIds.join(",")})`] : []),
        ];
        let query = supabase
          .from("draft_sets")
          .select(`
            id,
            campus_id,
            plan_date,
            ministry_type,
            custom_service_id,
            notes,
            published_at,
            campuses(name)
          `)
          .eq("status", "published")
          .not("published_at", "is", null)
          .or(campusFilters.join(","))
          .order("plan_date", { ascending: includePast ? false : true });
        
        query = query.gte("plan_date", minPlanDate);

        if (ministryType) {
          query = query.eq("ministry_type", ministryType);
        }

        if (isVolunteerOnly) {
          query = query.neq("ministry_type", "audition");
        }

        const { data } = await query;
        setlistsFromCampuses = (data || []) as PublishedSetlistRow[];
      }

      // Fetch setlists for swap dates (even if outside user's campuses)
      let setlistsFromSwaps: PublishedSetlistRow[] = [];
      if (swapDates.length > 0) {
        let query = supabase
          .from("draft_sets")
          .select(`
            id,
            campus_id,
            plan_date,
            ministry_type,
            custom_service_id,
            notes,
            published_at,
            campuses(name)
          `)
          .eq("status", "published")
          .not("published_at", "is", null)
          .in("plan_date", swapDates);
        
        query = query.gte("plan_date", minPlanDate);

        if (ministryType) {
          query = query.eq("ministry_type", ministryType);
        }

        if (isVolunteerOnly) {
          query = query.neq("ministry_type", "audition");
        }

        const { data } = await query;
        setlistsFromSwaps = (data || []) as PublishedSetlistRow[];
      }

      // Fetch setlists for custom-service assignments even if they fall outside the
      // currently selected home campus. We will roster-filter these later.
      let setlistsFromCustomAssignments: PublishedSetlistRow[] = [];
      const customAssignmentDateList = Array.from(customAssignmentDates);
      if (customAssignmentDateList.length > 0) {
        let query = supabase
          .from("draft_sets")
          .select(`
            id,
            campus_id,
            plan_date,
            ministry_type,
            custom_service_id,
            notes,
            published_at,
            campuses(name)
          `)
          .eq("status", "published")
          .not("published_at", "is", null)
          .in("plan_date", customAssignmentDateList);

        query = query.gte("plan_date", minPlanDate);

        if (ministryType) {
          query = query.eq("ministry_type", ministryType);
        }

        if (isVolunteerOnly) {
          query = query.neq("ministry_type", "audition");
        }

        const { data } = await query;
        setlistsFromCustomAssignments = (data || []) as PublishedSetlistRow[];
      }

      // Fetch setlists for date-override assignments even when the assigned service
      // belongs to a campus that is not on the user's profile.
      let setlistsFromDateOverrides: PublishedSetlistRow[] = [];
      if (dateOverrideDates.length > 0) {
        let query = supabase
          .from("draft_sets")
          .select(`
            id,
            campus_id,
            plan_date,
            ministry_type,
            custom_service_id,
            notes,
            published_at,
            campuses(name)
          `)
          .eq("status", "published")
          .not("published_at", "is", null)
          .in("plan_date", dateOverrideDates);

        query = query.gte("plan_date", minPlanDate);

        if (ministryType) {
          query = query.eq("ministry_type", ministryType);
        }

        if (isVolunteerOnly) {
          query = query.neq("ministry_type", "audition");
        }

        const { data } = await query;
        setlistsFromDateOverrides = (data || []) as PublishedSetlistRow[];
      }

      // Merge and deduplicate
      const seenIds = new Set<string>();
      let setlists = [
        ...setlistsFromCampuses,
        ...setlistsFromSwaps,
        ...setlistsFromCustomAssignments,
        ...setlistsFromDateOverrides,
      ]
        .filter(s => {
          if (seenIds.has(s.id)) return false;
          seenIds.add(s.id);
          return true;
        })
        .sort((a, b) => a.plan_date.localeCompare(b.plan_date));

      setlists = filterStudentWednesdayFlows(setlists, resourceAppKey);
      // In the HS/MS student apps, only surface setlists for that app's worship
      // ministries (e.g. HS shows "encounter", MS shows "eon"/"eon_weekend").
      setlists = filterByResourceAppMinistry(setlists, resourceAppKey);

      // Guard against invalid single-day service dates for a campus.
      // Weekend setlists are stored on a shared weekend anchor date, so a Sunday-only
      // campus can still have a valid "weekend" setlist saved on Saturday.
      if (setlists.length > 0) {
        const campusIds = [...new Set(setlists.map((s) => s.campus_id).filter(Boolean))];
        if (campusIds.length > 0) {
          const { data: campusConfigs } = await supabase
            .from("campuses")
            .select("id, has_saturday_service, has_sunday_service")
            .in("id", campusIds);

          const campusMap = new Map(
            (campusConfigs || []).map((c) => [c.id, c])
          );

          setlists = setlists.filter((s) => {
            const config = campusMap.get(s.campus_id);
            if (!config) return true;
            if (WEEKEND_MINISTRY_ALIASES.has(s.ministry_type)) {
              return config.has_saturday_service || config.has_sunday_service;
            }
            const day = new Date(`${s.plan_date}T00:00:00`).getDay(); // 0 Sun, 6 Sat
            if (day === 6 && !config.has_saturday_service) return false;
            if (day === 0 && !config.has_sunday_service) return false;
            return true;
          });
        }
      }

      // Do not pre-filter volunteer setlists by locally reconstructed scheduled
      // dates. Split roles, date overrides, and accepted swaps can legitimately
      // place a user on a roster even when team_members + team_schedule alone do
      // not capture that assignment. The roster RPC below is the source of truth.

      if (isVolunteerOnly) {
        setlists = setlists.filter((s) => s.ministry_type !== "audition");
      }

      if (setlists.length === 0) return [];

      // Backfill legacy published rows missing custom_service_id by inferring from
      // a unique active custom service on the same date/campus/ministry.
      const unresolved = setlists.filter((s) => !s.custom_service_id);
      const ambiguousCustomServiceKeys = new Set<string>();
      const customServiceContextKeys = new Set<string>();
      if (unresolved.length > 0) {
        const dates = [...new Set(unresolved.map((s) => s.plan_date))];
        const campusIds = [...new Set(unresolved.map((s) => s.campus_id))];
        const ministryTypes = [...new Set(unresolved.map((s) => s.ministry_type))];
        const concreteCampusIds = campusIds.filter(Boolean) as string[];
        const includeNetworkWide = campusIds.some((campusId) => campusId == null);

        let customServicesQuery = supabase
          .from("custom_services")
          .select("id, service_date, campus_id, ministry_type, is_active")
          .eq("is_active", true)
          .in("service_date", dates)
          .in("ministry_type", ministryTypes);

        if (includeNetworkWide && concreteCampusIds.length > 0) {
          customServicesQuery = customServicesQuery.or(
            `campus_id.is.null,campus_id.in.(${concreteCampusIds.join(",")})`,
          );
        } else if (includeNetworkWide) {
          customServicesQuery = customServicesQuery.is("campus_id", null);
        } else if (concreteCampusIds.length > 0) {
          customServicesQuery = customServicesQuery.in("campus_id", concreteCampusIds);
        }

        const { data: customServices } = await customServicesQuery;

        const customByKey = new Map<string, string[]>();
        for (const service of customServices || []) {
          const key = `${service.service_date}|${service.campus_id}|${service.ministry_type}`;
          const existing = customByKey.get(key) || [];
          existing.push(service.id);
          customByKey.set(key, existing);
        }

        for (const [key, serviceIds] of customByKey.entries()) {
          if (serviceIds.length > 0) {
            customServiceContextKeys.add(key);
          }
          if (serviceIds.length > 1) {
            ambiguousCustomServiceKeys.add(key);
          }
        }

        setlists = setlists.map((setlist) => {
          if (setlist.custom_service_id) return setlist;
          const key = `${setlist.plan_date}|${setlist.campus_id}|${setlist.ministry_type}`;
          const matches = customByKey.get(key) || [];
          if (matches.length === 1) {
            return { ...setlist, custom_service_id: matches[0] };
          }
          if (matches.length > 1 && isVolunteerOnly) {
            const assignedOnDate = customAssignmentServiceIdsByDate.get(setlist.plan_date);
            if (assignedOnDate) {
              const assignedMatches = matches.filter((id) => assignedOnDate.has(id));
              if (assignedMatches.length === 1) {
                return { ...setlist, custom_service_id: assignedMatches[0] };
              }
            }
          }
          return setlist;
        });

        // For volunteers, do not show ambiguous custom-service rows when we cannot
        // safely resolve which custom service the set belongs to.
        if (isVolunteerOnly) {
          setlists = setlists.filter((setlist) => {
            if (setlist.custom_service_id) return true;
            const key = `${setlist.plan_date}|${setlist.campus_id}|${setlist.ministry_type}`;
            return !ambiguousCustomServiceKeys.has(key);
          });
        }
      }

      // Resolve confirm-button eligibility from a single DB source of truth
      // so only rostered users (including accepted swaps) can confirm.
      const rosterEligibilityBySetId = new Map<string, boolean>();
      // Kids Camp sets may carry a custom_service_id for service-flow/date scoping, but their
      // roster (and therefore confirm eligibility) comes from the Team Builder schedule via
      // is_user_on_setlist_roster, not custom_service_assignments. Exclude them here so they
      // fall through to the RPC below.
      const customServiceSetlists = setlists.filter(
        (s) => !!s.custom_service_id && !isSessionSetMinistryType(s.ministry_type),
      );
      const customServiceAssignmentKeys = new Set<string>();

      if (customServiceSetlists.length > 0) {
        const customServiceIds = [
          ...new Set(customServiceSetlists.map((s) => s.custom_service_id!).filter(Boolean)),
        ];
        const customServiceDates = [...new Set(customServiceSetlists.map((s) => s.plan_date))];
        const { data: myCustomAssignments } = await supabase
          .from("custom_service_assignments")
          .select("custom_service_id, assignment_date")
          .eq("user_id", user.id)
          .in("custom_service_id", customServiceIds)
          .in("assignment_date", customServiceDates);

        for (const assignment of myCustomAssignments || []) {
          customServiceAssignmentKeys.add(`${assignment.custom_service_id}|${assignment.assignment_date}`);
        }
      }

      const rpcSetlists: typeof setlists = [];
      for (const setlist of setlists) {
        if (setlist.custom_service_id && !isSessionSetMinistryType(setlist.ministry_type)) {
          const isAssigned = customServiceAssignmentKeys.has(
            `${setlist.custom_service_id}|${setlist.plan_date}`
          );
          rosterEligibilityBySetId.set(setlist.id, isAssigned);
        } else {
          rpcSetlists.push(setlist);
        }
      }

      // Resolve roster eligibility for all remaining sets in ONE round trip via the
      // batched RPC; fall back to one RPC per set if the migration isn't applied yet.
      if (rpcSetlists.length > 0) {
        let batchResolved = false;
        if (!batchedRosterRpcMissing) {
          const { data: batchedRoster, error: batchedError } = await supabase.rpc(
            "is_user_on_setlist_rosters",
            {
              p_draft_set_ids: rpcSetlists.map((s) => s.id),
              p_user_id: user.id,
            },
          );

          if (batchedError) {
            batchedRosterRpcMissing = true;
          } else {
            for (const row of batchedRoster || []) {
              rosterEligibilityBySetId.set(row.draft_set_id, Boolean(row.on_roster));
            }
            batchResolved = true;
          }
        }

        if (!batchResolved) {
          await Promise.all(
            rpcSetlists.map(async (setlist) => {
              const { data, error } = await supabase.rpc("is_user_on_setlist_roster", {
                p_draft_set_id: setlist.id,
                p_user_id: user.id,
              });

              if (error) {
                console.error("Error checking roster eligibility:", error);
                rosterEligibilityBySetId.set(setlist.id, false);
                return;
              }

              rosterEligibilityBySetId.set(setlist.id, Boolean(data));
            }),
          );
        }
      }

      // Non-leadership users should only see setlists where they are actually on the roster.
      // This prevents cross-visibility when multiple custom services share a date/campus/ministry.
      if (!canViewAllSetlists) {
        setlists = setlists.filter((setlist) => rosterEligibilityBySetId.get(setlist.id) === true);
      }

      // Preserve the selected campus filter, but do not hide setlists the current
      // user is explicitly rostered for via swaps or custom-service assignments.
      if (campusId) {
        setlists = setlists.filter((setlist) => {
          // Network Wide sets (campus_id IS NULL, e.g. Student Camp) are shared
          // across every campus, so never hide them behind a campus filter.
          if (!setlist.campus_id) return true;
          if (setlist.campus_id === campusId) return true;
          if (canViewAllSetlists) return false;

          const isUserSpecificOutOfCampusSet =
            (swapDatesSet.has(setlist.plan_date) ||
              customAssignmentDates.has(setlist.plan_date) ||
              dateOverrideDatesSet.has(setlist.plan_date)) &&
            rosterEligibilityBySetId.get(setlist.id) === true;

          return isUserSpecificOutOfCampusSet;
        });
      }

      // Even for non-admin leaders, custom-service contexts must stay roster-scoped.
      // This avoids showing the wrong service when multiple services share the same date/campus/ministry.
      if (!isFullAdmin) {
        setlists = setlists.filter((setlist) => {
          // Camp session sets (Kids Camp / Student Camp morning/afternoon/evening) carry a
          // custom_service_id for service-flow scoping, but they are not a true
          // custom-service context: their roster comes from the Team Builder schedule and
          // the sessions are distinguished by ministry_type. Leaders with view-all access
          // should see them like any normal ministry set rather than being roster-gated out
          // of the camp they're planning.
          if (isSessionSetMinistryType(setlist.ministry_type)) return true;
          const key = `${setlist.plan_date}|${setlist.campus_id}|${setlist.ministry_type}`;
          const isCustomContext = Boolean(setlist.custom_service_id) || customServiceContextKeys.has(key);
          if (!isCustomContext) return true;
          return rosterEligibilityBySetId.get(setlist.id) === true;
        });
      }

      // Fetch songs for each setlist
      const setlistIds = (setlists || []).map(s => s.id);
      
      let allSongs: DraftSetSongRow[] | null = null;
      const baseSongIds = setlistIds.length > 0 ? setlistIds : ["00000000-0000-0000-0000-000000000000"];
      const primarySongsQuery = await supabase
        .from("draft_set_songs")
        .select(`
          id,
          draft_set_id,
          song_id,
          sequence_order,
          song_key,
          youtube_url,
          vocalist_id,
          songs(title, author)
        `)
        .in("draft_set_id", baseSongIds)
        .order("sequence_order");

      if (primarySongsQuery.error && isMissingYoutubeUrlColumnError(primarySongsQuery.error)) {
        const legacySongsQuery = await supabase
          .from("draft_set_songs")
          .select(`
            id,
            draft_set_id,
            song_id,
            sequence_order,
            song_key,
            vocalist_id,
            songs(title, author)
          `)
          .in("draft_set_id", baseSongIds)
          .order("sequence_order");
        if (legacySongsQuery.error) throw legacySongsQuery.error;
        allSongs = (legacySongsQuery.data || []) as DraftSetSongRow[];
      } else {
        if (primarySongsQuery.error) throw primarySongsQuery.error;
        allSongs = (primarySongsQuery.data || []) as DraftSetSongRow[];
      }

      // Fetch multi-vocalist assignments from junction table
      const draftSetSongIds = (allSongs || []).map(s => s.id);
      const { data: vocalistAssignments } = await supabase
        .from("draft_set_song_vocalists")
        .select("draft_set_song_id, vocalist_id")
        .in("draft_set_song_id", draftSetSongIds.length > 0 ? draftSetSongIds : ["00000000-0000-0000-0000-000000000000"]);

      // Build vocalist map per draft_set_song
      const songVocalistMap = new Map<string, string[]>();
      for (const v of vocalistAssignments || []) {
        const existing = songVocalistMap.get(v.draft_set_song_id) || [];
        existing.push(v.vocalist_id);
        songVocalistMap.set(v.draft_set_song_id, existing);
      }

      // Get all unique vocalist IDs (from junction table, falling back to legacy field)
      const allVocalistIds = new Set<string>();
      for (const song of allSongs || []) {
        const junctionVocalists = songVocalistMap.get(song.id) || [];
        if (junctionVocalists.length > 0) {
          junctionVocalists.forEach(id => allVocalistIds.add(id));
        } else if (song.vocalist_id) {
          allVocalistIds.add(song.vocalist_id);
        }
      }
      
      // Fetch vocalist profiles using the get_basic_profiles function (SECURITY DEFINER)
      // This bypasses complex RLS rules and allows volunteers to see assigned vocalist info
      const { data: allBasicProfiles } = await supabase.rpc("get_basic_profiles");
      
      // Filter to only the vocalists we need
      const vocalistProfiles = (allBasicProfiles || []).filter(p => allVocalistIds.has(p.id));
      
      const vocalistMap = new Map((vocalistProfiles || []).map(p => [p.id, p]));

      // Fetch user's confirmations
      const { data: confirmations } = await supabase
        .from("setlist_confirmations")
        .select("*")
        .eq("user_id", user.id)
        .in("draft_set_id", setlistIds.length > 0 ? setlistIds : ["00000000-0000-0000-0000-000000000000"]);

      // Prior use counts for the NEW badge — batched: one songs-table fetch plus one
      // lookup per DISTINCT plan date, instead of three requests per setlist.
      const uniqueSongsById = new Map<string, { id: string; title: string }>();
      for (const song of allSongs || []) {
        if (!uniqueSongsById.has(song.song_id)) {
          uniqueSongsById.set(song.song_id, {
            id: song.song_id,
            title: (song.songs as { title?: string } | null)?.title ?? "",
          });
        }
      }
      const priorCountsByDate = await getGlobalPriorUseCountsByDate(
        [...uniqueSongsById.values()],
        setlists.map((s) => s.plan_date),
      );

      // Map songs and confirmations to setlists
      return (setlists || []).map(setlist => {
        const setlistSongItems = (allSongs || []).filter(s => s.draft_set_id === setlist.id);
        const priorCounts = priorCountsByDate.get(setlist.plan_date) ?? new Map<string, number>();
        const amIOnRoster = rosterEligibilityBySetId.get(setlist.id) ?? false;
        return {
          ...setlist,
          songs: setlistSongItems.map(s => {
            const junctionVocalistIds = songVocalistMap.get(s.id) || [];
            const vocalistIds = junctionVocalistIds.length > 0
              ? junctionVocalistIds
              : (s.vocalist_id ? [s.vocalist_id] : []);
            const resolvedVocalists = vocalistIds
              .map((id) => vocalistMap.get(id))
              .filter(Boolean) as { id: string; full_name: string | null; avatar_url: string | null }[];
            return {
              id: s.id,
              song_id: s.song_id,
              sequence_order: s.sequence_order,
              song_key: s.song_key || null,
              youtube_url: s.youtube_url || null,
              vocalist: resolvedVocalists[0] || null,
              vocalists: resolvedVocalists,
              song: s.songs as { title: string; author: string | null } | null,
              isFirstUse: (priorCounts.get(s.song_id) ?? 0) === 0,
            };
          }),
          myConfirmation: (confirmations || []).find(c => c.draft_set_id === setlist.id) || null,
          amIOnRoster,
        };
      });
    },
    enabled: !!user?.id,
  });
}

// Confirm a setlist
export function useConfirmSetlist() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (draftSetId: string) => {
      if (!user?.id) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("setlist_confirmations")
        .insert({
          draft_set_id: draftSetId,
          user_id: user.id,
        });

      if (error) throw error;

      // Notify the worship leader that someone confirmed
      try {
        await supabase.functions.invoke("notify-setlist-confirmed", {
          body: { draftSetId, confirmerId: user.id },
        });
      } catch (notifyError) {
        console.error("Failed to send confirmation notification:", notifyError);
        // Don't throw - confirmation was successful even if notification fails
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["published-setlists"] });
      queryClient.invalidateQueries({ queryKey: ["setlist-confirmation-status"] });
      toast({
        title: "Setlist confirmed",
        description: "You've confirmed that you've reviewed this setlist.",
      });
    },
    onError: (error: Error) => {
      const message =
        /policy|row-level security|violates/.test(error.message)
          ? "You can only confirm setlists you're scheduled for."
          : error.message;
      toast({
        title: "Error confirming setlist",
        description: message,
        variant: "destructive",
      });
    },
  });
}

// Confirm multiple setlists at once (used for combined multi-session services like
// Kids Camp / Student Camp Morning/Afternoon/Evening, so a volunteer confirms the
// whole day in one action).
export function useConfirmSetlists() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (draftSetIds: string[]) => {
      if (!user?.id) throw new Error("Not authenticated");

      const ids = [...new Set(draftSetIds)].filter(Boolean);
      if (ids.length === 0) return;

      const { error } = await supabase
        .from("setlist_confirmations")
        .insert(ids.map((draft_set_id) => ({ draft_set_id, user_id: user.id })));

      if (error) throw error;

      // Notify the worship leader for each confirmed session
      for (const draftSetId of ids) {
        try {
          await supabase.functions.invoke("notify-setlist-confirmed", {
            body: { draftSetId, confirmerId: user.id },
          });
        } catch (notifyError) {
          console.error("Failed to send confirmation notification:", notifyError);
          // Don't throw - confirmation was successful even if notification fails
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["published-setlists"] });
      queryClient.invalidateQueries({ queryKey: ["setlist-confirmation-status"] });
      toast({
        title: "Setlist confirmed",
        description: "You've confirmed that you've reviewed this setlist.",
      });
    },
    onError: (error: Error) => {
      const message =
        /policy|row-level security|violates/.test(error.message)
          ? "You can only confirm setlists you're scheduled for."
          : error.message;
      toast({
        title: "Error confirming setlist",
        description: message,
        variant: "destructive",
      });
    },
  });
}
