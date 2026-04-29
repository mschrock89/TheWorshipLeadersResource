import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { parseLocalDate } from "@/lib/utils";
import { getRelatedWeekendServiceDates } from "@/lib/weekendServiceOverrides";
import { normalizeWeekendWorshipMinistryType } from "@/lib/constants";

export interface MyTeamAssignment {
  teamId: string;
  teamName: string;
  teamColor: string;
  teamIcon: string;
  position: string;
  serviceDay: string | null;
  displayOrder: number;
  assignmentStartDate?: string | null;
  assignmentEndDate?: string | null;
}

export interface MyScheduledDate {
  /** Raw YYYY-MM-DD string from the database (authoritative) */
  scheduleDate: string;
  /** Local Date derived from scheduleDate (convenience) */
  date: Date;
  teamId: string;
  teamName: string;
  teamColor: string;
  position: string;
  campusId: string | null;
  campusName: string | null;
  ministryTypes: string[];
  rotationPeriodId: string | null;
  ministryType: string;
  /** Whether this date came from an accepted swap (user accepted someone else's date) */
  isSwappedIn?: boolean;
}

interface MyTeamDateOverride {
  scheduleDate: string;
  teamId: string;
  teamName: string;
  teamColor: string;
  teamIcon: string;
  position: string;
  campusId: string | null;
  campusName: string | null;
  rotationPeriodId: string | null;
  ministryTypes: string[];
}

const WEEKEND_SUPPORTING_MINISTRIES = new Set(["production", "video"]);

function assignmentMatchesMinistryTypes(
  memberMinistryTypes: string[],
  scheduleMinistryType: string,
): boolean {
  if (memberMinistryTypes.length === 0 || !scheduleMinistryType) {
    return true;
  }

  const normalizedScheduleMinistry =
    normalizeWeekendWorshipMinistryType(scheduleMinistryType) || scheduleMinistryType;

  if (
    memberMinistryTypes.some((memberMinistry) => {
      const normalizedMemberMinistry =
        normalizeWeekendWorshipMinistryType(memberMinistry) || memberMinistry;
      return normalizedMemberMinistry === normalizedScheduleMinistry;
    })
  ) {
    return true;
  }

  if (normalizedScheduleMinistry === "weekend") {
    return memberMinistryTypes.some((memberMinistry) =>
      WEEKEND_SUPPORTING_MINISTRIES.has(memberMinistry),
    );
  }

  return false;
}


