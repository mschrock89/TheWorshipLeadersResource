import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { parseLocalDate } from "@/lib/utils";

export interface MyTeamAssignment {
  teamId: string;
  teamName: string;
  teamColor: string;
  teamIcon: string;
  position: string;
  serviceDay: string | null;
  displayOrder: number;
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


export function useMyTeamAssignments() {
  const { user } = useAuth();

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

  const { data: scheduledDates = [], isLoading: datesLoading } = useQuery({
    // cache-bust key to ensure date parsing updates reflect immediately
    queryKey: ["my-scheduled-dates", "local-date-v1", user?.id, assignments, acceptedSwaps],
    queryFn: async () => {
      if (!user?.id || assignments.length === 0) return [];

      const teamIds = [...new Set(assignments.map((a) => a.teamId))];

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
        .gte("schedule_date", new Date().toISOString().split("T")[0]);

      if (error) throw error;

      // Helper to get the paired weekend day (Sat <-> Sun)
      const getWeekendPair = (dateStr: string): string | null => {
        const date = parseLocalDate(dateStr);
        const dayOfWeek = date.getDay();
        if (dayOfWeek === 6) {
          // Saturday -> get Sunday
          const sunday = new Date(date);
          sunday.setDate(sunday.getDate() + 1);
          return sunday.toISOString().split("T")[0];
        } else if (dayOfWeek === 0) {
          // Sunday -> get Saturday
          const saturday = new Date(date);
          saturday.setDate(saturday.getDate() - 1);
          return saturday.toISOString().split("T")[0];
        }
        return null; // Not a weekend day
      };

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
        if (swap.requester_id === user.id) {
          // User gave away their original_date
          swappedOutDates.add(swap.original_date);
          // For full-weekend assignments, also add the paired day.
          if (shouldExpandSwapToWeekendPair(swap)) {
            const originalPair = getWeekendPair(swap.original_date);
            if (originalPair) swappedOutDates.add(originalPair);
          }
          
          // For a "swap" request_type, they also receive swap_date in return
          if (swap.request_type === "swap" && swap.swap_date) {
            swappedInDates.set(swap.swap_date, swap);
            if (shouldExpandSwapToWeekendPair(swap)) {
              const swapPair = getWeekendPair(swap.swap_date);
              if (swapPair) swappedInDates.set(swapPair, swap);
            }
          }
        } else if (swap.accepted_by_id === user.id) {
          // User accepted someone else's original_date
          swappedInDates.set(swap.original_date, swap);
          if (shouldExpandSwapToWeekendPair(swap)) {
            const originalPair = getWeekendPair(swap.original_date);
            if (originalPair) swappedInDates.set(originalPair, swap);
          }
          
          if (swap.request_type === "swap" && swap.swap_date) {
            // User gave away swap_date in return
            swappedOutDates.add(swap.swap_date);
            if (shouldExpandSwapToWeekendPair(swap)) {
              const swapPair = getWeekendPair(swap.swap_date);
              if (swapPair) swappedOutDates.add(swapPair);
            }
          }
        }
      }

      // For each scheduled date, create an entry for EACH unique team+campus assignment
      // This handles users assigned to the same team at multiple campuses
      // But deduplicates when user has multiple ministry types for the same team/campus
      const results: MyScheduledDate[] = [];
      const seen = new Set<string>();
      
      for (const entry of data || []) {
        const scheduleMinistryType = (entry as any).ministry_type || 'weekend';
        const scheduleCampusId = (entry as any).campus_id || null;
        const scheduleCampusName = (entry as any)?.campuses?.name || null;
        
        // Skip dates user has swapped out
        if (swappedOutDates.has(entry.schedule_date)) continue;
        
        // Find ALL assignments for this team that match the schedule's ministry type
        const teamAssignments = assignments.filter((a) => {
          if (a.teamId !== entry.worship_teams.id) return false;
          if (!assignmentMatchesServiceDay(a, entry.schedule_date)) return false;

          const assignmentCampusId = (a as any)?.campusId || null;
          if (scheduleCampusId) {
            // Campus-specific schedules should only match assignments (or campus memberships)
            // for that same campus.
            if (assignmentCampusId && assignmentCampusId !== scheduleCampusId) return false;
            if (!assignmentCampusId) {
              const hasCampusMembership = userCampuses.some((uc: any) => uc.campus_id === scheduleCampusId);
              if (!hasCampusMembership) return false;
            }
          }
          
          // Get the user's ministry types for this assignment
          const userMinistryTypes = (a as any)?.ministryTypes || [];
          
          // If user has no ministry types set, show all dates for their team
          if (userMinistryTypes.length === 0) return true;
          
          // Otherwise, only include if the schedule's ministry type matches
          return userMinistryTypes.includes(scheduleMinistryType);
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
    enabled: !!user?.id && assignments.length > 0,
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
    isLoading: assignmentsLoading || datesLoading,
  };
}
