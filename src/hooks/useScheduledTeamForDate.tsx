import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentResourceAppKey } from "@/lib/resourceApp";
import { filterValidSupportTeamScheduleEntries } from "@/lib/teamScheduleSupport";
import { filterScheduleEntriesToDateRotation } from "@/lib/rotationPeriods";
import {
  pickVisibleCampusScheduleEntry,
  scheduleDatesForPublishedTeam,
  scheduleMinistryMatches,
} from "@/lib/campusCalendarRoster";
import { useCampusCalendarRosterGate } from "@/hooks/useCampusCalendarRoster";

interface ScheduledTeamScheduleRow {
  id: string;
  schedule_date: string;
  team_id: string;
  campus_id: string | null;
  ministry_type?: string | null;
  rotation_period?: string | null;
  created_at?: string | null;
  worship_teams?: {
    id?: string;
    name?: string | null;
    color?: string | null;
    icon?: string | null;
  } | null;
}

interface ScheduledTeam {
  id: string;
  teamId: string;
  teamName: string;
  teamColor: string;
  teamIcon: string;
  scheduleDate: string;
  campusId: string | null;
}

export function resolveScheduledTeamEntry(
  entries: ScheduledTeamScheduleRow[],
  campusId?: string | null,
  ministryType?: string | null,
): ScheduledTeamScheduleRow | null {
  if (entries.length === 0) return null;

  const sortedEntries = [...entries].sort((a, b) => {
    const aCampusPriority = a.campus_id === campusId ? 2 : a.campus_id === null ? 1 : 0;
    const bCampusPriority = b.campus_id === campusId ? 2 : b.campus_id === null ? 1 : 0;

    if (aCampusPriority !== bCampusPriority) {
      return bCampusPriority - aCampusPriority;
    }

    const aCreatedAt = new Date(a.created_at || 0).getTime();
    const bCreatedAt = new Date(b.created_at || 0).getTime();
    return bCreatedAt - aCreatedAt;
  });

  if (!ministryType) {
    return sortedEntries[0] ?? null;
  }

  const matchingEntry = sortedEntries.find((entry) =>
    scheduleMinistryMatches(entry.ministry_type, ministryType),
  );

  return matchingEntry ?? sortedEntries[0] ?? null;
}

export function useScheduledTeamForDate(
  date: Date | null,
  campusId?: string | null,
  ministryType?: string | null,
) {
  const resourceAppKey = getCurrentResourceAppKey();
  const rosterGateQuery = useCampusCalendarRosterGate(campusId);
  const dateStr = date
    ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
    : null;
  const gateReady = !campusId || rosterGateQuery.isFetched;

  const scheduleQuery = useQuery({
    queryKey: ["scheduled-team-for-date", dateStr, campusId, ministryType, resourceAppKey, rosterGateQuery.dataUpdatedAt, "v3"],
    enabled: !!dateStr && gateReady,
    queryFn: async (): Promise<ScheduledTeam | null> => {
      if (!dateStr) return null;

      let query = supabase
        .from("team_schedule")
        .select(`
          id,
          schedule_date,
          team_id,
          campus_id,
          ministry_type,
          rotation_period,
          created_at,
          worship_teams(id, name, color, icon)
        `)
        .eq("resource_app_key", resourceAppKey)
        .in("schedule_date", scheduleDatesForPublishedTeam(dateStr));

      if (campusId === null) {
        // Network-wide ministries (Student Camp) prefer campus_id IS NULL rows, but older
        // Team Builder schedules may still be campus-scoped. Fetch both and let
        // resolveScheduledTeamEntry prefer the shared (null) row.
      } else if (campusId) {
        // Get campus-specific entry first, fall back to shared (null) entry
        query = query.or(`campus_id.eq.${campusId},campus_id.is.null`);
      }

      const { data, error } = await query;

      if (error) throw error;
      let scheduleRows = (data || []) as ScheduledTeamScheduleRow[];
      if (campusId) {
        const { data: periods, error: periodError } = await supabase
          .from("rotation_periods")
          .select("id, name, year, trimester, is_active, start_date, end_date")
          .eq("campus_id", campusId);
        if (periodError) throw periodError;
        scheduleRows = filterScheduleEntriesToDateRotation(scheduleRows, periods || []);
      }
      const filteredEntries = filterValidSupportTeamScheduleEntries(scheduleRows);
      const entry = pickVisibleCampusScheduleEntry(filteredEntries, {
        campusId,
        ministryType,
        preferredDate: dateStr,
        gate: campusId ? rosterGateQuery.data : null,
      });
      if (!entry || !entry.worship_teams) return null;

      const team = entry.worship_teams as { id: string; name: string; color: string; icon: string };

      return {
        id: entry.id,
        teamId: team.id,
        teamName: team.name,
        teamColor: team.color,
        teamIcon: team.icon,
        scheduleDate: entry.schedule_date,
        campusId: entry.campus_id,
      };
    },
  });

  const waitingForRoster = !!dateStr && !!campusId && !rosterGateQuery.isFetched;
  return {
    ...scheduleQuery,
    isLoading: waitingForRoster || scheduleQuery.isLoading,
    isPending: waitingForRoster || scheduleQuery.isPending,
    isFetching: waitingForRoster || scheduleQuery.isFetching,
  };
}
