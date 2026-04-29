import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserCampuses } from "@/hooks/useCampuses";
import { getWeekendKey, isWeekend, getWeekendPairDate, sortPositionsByPriority } from "@/lib/utils";
import { getRelatedWeekendServiceDates } from "@/lib/weekendServiceOverrides";
import {
  applyEffectiveActiveRotationPeriods,
  buildFirstScheduledDateByRotationName,
} from "@/lib/rotationPeriods";

const WEEKEND_TEACHING_MINISTRY_ALIASES = ["weekend", "weekend_team", "sunday_am"];
const WEEKEND_ROSTER_MINISTRY_ALIASES = ["weekend", "weekend_team", "sunday_am", "speaker"];

const getServiceDayForDate = (dateStr: string): "saturday" | "sunday" | null => {
  const dayOfWeek = new Date(`${dateStr}T00:00:00`).getDay();
  if (dayOfWeek === 6) return "saturday";
  if (dayOfWeek === 0) return "sunday";
  return null;
};

const assignmentMatchesServiceDay = (
  assignment: { service_day?: string | null } | { serviceDay?: string | null },
  dateStr: string,
) => {
  const rawServiceDay = "service_day" in assignment ? assignment.service_day : assignment.serviceDay;
  if (!rawServiceDay) return true;

  const serviceDay = rawServiceDay.toLowerCase();
  if (serviceDay === "both" || serviceDay === "weekend") return true;

  const dateServiceDay = getServiceDayForDate(dateStr);
  if (!dateServiceDay) return true;

  return serviceDay === dateServiceDay;
};

const ministryMatchesRosterFilter = (memberMinistries: string[] | null | undefined, ministryType?: string) => {
  if (!ministryType) return true;
  if (!memberMinistries || memberMinistries.length === 0) return true;

  if (ministryType === "weekend_team") {
    const weekendTeamMinistries = ["weekend", "production", "video", "sunday_am"];
    return memberMinistries.some((mt) => weekendTeamMinistries.includes(mt));
  }

  if (WEEKEND_ROSTER_MINISTRY_ALIASES.includes(ministryType)) {
    return memberMinistries.some((mt) => WEEKEND_ROSTER_MINISTRY_ALIASES.includes(mt));
  }

  return memberMinistries.includes(ministryType);
};

const normalizeRosterGroupingMinistry = (ministryType: string | null | undefined) => {
  if (!ministryType) return "unknown";
  if (WEEKEND_ROSTER_MINISTRY_ALIASES.includes(ministryType)) {
    return "weekend_team";
  }
  return ministryType;
};

const normalizeRosterName = (name?: string | null) =>
  (name || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/,/g, " ")
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const levenshteinDistance = (a: string, b: string) => {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= b.length; j += 1) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[a.length][b.length];
};

export interface RosterMember {
  id: string;
  memberName: string;
  positions: string[];
  positionSlots: string[]; // eg_1, eg_2, ag_1, etc. for proper display labels
  userId: string | null;
  avatarUrl: string | null;
  phone: string | null;
  isSwapped: boolean;
  hasPendingSwap: boolean;
  originalMemberName?: string;
  ministryTypes: string[];
  serviceDay: string | null;
}

interface MatchedProfile {
  id: string;
  full_name: string | null;
  phone: string | null;
}

interface IntermediateRosterEntry {
  id: string;
  memberName: string;
  position: string;
  positionSlot: string | null;
  userId: string | null;
  avatarUrl: string | null;
  phone: string | null;
  isSwapped: boolean;
  hasPendingSwap: boolean;
  originalMemberName?: string;
  ministryTypes: string[];
  serviceDay: string | null;
}

interface TeamMemberRow {
  id: string;
  member_name: string;
  position: string;
  position_slot: string | null;
  user_id: string | null;
  rotation_period_id: string | null;
  ministry_types: string[] | null;
  service_day: string | null;
}

interface TeamMemberWithPeriodRow extends TeamMemberRow {
  rotation_periods?: {
    campus_id?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    is_active?: boolean | null;
  } | null;
}

interface TeamMemberDateOverrideRow {
  id: string;
  member_name: string;
  position: string;
  position_slot: string;
  user_id: string | null;
  rotation_period_id: string;
  ministry_types: string[] | null;
  schedule_date: string;
}