export function useMyTeamAssignments() {
  const { user } = useAuth();
  const today = new Date().toISOString().split("T")[0];

  // Fetch user's campuses as fallback for assignments without rotation periods
  const { data: userCampuses = [] } = useQuery({
    queryKey: ["user-campuses-fallback", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("user_campuses")
        .select("campus_id, campuses(id, name)")
        .eq("user_id", user.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  const { data: assignments = [], isLoading: assignmentsLoading } = useQuery({
    queryKey: ["my-team-assignments", user?.id, userCampuses],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from("team_members")
        .select(`
          id,
          position,
          service_day,
          display_order,
          team_id,
          rotation_period_id,
          ministry_types,
          worship_teams!inner (
            id,
            name,
            color,
            icon
          ),
          rotation_periods (
            campus_id,
            start_date,
            end_date,
            campuses (
              name
            )
          )
        `)
        .eq("user_id", user.id);

      if (error) throw error;

      // Use first user campus as fallback when assignment has no rotation period
      const fallbackCampus = userCampuses[0];
      const fallbackCampusId = (fallbackCampus as any)?.campuses?.id || null;
      const fallbackCampusName = (fallbackCampus as any)?.campuses?.name || null;

      return (data || []).map((member: any) => ({
        teamId: member.worship_teams.id,
        teamName: member.worship_teams.name,
        teamColor: member.worship_teams.color,
        teamIcon: member.worship_teams.icon,
        position: member.position,
        serviceDay: member.service_day || null,
        displayOrder: member.display_order,
        campusId: member.rotation_periods?.campus_id || fallbackCampusId,
        campusName: member.rotation_periods?.campuses?.name || fallbackCampusName,
        rotationPeriodId: member.rotation_period_id,
        ministryTypes: member.ministry_types || [],
        assignmentStartDate: member.rotation_periods?.start_date || null,
        assignmentEndDate: member.rotation_periods?.end_date || null,
      })) as (MyTeamAssignment & { campusId: string | null; campusName: string | null; rotationPeriodId: string | null; ministryTypes: string[] })[];
    },
    enabled: !!user?.id,
  });

  // Fetch accepted swaps where user gave away their date or accepted someone else's date
  const { data: acceptedSwaps = [] } = useQuery({
    queryKey: ["my-accepted-swaps", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      // Get swaps where user is requester (gave away a date) or accepted_by (took a date)
      const { data, error } = await supabase
        .from("swap_requests")
        .select(`
          id,
          original_date,
          swap_date,
          requester_id,
          accepted_by_id,
          team_id,
          position,
          request_type,
          worship_teams (
            id,
            name,
            color
          )
        `)
        .eq("status", "accepted")
        .or(`requester_id.eq.${user.id},accepted_by_id.eq.${user.id}`)
        .gte("original_date", new Date().toISOString().split("T")[0]);

      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  const { data: dateOverrides = [], isLoading: overridesLoading } = useQuery({
    queryKey: ["my-team-date-overrides", user?.id, userCampuses],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from("team_member_date_overrides")
        .select(`
          id,
          schedule_date,
          position,
          team_id,
          rotation_period_id,
          ministry_types,
          worship_teams!inner (
            id,
            name,
            color,
            icon
          ),
          rotation_periods (
            campus_id,
            campuses (
              name
            )
          )
        `)
        .eq("user_id", user.id)
        .gte("schedule_date", today);

      if (error) throw error;

      const fallbackCampus = userCampuses[0];
      const fallbackCampusId = (fallbackCampus as any)?.campuses?.id || null;
      const fallbackCampusName = (fallbackCampus as any)?.campuses?.name || null;

      return (data || []).map((override: any) => ({
        scheduleDate: override.schedule_date,
        teamId: override.worship_teams.id,
        teamName: override.worship_teams.name,
        teamColor: override.worship_teams.color,
        teamIcon: override.worship_teams.icon,
        position: override.position,
        campusId: override.rotation_periods?.campus_id || fallbackCampusId,
        campusName: override.rotation_periods?.campuses?.name || fallbackCampusName,
        rotationPeriodId: override.rotation_period_id,
        ministryTypes: override.ministry_types || [],
      })) as MyTeamDateOverride[];
    },
    enabled: !!user?.id,
  });

  const { data: scheduledDates = [], isLoading: datesLoading } = useQuery({
    // cache-bust key to ensure date parsing updates reflect immediately
    queryKey: ["my-scheduled-dates", "local-date-v3", user?.id, assignments, dateOverrides, acceptedSwaps],
    queryFn: async () => {
      if (!user?.id || (assignments.length === 0 && dateOverrides.length === 0)) return [];

      const teamIds = [...new Set([...assignments.map((a) => a.teamId), ...dateOverrides.map((o) => o.teamId)])];

      const { data, error } = await supabase
        .from("team_schedule")
        .select(`
          schedule_date,
          team_id,
          campus_id,
          campuses (
            name
          ),
          ministry_type,
          worship_teams!inner (
            id,
            name,
            color
          )
        `)
        .in("team_id", teamIds)
        .gte("schedule_date", today);

      if (error) throw error;

      const getServiceDayForDate = (dateStr: string): "saturday" | "sunday" | null => {
        const dayOfWeek = parseLocalDate(dateStr).getDay();
        if (dayOfWeek === 6) return "saturday";
        if (dayOfWeek === 0) return "sunday";
        return null;
      };

      const assignmentMatchesServiceDay = (assignment: { serviceDay?: string | null }, dateStr: string) => {
        if (!assignment.serviceDay) return true;
        const serviceDay = assignment.serviceDay.toLowerCase();
        if (serviceDay === "both" || serviceDay === "weekend") return true;
        const dateServiceDay = getServiceDayForDate(dateStr);
        if (!dateServiceDay) return true;
        return serviceDay === dateServiceDay;
      };

      const assignmentMatchesRotationPeriod = (
        assignment: { assignmentStartDate?: string | null; assignmentEndDate?: string | null; rotationPeriodId?: string | null },
        dateStr: string,
      ) => {
        if (!assignment.rotationPeriodId) return true;
        if (assignment.assignmentStartDate && dateStr < assignment.assignmentStartDate) return false;
        if (assignment.assignmentEndDate && dateStr > assignment.assignmentEndDate) return false;
        return true;
      };

      const shouldExpandSwapToWeekendPair = (swap: (typeof acceptedSwaps)[number]) => {
        const matchingAssignment = assignments.find(
          (a) => a.teamId === swap.team_id && a.position === swap.position
        );
        if (!matchingAssignment) return true;
        const serviceDay = (matchingAssignment.serviceDay || "").toLowerCase();
        return serviceDay === "" || serviceDay === "both" || serviceDay === "weekend";
      };

      // Build sets for dates user has swapped out/in
      const swappedOutDates = new Set<string>(); // Dates user gave away
      const swappedInDates = new Map<string, typeof acceptedSwaps[0]>(); // Dates user accepted

      for (const swap of acceptedSwaps) {
        const isDirectSwap = Boolean(swap.swap_date) || swap.request_type === "swap";
        if (swap.requester_id === user.id) {
          // User gave away their original_date
          (await getRelatedWeekendServiceDates(swap.original_date)).forEach((relatedDate) => {
            swappedOutDates.add(relatedDate);
          });
          // For full-weekend assignments, also add the paired days.
          if (shouldExpandSwapToWeekendPair(swap)) {
            (await getRelatedWeekendServiceDates(swap.original_date)).forEach((relatedDate) => {
              swappedOutDates.add(relatedDate);
            });
          }
          
          // For a "swap" request_type, they also receive swap_date in return
          if (isDirectSwap && swap.swap_date) {
            (await getRelatedWeekendServiceDates(swap.swap_date)).forEach((relatedDate) => {
              swappedInDates.set(relatedDate, swap);
            });
            if (shouldExpandSwapToWeekendPair(swap)) {
              (await getRelatedWeekendServiceDates(swap.swap_date)).forEach((relatedDate) => {
                swappedInDates.set(relatedDate, swap);
              });
            }
          }
        } else if (swap.accepted_by_id === user.id) {
          // User accepted someone else's original_date
          (await getRelatedWeekendServiceDates(swap.original_date)).forEach((relatedDate) => {
            swappedInDates.set(relatedDate, swap);
          });
          if (shouldExpandSwapToWeekendPair(swap)) {
            (await getRelatedWeekendServiceDates(swap.original_date)).forEach((relatedDate) => {
              swappedInDates.set(relatedDate, swap);
            });
          }
          
          if (isDirectSwap && swap.swap_date) {
            // User gave away swap_date in return
            (await getRelatedWeekendServiceDates(swap.swap_date)).forEach((relatedDate) => {
              swappedOutDates.add(relatedDate);
            });
            if (shouldExpandSwapToWeekendPair(swap)) {
              (await getRelatedWeekendServiceDates(swap.swap_date)).forEach((relatedDate) => {
                swappedOutDates.add(relatedDate);
              });
            }
          }
        }
      }

      // For each scheduled date, create an entry for EACH unique team+campus assignment
      // This handles users assigned to the same team at multiple campuses
      // But deduplicates when user has multiple ministry types for the same team/campus
      const results: MyScheduledDate[] = [];
      const seen = new Set<string>();

      for (const override of dateOverrides) {
        if (swappedOutDates.has(override.scheduleDate)) continue;

        const matchingEntries = (data || []).filter((entry: any) => {
          if (entry.schedule_date !== override.scheduleDate) return false;
          if (entry.team_id !== override.teamId) return false;
          const scheduleMinistryType = entry.ministry_type || "weekend";
          return assignmentMatchesMinistryTypes(override.ministryTypes, scheduleMinistryType);
        });

        for (const entry of matchingEntries) {
          const scheduleCampusId = entry.campus_id || null;
          const campusId = scheduleCampusId || override.campusId;
          const dedupeKey = `${override.scheduleDate}-${override.teamId}-${campusId || "null"}`;

          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);

          results.push({
            scheduleDate: override.scheduleDate,
            date: parseLocalDate(override.scheduleDate),
            teamId: override.teamId,
            teamName: override.teamName,
            teamColor: override.teamColor,
            position: override.position,
            campusId,
            campusName: (entry as any)?.campuses?.name || override.campusName || null,
            ministryTypes: override.ministryTypes,
            rotationPeriodId: override.rotationPeriodId,
            ministryType: (entry as any).ministry_type || "weekend",
          });
        }
      }
      
      for (const entry of data || []) {
        const scheduleMinistryType = (entry as any).ministry_type || 'weekend';
        const scheduleCampusId = (entry as any).campus_id || null;
        const scheduleCampusName = (entry as any)?.campuses?.name || null;
        const hasCampusSpecificSibling = (data || []).some((other: any) =>
          other !== entry &&
          other.schedule_date === entry.schedule_date &&
          other.team_id === entry.team_id &&
          (other.ministry_type || "weekend") === scheduleMinistryType &&
          !!other.campus_id
        );
        
        // Skip dates user has swapped out
        if (swappedOutDates.has(entry.schedule_date)) continue;
        
        // Find ALL assignments for this team that match the schedule's ministry type
        const teamAssignments = assignments.filter((a) => {
          if (a.teamId !== entry.worship_teams.id) return false;
          if (!assignmentMatchesServiceDay(a, entry.schedule_date)) return false;
          if (!assignmentMatchesRotationPeriod(a, entry.schedule_date)) return false;

          const assignmentCampusId = (a as any)?.campusId || null;
          if (scheduleCampusId) {
            // Campus-specific schedules should only match assignments (or campus memberships)
            // for that same campus.
            if (assignmentCampusId && assignmentCampusId !== scheduleCampusId) return false;
            if (!assignmentCampusId) {
              const hasCampusMembership = userCampuses.some((uc: any) => uc.campus_id === scheduleCampusId);
              if (!hasCampusMembership) return false;
            }
          } else if (assignmentCampusId && hasCampusSpecificSibling) {
            // Some schedules include a generic network row plus campus-specific rows for the same
            // service. For personal calendar highlights, prefer the campus-specific row so a
            // volunteer's dates don't light up for another campus's weekend.
            return false;
          }
          
          // Get the user's ministry types for this assignment
          const userMinistryTypes = (a as any)?.ministryTypes || [];

          return assignmentMatchesMinistryTypes(userMinistryTypes, scheduleMinistryType);
        });
        
        // Skip this schedule entry if no matching assignments
        if (teamAssignments.length === 0) continue;
        
        // Group assignments by campusId to avoid duplicates
        const campusAssignmentMap = new Map<string | null, typeof teamAssignments[0]>();
        const ministryTypesByCampus = new Map<string | null, string[]>();
        
        for (const assignment of teamAssignments) {
          const assignmentCampusId = (assignment as any)?.campusId || null;
          const campusId = scheduleCampusId || assignmentCampusId;
          const campusKey = campusId || 'null';
          
          // Merge ministry types for same campus
          if (!ministryTypesByCampus.has(campusKey)) {
            ministryTypesByCampus.set(campusKey, []);
          }
          const existingTypes = ministryTypesByCampus.get(campusKey)!;
          const assignmentTypes = (assignment as any)?.ministryTypes || [];
          for (const t of assignmentTypes) {
            if (!existingTypes.includes(t)) {
              existingTypes.push(t);
            }
          }
          
          // Keep first assignment record for other fields
          if (!campusAssignmentMap.has(campusKey)) {
            campusAssignmentMap.set(campusKey, assignment);
          }
        }
        
        // Create one entry per unique schedule_date + team + campus
        for (const [campusKey, assignment] of campusAssignmentMap.entries()) {
          const assignmentCampusId = (assignment as any)?.campusId || null;
          const campusId = scheduleCampusId || assignmentCampusId;
          const dedupeKey = `${entry.schedule_date}-${entry.worship_teams.id}-${campusId || 'null'}`;
          
          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);
          
          results.push({
            scheduleDate: entry.schedule_date,
            date: parseLocalDate(entry.schedule_date),
            teamId: entry.worship_teams.id,
            teamName: entry.worship_teams.name,
            teamColor: entry.worship_teams.color,
            position: (assignment as any)?.position || "",
            campusId: campusId,
            campusName: scheduleCampusName || (assignment as any)?.campusName || null,
            ministryTypes: ministryTypesByCampus.get(campusKey) || [],
            rotationPeriodId: (assignment as any)?.rotationPeriodId || null,
            ministryType: scheduleMinistryType,
          });
        }
      }
      
      // Add dates user has swapped in (accepted from others)
      for (const [swapDate, swap] of swappedInDates.entries()) {
        // Skip if already in swapped out set (shouldn't happen but safety check)
        if (swappedOutDates.has(swapDate)) continue;
        
        const dedupeKey = `${swapDate}-${swap.worship_teams?.id}-swapped`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        
        // Get campus from user's primary campus
        const fallbackCampus = userCampuses[0];
        const campusId = (fallbackCampus as any)?.campuses?.id || null;
        const campusName = (fallbackCampus as any)?.campuses?.name || null;
        
        results.push({
          scheduleDate: swapDate,
          date: parseLocalDate(swapDate),
          teamId: swap.worship_teams?.id || swap.team_id,
          teamName: swap.worship_teams?.name || "Swapped Team",
          teamColor: swap.worship_teams?.color || "#888",
          position: swap.position,
          campusId,
          campusName,
          ministryTypes: [],
          rotationPeriodId: null,
          ministryType: "weekend", // Default, could be improved
          isSwappedIn: true,
        });
      }
      
      return results;
    },
    enabled: !!user?.id && (assignments.length > 0 || dateOverrides.length > 0),
  });

  // Get unique teams
  const uniqueTeams = assignments.reduce((acc, curr) => {
    if (!acc.find((t) => t.teamId === curr.teamId)) {
      acc.push(curr);
    }
    return acc;
  }, [] as MyTeamAssignment[]);

  return {
    assignments,
    uniqueTeams,
    scheduledDates,
    isLoading: assignmentsLoading || overridesLoading || datesLoading,
  };
}