export function useTeamRosterForDate(
  date: Date | null,
  teamId?: string,
  ministryType?: string,
  campusId?: string,
  rotationPeriodName?: string | null,
) {
  const { user } = useAuth();
  const { data: userCampuses = [] } = useUserCampuses(user?.id);
  
  // If campusId is provided, we use it for filtering rotation periods
  // However, if we have a specific teamId, we should be more permissive and use all user campuses
  // to ensure we can see the full roster even if campus filter is set differently
  const userCampusIds = userCampuses.map(uc => uc.campus_id);
  
  const dateStr = date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}` : null;

  return useQuery({
    queryKey: ["team-roster-for-date", dateStr, teamId, campusId || userCampusIds, ministryType, "v11"],
    queryFn: async () => {
      if (!dateStr || !teamId) return [];

      const campusIdsToFilter = campusId ? [campusId] : userCampusIds;
      if (campusIdsToFilter.length === 0) return [];
      
      let activePeriodIds: string[] = [];
      if (campusId && rotationPeriodName) {
        const { data: namedPeriods, error: namedPeriodError } = await supabase
          .from("rotation_periods")
          .select("id")
          .eq("campus_id", campusId)
          .eq("name", rotationPeriodName);

        if (namedPeriodError) throw namedPeriodError;
        activePeriodIds = (namedPeriods || []).map((period) => period.id);
      }

      if (activePeriodIds.length === 0) {
        const { data: datedPeriods, error: datedPeriodError } = await supabase
          .from("rotation_periods")
          .select("id")
          .in("campus_id", campusIdsToFilter)
          .lte("start_date", dateStr)
          .gte("end_date", dateStr);

        if (datedPeriodError) throw datedPeriodError;
        activePeriodIds = (datedPeriods || []).map((period) => period.id);
      }

      if (campusId && activePeriodIds.length === 0) {
        const [{ data: campusPeriods, error: campusPeriodsError }, { data: scheduleRows, error: scheduleError }] =
          await Promise.all([
            supabase
              .from("rotation_periods")
              .select("id, name, year, trimester, is_active")
              .eq("campus_id", campusId),
            supabase
              .from("team_schedule")
              .select("rotation_period, schedule_date, campus_id")
              .or(`campus_id.eq.${campusId},campus_id.is.null`),
          ]);

        if (campusPeriodsError) throw campusPeriodsError;
        if (scheduleError) throw scheduleError;

        const effectivePeriods = applyEffectiveActiveRotationPeriods(
          campusPeriods || [],
          buildFirstScheduledDateByRotationName(scheduleRows || []),
        );

        const effectiveActivePeriods = effectivePeriods.filter((period) => period.is_active);
        if (effectiveActivePeriods.length > 0) {
          activePeriodIds = effectiveActivePeriods.map((period) => period.id);
        }
      }

      if (campusId && activePeriodIds.length === 0) {
        const { data: activePeriods, error: activePeriodError } = await supabase
          .from("rotation_periods")
          .select("id")
          .eq("campus_id", campusId)
          .eq("is_active", true);

        if (activePeriodError) throw activePeriodError;
        activePeriodIds = (activePeriods || []).map((period) => period.id);
      }

      const rotationPeriodIds = activePeriodIds;
      
      // Create a set of valid rotation period IDs for quick lookup
      const validRotationPeriodIdSet = new Set(rotationPeriodIds);

      // Fetch team members for this team
      let membersQuery = supabase
        .from("team_members")
        .select("id, member_name, position, position_slot, user_id, rotation_period_id, ministry_types, service_day")
        .eq("team_id", teamId)
        .order("display_order");

      if (rotationPeriodIds.length > 0) {
        membersQuery = membersQuery.in("rotation_period_id", rotationPeriodIds);
      }

      const { data: members, error: membersError } = await membersQuery;

      if (membersError) throw membersError;

      // Filter members by rotation period (must be in the campus-filtered rotation periods)
      // and optionally by ministry type
      let filteredMembers = ((members || []) as TeamMemberRow[]).filter(m => {
        if (validRotationPeriodIdSet.size > 0) {
          if (!m.rotation_period_id) return false;
          if (!validRotationPeriodIdSet.has(m.rotation_period_id)) return false;
        }

        if (!assignmentMatchesServiceDay(m, dateStr)) return false;

        // If ministryType is specified, filter by ministry_types array
        return ministryMatchesRosterFilter(m.ministry_types, ministryType);
      });

      // Some campuses can have a scheduled team row without a rotation period that
      // exactly covers the selected date yet. Fall back to the best campus-matching
      // team membership instead of showing an empty roster.
      if (filteredMembers.length === 0) {
        const { data: fallbackMembers, error: fallbackMembersError } = await supabase
          .from("team_members")
          .select(`
            id,
            member_name,
            position,
            position_slot,
            user_id,
            rotation_period_id,
            ministry_types,
            service_day,
            rotation_periods (
              campus_id,
              start_date,
              end_date,
              is_active
            )
          `)
          .eq("team_id", teamId)
          .order("display_order");

        if (fallbackMembersError) throw fallbackMembersError;

        const fallbackCandidates = ((fallbackMembers || []) as TeamMemberWithPeriodRow[])
          .filter((member) => {
            if (!ministryMatchesRosterFilter(member.ministry_types, ministryType)) {
              return false;
            }

            if (!assignmentMatchesServiceDay(member, dateStr)) {
              return false;
            }

            if (!campusId) return true;
            const periodCampusId = member.rotation_periods?.campus_id ?? null;
            return !periodCampusId || periodCampusId === campusId;
          });

        const datedFallbackCandidates = fallbackCandidates.filter(
          (member) => member.rotation_period_id && member.rotation_periods?.start_date
        );

        if (datedFallbackCandidates.length > 0) {
          const targetDate = new Date(`${dateStr}T00:00:00`);
          const byPeriod = new Map<string, TeamMemberWithPeriodRow[]>();

          for (const member of datedFallbackCandidates) {
            const periodId = member.rotation_period_id;
            if (!periodId) continue;
            if (!byPeriod.has(periodId)) {
              byPeriod.set(periodId, []);
            }
            byPeriod.get(periodId)!.push(member);
          }

          const rankedPeriods = Array.from(byPeriod.entries())
            .map(([periodId, rows]) => {
              const period = rows[0]?.rotation_periods;
              const start = period?.start_date ? new Date(`${period.start_date}T00:00:00`) : null;
              const end = period?.end_date ? new Date(`${period.end_date}T23:59:59`) : null;
              const containsDate = !!start && !!end && targetDate >= start && targetDate <= end;
              const distance = start ? Math.abs(targetDate.getTime() - start.getTime()) : Number.MAX_SAFE_INTEGER;

              return {
                periodId,
                rows,
                isActive: Boolean(period?.is_active),
                containsDate,
                distance,
                startTime: start?.getTime() ?? 0,
              };
            })
            .sort((a, b) => {
              if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
              if (a.containsDate !== b.containsDate) return a.containsDate ? -1 : 1;
              if (a.distance !== b.distance) return a.distance - b.distance;
              return b.startTime - a.startTime;
            });

          filteredMembers = (rankedPeriods[0]?.rows || []) as TeamMemberRow[];
        } else {
          filteredMembers = fallbackCandidates as TeamMemberRow[];
        }
      }

      let overrideQuery = supabase
        .from("team_member_date_overrides")
        .select("id, member_name, position, position_slot, user_id, rotation_period_id, ministry_types, schedule_date")
        .eq("team_id", teamId)
        .eq("schedule_date", dateStr);

      if (rotationPeriodIds.length > 0) {
        overrideQuery = overrideQuery.in("rotation_period_id", rotationPeriodIds);
      }

      const { data: dateOverrides, error: dateOverridesError } = await overrideQuery;
      if (dateOverridesError) throw dateOverridesError;

      const overrideBySlot = new Map(
        ((dateOverrides || []) as TeamMemberDateOverrideRow[]).map((override) => [override.position_slot, override]),
      );

      const effectiveMembers = filteredMembers
        .filter((member) => !member.position_slot || !overrideBySlot.has(member.position_slot))
        .concat(
          ((dateOverrides || []) as TeamMemberDateOverrideRow[]).map((override) => ({
            id: override.id,
            member_name: override.member_name,
            position: override.position,
            position_slot: override.position_slot,
            user_id: override.user_id,
            rotation_period_id: override.rotation_period_id,
            ministry_types: override.ministry_types,
            service_day: null,
          })),
        );

      // Get user IDs to fetch their profiles
      const userIds = effectiveMembers.filter(m => m.user_id).map(m => m.user_id!);
      
      // Fetch safe campus profiles for name/phone matching
      const safeProfilesPromise = supabase.rpc("get_profiles_for_campus");

      const [{ data: safeProfiles, error: safeProfilesError }] = await Promise.all([safeProfilesPromise]);

      if (safeProfilesError) throw safeProfilesError;

      const allSafeProfiles = (safeProfiles || []) as Array<{ id: string; full_name: string | null; phone: string | null }>;
      const safeProfileIds = allSafeProfiles.map((profile) => profile.id);

      const safeProfileMap = new Map(
        allSafeProfiles
          .filter(profile => userIds.includes(profile.id))
          .map(profile => [profile.id, profile.phone])
      );
      const safePhoneByNameMap = new Map<string, string>();
      const safePhoneEntries: Array<{ normalized: string; tokens: string[]; phone: string }> = [];

      for (const profile of allSafeProfiles) {
        if (!profile.phone) continue;
        const normalized = normalizeRosterName(profile.full_name);
        if (!normalized) continue;
        if (!safePhoneByNameMap.has(normalized)) {
          safePhoneByNameMap.set(normalized, profile.phone);
        }
        safePhoneEntries.push({
          normalized,
          tokens: normalized.split(" ").filter(Boolean),
          phone: profile.phone,
        });
      }

      const findSafeProfileByName = (memberName?: string | null): MatchedProfile | null => {
        const normalizedName = normalizeRosterName(memberName);
        if (!normalizedName) return null;

        const exact = allSafeProfiles.find(
          (profile) => normalizeRosterName(profile.full_name) === normalizedName
        );
        if (exact) return exact;

        const memberTokens = normalizedName.split(" ").filter(Boolean);
        if (memberTokens.length < 2) return null;

        const first = memberTokens[0];
        const last = memberTokens[memberTokens.length - 1];
        const reversed = `${last} ${first}`;

        const reversedMatch = allSafeProfiles.find(
          (profile) => normalizeRosterName(profile.full_name) === reversed
        );
        if (reversedMatch) return reversedMatch;

        const tokenMatches = allSafeProfiles.filter((profile) => {
          const profileTokens = normalizeRosterName(profile.full_name).split(" ").filter(Boolean);
          if (profileTokens.length < 2) return false;
          const profileFirst = profileTokens[0];
          const profileLast = profileTokens[profileTokens.length - 1];
          return (
            (profileFirst === first && profileLast === last) ||
            (profileFirst === last && profileLast === first)
          );
        });
        if (tokenMatches.length === 1) {
          return tokenMatches[0];
        }

        const memberTokenSet = new Set(memberTokens);
        const overlapMatches = allSafeProfiles.filter((profile) => {
          const profileTokens = normalizeRosterName(profile.full_name).split(" ").filter(Boolean);
          const overlapCount = profileTokens.reduce(
            (count, token) => (memberTokenSet.has(token) ? count + 1 : count),
            0
          );
          return overlapCount >= 2;
        });
        if (overlapMatches.length === 1) {
          return overlapMatches[0];
        }

        const fuzzyLastNameMatches = allSafeProfiles.filter((profile) => {
          const profileTokens = normalizeRosterName(profile.full_name).split(" ").filter(Boolean);
          if (profileTokens.length < 2) return false;
          const profileFirst = profileTokens[0];
          const profileLast = profileTokens[profileTokens.length - 1];
          const firstMatches = profileFirst === first || profileLast === first;
          if (!firstMatches) return false;
          const compareLast = profileFirst === first ? profileLast : profileFirst;
          return last.length >= 5 && compareLast.length >= 5 && levenshteinDistance(last, compareLast) <= 1;
        });
        if (fuzzyLastNameMatches.length === 1) {
          return fuzzyLastNameMatches[0];
        }

        return null;
      };

      const findPhoneByName = (memberName?: string | null) => {
        const normalizedName = normalizeRosterName(memberName);
        if (!normalizedName) return null;

        const exact = safePhoneByNameMap.get(normalizedName);
        if (exact) return exact;

        const memberTokens = normalizedName.split(" ").filter(Boolean);
        if (memberTokens.length < 2) return null;

        const first = memberTokens[0];
        const last = memberTokens[memberTokens.length - 1];
        const reversed = `${last} ${first}`;

        const reversedMatch = safePhoneByNameMap.get(reversed);
        if (reversedMatch) return reversedMatch;

        for (const entry of safePhoneEntries) {
          if (entry.tokens.length < 2) continue;
          const entryFirst = entry.tokens[0];
          const entryLast = entry.tokens[entry.tokens.length - 1];
          if (entryFirst === first && entryLast === last) return entry.phone;
          if (entryFirst === last && entryLast === first) return entry.phone;
        }

        // Fallback: match on at least two overlapping name tokens
        // (e.g., "William Travis Thompson" <-> "Travis Thompson")
        const memberTokenSet = new Set(memberTokens);
        const tokenOverlapMatches = safePhoneEntries.filter((entry) => {
          const overlapCount = entry.tokens.reduce(
            (count, token) => (memberTokenSet.has(token) ? count + 1 : count),
            0
          );
          return overlapCount >= 2;
        });
        if (tokenOverlapMatches.length === 1) {
          return tokenOverlapMatches[0].phone;
        }

        // Fallback: allow one-character typo in last name when first name matches.
        const fuzzyLastNameMatches = safePhoneEntries.filter((entry) => {
          if (entry.tokens.length < 2) return false;
          const entryFirst = entry.tokens[0];
          const entryLast = entry.tokens[entry.tokens.length - 1];
          const firstMatches = entryFirst === first || entryLast === first;
          if (!firstMatches) return false;
          const compareLast = entryFirst === first ? entryLast : entryFirst;
          return last.length >= 5 && compareLast.length >= 5 && levenshteinDistance(last, compareLast) <= 1;
        });
        if (fuzzyLastNameMatches.length === 1) {
          return fuzzyLastNameMatches[0].phone;
        }

        return null;
      };

      const resolveRosterPhone = (userId?: string | null, memberName?: string | null) => {
        if (userId) {
          const phone = safeProfileMap.get(userId);
          if (phone) return phone;
        }
        return findPhoneByName(memberName);
      };

      const { data: allAvatarProfiles, error: avatarProfilesError } = await supabase
        .from("profiles")
        .select("id, avatar_url")
        .in("id", safeProfileIds.length > 0 ? safeProfileIds : ['00000000-0000-0000-0000-000000000000']);

      if (avatarProfilesError) throw avatarProfilesError;

      const profileMap = new Map((allAvatarProfiles || []).map(p => [p.id, p.avatar_url]));

      // Build the list of dates to check for swaps. Friday override services should
      // behave as part of the same weekend cluster as Saturday/Sunday.
      const datesToCheck = await getRelatedWeekendServiceDates(dateStr, campusId);

      // Fetch accepted swaps where someone is covering FOR this date (original_date matches)
      const { data: swapsForDate, error: swapsForDateError } = await supabase
        .from("swap_requests")
        .select(`
          id,
          requester_id,
          accepted_by_id,
          position,
          swap_date,
          request_type,
          requester:profiles!swap_requests_requester_id_fkey(full_name, avatar_url),
          accepted_by:profiles!swap_requests_accepted_by_id_fkey(full_name, avatar_url)
        `)
        .in("original_date", datesToCheck)
        .eq("team_id", teamId)
        .eq("status", "accepted");

      if (swapsForDateError) throw swapsForDateError;

      // Fetch accepted swaps where someone is covering ON this date via swap_date (direct swaps)
      // This handles the case where requester covers accepter's slot on swap_date
      // Don't filter by team_id here - we need to find swaps where the accepter is a member of this team
      // We'll filter by accepter's user_id being in this team's roster
      const { data: swapsOnDate, error: swapsOnDateError } = await supabase
        .from("swap_requests")
        .select(`
          id,
          requester_id,
          accepted_by_id,
          position,
          original_date,
          requester:profiles!swap_requests_requester_id_fkey(full_name, avatar_url),
          accepted_by:profiles!swap_requests_accepted_by_id_fkey(full_name, avatar_url)
        `)
        .in("swap_date", datesToCheck)
        .eq("status", "accepted");

      if (swapsOnDateError) throw swapsOnDateError;

      // Filter swapsOnDate to only those where the accepter is on this team
      const teamMemberUserIds = new Set(effectiveMembers.map(m => m.user_id).filter(Boolean));
      const filteredSwapsOnDate = (swapsOnDate || []).filter(swap => 
        swap.accepted_by_id && teamMemberUserIds.has(swap.accepted_by_id)
      );

      const swaps = swapsForDate || [];
      const directSwapsOnThisDate = filteredSwapsOnDate;

      // Fetch pending swaps for this date (or weekend pair)
      const { data: pendingSwaps, error: pendingSwapsError } = await supabase
        .from("swap_requests")
        .select("requester_id")
        .in("original_date", datesToCheck)
        .eq("team_id", teamId)
        .eq("status", "pending");

      if (pendingSwapsError) throw pendingSwapsError;

      // Build set of users with pending swap requests
      const pendingSwapUsers = new Set<string>(
        (pendingSwaps || []).map(s => s.requester_id).filter(Boolean)
      );

      // Build swap map: "requester_id|position" -> accepted_by info (for original_date swaps)
      // This means: requester is OUT for this specific position, accepter is IN
      // Key by user_id + position to correctly handle multiple positions per user
      // For fill_in (cover) requests, we'll also track that the requester is OUT for ALL positions
      const swapMap = new Map<string, { acceptedById: string; acceptedByName: string; acceptedByAvatar: string | null; position: string; isCover: boolean }>();
      // Track which users have accepted swaps for which positions
      const acceptersPositionSet = new Set<string>(); // "userId|position"
      // Track users who are completely covered (fill_in requests cover ALL their positions)
      const coveredUserIds = new Set<string>();
      // Map covered user -> accepter info (for fill_in requests)
      const coverMap = new Map<string, { acceptedById: string; acceptedByName: string; acceptedByAvatar: string | null }>();
      
      for (const swap of swaps) {
        if (swap.requester_id && swap.accepted_by_id) {
          // Type assertion for request_type since it's included in the select
          const swapWithType = swap as typeof swap & { request_type?: string };
          // If swap_date exists, this is a direct swap even if legacy data marked request_type incorrectly.
          const isDirectSwap = Boolean(swap.swap_date) || swapWithType.request_type === "swap";
          const isCover = !isDirectSwap;

          if (isCover) {
            // Cover request: requester is OUT for ALL their positions, accepter takes over ALL
            coveredUserIds.add(swap.requester_id);
            coverMap.set(swap.requester_id, {
              acceptedById: swap.accepted_by_id,
              acceptedByName: swap.accepted_by?.full_name || "Unknown",
              acceptedByAvatar: swap.accepted_by?.avatar_url || null,
            });
          }
          
          // Still add to swapMap for position-specific tracking
          const key = `${swap.requester_id}|${swap.position}`;
          swapMap.set(key, {
            acceptedById: swap.accepted_by_id,
            acceptedByName: swap.accepted_by?.full_name || "Unknown",
            acceptedByAvatar: swap.accepted_by?.avatar_url || null,
            position: swap.position,
            isCover,
          });
          acceptersPositionSet.add(`${swap.accepted_by_id}|${swap.position}`);
        }
      }

      // Build reverse swap map for direct swaps where this date is the swap_date
      // Key by "accepter_id|position" - accepter is OUT on swap_date, requester covers their position
      const reverseSwapMap = new Map<string, { requesterId: string; requesterName: string; requesterAvatar: string | null; position: string }>();
      const requestersCoveringPositionSet = new Set<string>(); // "userId|position"
      
      for (const swap of directSwapsOnThisDate) {
        if (swap.requester_id && swap.accepted_by_id) {
          const key = `${swap.accepted_by_id}|${swap.position}`;
          reverseSwapMap.set(key, {
            requesterId: swap.requester_id,
            requesterName: swap.requester?.full_name || "Unknown",
            requesterAvatar: swap.requester?.avatar_url || null,
            position: swap.position,
          });
          requestersCoveringPositionSet.add(`${swap.requester_id}|${swap.position}`);
        }
      }

      // Build a map from member id to ministry types for lookup
      const memberMinistryMap = new Map<string, string[]>();
      for (const m of effectiveMembers) {
        memberMinistryMap.set(m.id, m.ministry_types || []);
      }

      // Build intermediate roster with swap replacements
      // Exclude the accepter's own slot since they're covering someone else's slot
      const intermediateRoster: IntermediateRosterEntry[] = [];

      // Track users+positions who have been added via swap replacement to avoid duplicates
      const addedViaSwap = new Set<string>(); // "userId|position|ministryType" - now includes ministry for proper grouping
      // Track requesters+positions who have been swapped out (they shouldn't appear in those slots)
      const swappedOutPositions = new Set<string>(swapMap.keys()); // "userId|position"
      // Track accepters+positions being covered on swap_date
      const coveredByRequesterPositions = new Set<string>(reverseSwapMap.keys()); // "userId|position"
      
      // For "All Ministries" mode, collect all ministry types for each covered user+position
      // This ensures the cover appears in all ministry groupings the original member had
      const coveredPositionMinistries = new Map<string, Set<string>>(); // "userId|position" -> Set of ministry types
      if (!ministryType) {
        for (const member of filteredMembers) {
          if (member.user_id && coveredUserIds.has(member.user_id)) {
            const posKey = `${member.user_id}|${member.position}`;
            if (!coveredPositionMinistries.has(posKey)) {
              coveredPositionMinistries.set(posKey, new Set());
            }
            for (const mt of (member.ministry_types || [])) {
              coveredPositionMinistries.get(posKey)!.add(mt);
            }
          }
        }
      }

      for (const member of effectiveMembers) {
        const memberPositionKey = member.user_id ? `${member.user_id}|${member.position}` : null;
        const swap = memberPositionKey ? swapMap.get(memberPositionKey) : null;
        const reverseSwap = memberPositionKey ? reverseSwapMap.get(memberPositionKey) : null;
        
        // Check if this member is completely covered (fill_in request covers ALL their positions)
        const isCoveredUser = member.user_id && coveredUserIds.has(member.user_id);
        const coverInfo = member.user_id ? coverMap.get(member.user_id) : null;
        
        if (isCoveredUser && coverInfo) {
          // This member is covered by a fill_in request - show the accepter for ALL their positions
          // IMPORTANT: Use the ORIGINAL member's ministry context so the replacement appears
          // in the same ministry filter (e.g., if filtering by "weekend", the cover shows there)
          const posKey = `${member.user_id}|${member.position}`;
          
          if (ministryType) {
            // Specific ministry filter - add one entry with that ministry type
            const swapKey = `${coverInfo.acceptedById}|${member.position}|${ministryType}`;
            if (!addedViaSwap.has(swapKey)) {
              intermediateRoster.push({
                id: member.id,
                memberName: coverInfo.acceptedByName,
                position: member.position,
                positionSlot: member.position_slot || null,
                userId: coverInfo.acceptedById,
                avatarUrl: coverInfo.acceptedByAvatar,
                phone: resolveRosterPhone(coverInfo.acceptedById, coverInfo.acceptedByName),
                isSwapped: true,
                hasPendingSwap: false,
                originalMemberName: member.member_name,
                ministryTypes: [ministryType],
                serviceDay: member.service_day || null,
              });
              addedViaSwap.add(swapKey);
            }
          } else {
            // "All Ministries" mode - add entries for ALL ministry types the original member had
            const allMinistries = coveredPositionMinistries.get(posKey) || new Set(member.ministry_types || []);
            for (const mt of allMinistries) {
              const swapKey = `${coverInfo.acceptedById}|${member.position}|${mt}`;
              if (!addedViaSwap.has(swapKey)) {
                intermediateRoster.push({
                  id: member.id,
                  memberName: coverInfo.acceptedByName,
                  position: member.position,
                  positionSlot: member.position_slot || null,
                  userId: coverInfo.acceptedById,
                  avatarUrl: coverInfo.acceptedByAvatar,
                  phone: resolveRosterPhone(coverInfo.acceptedById, coverInfo.acceptedByName),
                  isSwapped: true,
                  hasPendingSwap: false,
                  originalMemberName: member.member_name,
                  ministryTypes: [mt],
                  serviceDay: member.service_day || null,
                });
                addedViaSwap.add(swapKey);
              }
            }
          }
        } else if (swap && !swap.isCover) {
          // This member is swapped out via position-specific swap (not cover) - show the accepter instead
          const swapKey = `${swap.acceptedById}|${member.position}`;
          if (!addedViaSwap.has(swapKey)) {
            intermediateRoster.push({
              id: member.id,
              memberName: swap.acceptedByName,
              position: member.position,
              positionSlot: member.position_slot || null,
              userId: swap.acceptedById,
              avatarUrl: swap.acceptedByAvatar,
              phone: resolveRosterPhone(swap.acceptedById, swap.acceptedByName),
              isSwapped: true,
              hasPendingSwap: false,
              originalMemberName: member.member_name,
              ministryTypes: member.ministry_types || [],
              serviceDay: member.service_day || null,
            });
            addedViaSwap.add(swapKey);
          }
        } else if (reverseSwap) {
          // This member is being covered by requester on swap_date - show the requester instead
          const swapKey = `${reverseSwap.requesterId}|${member.position}`;
          if (!addedViaSwap.has(swapKey)) {
            intermediateRoster.push({
              id: member.id,
              memberName: reverseSwap.requesterName,
              position: member.position,
              positionSlot: member.position_slot || null,
              userId: reverseSwap.requesterId,
              avatarUrl: reverseSwap.requesterAvatar,
              phone: resolveRosterPhone(reverseSwap.requesterId, reverseSwap.requesterName),
              isSwapped: true,
              hasPendingSwap: false,
              originalMemberName: member.member_name,
              ministryTypes: member.ministry_types || [],
              serviceDay: member.service_day || null,
            });
            addedViaSwap.add(swapKey);
          }
        } else if (memberPositionKey && acceptersPositionSet.has(memberPositionKey)) {
          // This member accepted a swap for this position - skip their own slot (they're covering someone else)
          continue;
        } else if (memberPositionKey && requestersCoveringPositionSet.has(memberPositionKey)) {
          // This member is covering someone else on swap_date for this position - skip their slot
          continue;
        } else if (memberPositionKey && swappedOutPositions.has(memberPositionKey)) {
          // This member+position was swapped out - skip this slot
          continue;
        } else if (memberPositionKey && coveredByRequesterPositions.has(memberPositionKey)) {
          // This member+position is being covered by requester - already handled above
          continue;
        } else {
          intermediateRoster.push({
            id: member.id,
            memberName: member.member_name,
            position: member.position,
            positionSlot: member.position_slot || null,
            userId: member.user_id,
            avatarUrl: member.user_id ? profileMap.get(member.user_id) || null : null,
            phone: resolveRosterPhone(member.user_id, member.member_name),
            isSwapped: false,
            hasPendingSwap: member.user_id ? pendingSwapUsers.has(member.user_id) : false,
            originalMemberName: undefined,
            ministryTypes: member.ministry_types || [],
            serviceDay: member.service_day || null,
          });
        }
      }

      if (campusId) {
        const announcementLookupDate = isWeekend(dateStr) ? getWeekendKey(dateStr) : dateStr;
        let announcementQuery = supabase
          .from("teaching_week_announcements" as never)
          .select("id, ministry_type, announcer_name")
          .eq("campus_id", campusId)
          .eq("weekend_date", announcementLookupDate)
          .not("announcer_name", "is", null);

        if (ministryType) {
          const announcementMinistryAliases =
            WEEKEND_TEACHING_MINISTRY_ALIASES.includes(ministryType)
              ? WEEKEND_TEACHING_MINISTRY_ALIASES
              : [ministryType];
          announcementQuery = announcementQuery.in("ministry_type", announcementMinistryAliases);
        }

        const { data: announcementRows, error: announcementsError } = await announcementQuery;
        if (announcementsError) throw announcementsError;

        const existingAnnouncementAssignments = new Set(
          intermediateRoster
            .filter((entry) => {
              const normalizedPosition = entry.position.toLowerCase();
              const normalizedSlot = entry.positionSlot?.toLowerCase() || "";
              return normalizedPosition === "announcement" || normalizedSlot === "announcement";
            })
            .flatMap((entry) => {
              const keys: string[] = [];
              if (entry.userId) {
                keys.push(`user:${entry.userId}`);
              }
              const normalizedName = normalizeRosterName(entry.memberName);
              if (normalizedName) {
                keys.push(`name:${normalizedName}`);
              }
              return keys;
            }),
        );

        for (const announcement of announcementRows || []) {
          const announcerName = announcement.announcer_name?.trim();
          if (!announcerName) continue;

          const matchedProfile = findSafeProfileByName(announcerName);
          const normalizedAnnouncerName = normalizeRosterName(announcerName);
          const duplicateAnnouncementKey = matchedProfile?.id
            ? `user:${matchedProfile.id}`
            : normalizedAnnouncerName
            ? `name:${normalizedAnnouncerName}`
            : null;

          if (duplicateAnnouncementKey && existingAnnouncementAssignments.has(duplicateAnnouncementKey)) {
            continue;
          }

          intermediateRoster.push({
            id: announcement.id,
            memberName: matchedProfile?.full_name || announcerName,
            position: "announcement",
            positionSlot: "announcement",
            userId: matchedProfile?.id || null,
            avatarUrl: matchedProfile?.id ? profileMap.get(matchedProfile.id) || null : null,
            phone: matchedProfile?.phone || resolveRosterPhone(null, announcerName),
            isSwapped: false,
            hasPendingSwap: false,
            ministryTypes: [announcement.ministry_type],
            serviceDay: null,
          });

          if (duplicateAnnouncementKey) {
            existingAnnouncementAssignments.add(duplicateAnnouncementKey);
          }
        }
      }

      // Group by member identity plus normalized ministry family so legacy speaker/weekend
      // aliases collapse into a single roster entry.
      const memberMap = new Map<string, RosterMember>();
      
      for (const entry of intermediateRoster) {
        const primaryMinistry = normalizeRosterGroupingMinistry(entry.ministryTypes[0]);
        const baseKey = entry.userId || entry.memberName;
        const key = `${baseKey}__${primaryMinistry}`;
        
        const existing = memberMap.get(key);
        
        if (existing) {
          // Add position if not already included (case-insensitive check)
          // Only merge positions from the same ministry context
          const posLower = entry.position.toLowerCase();
          if (!existing.positions.some(p => p.toLowerCase() === posLower)) {
            existing.positions.push(entry.position);
          }
          // Add position slot if available and not already included
          if (entry.positionSlot && !existing.positionSlots.includes(entry.positionSlot)) {
            existing.positionSlots.push(entry.positionSlot);
          }
          // If any entry is swapped, mark as swapped
          if (entry.isSwapped) {
            existing.isSwapped = true;
            existing.originalMemberName = entry.originalMemberName;
          }
          // If any entry has pending swap, mark it
          if (entry.hasPendingSwap) {
            existing.hasPendingSwap = true;
          }
          // Backfill identity/contact fields from later rows when first row was incomplete.
          existing.userId = existing.userId || entry.userId;
          existing.avatarUrl = existing.avatarUrl || entry.avatarUrl;
          existing.phone = existing.phone || entry.phone;
        } else {
          memberMap.set(key, {
            id: entry.id,
            memberName: entry.memberName,
            positions: [entry.position],
            positionSlots: entry.positionSlot ? [entry.positionSlot] : [],
            userId: entry.userId,
            avatarUrl: entry.avatarUrl,
            phone: entry.phone,
            isSwapped: entry.isSwapped,
            hasPendingSwap: entry.hasPendingSwap,
            originalMemberName: entry.originalMemberName,
            ministryTypes: [...entry.ministryTypes],
            serviceDay: entry.serviceDay,
          });
        }
      }

      // Sort positions by priority (vocalist first) for each member
      const result = Array.from(memberMap.values()).map(member => ({
        ...member,
        positions: sortPositionsByPriority(member.positions),
      }));

      return result;
    },
    enabled: !!dateStr && !!teamId && (!!campusId || userCampusIds.length > 0),
  });
}
