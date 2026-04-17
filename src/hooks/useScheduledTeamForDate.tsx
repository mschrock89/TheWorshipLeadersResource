import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface ScheduledTeamScheduleRow {
  id: string;
  schedule_date: string;
  team_id: string;
  campus_id: string | null;
  ministry_type?: string | null;
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

const WEEKEND_MINISTRY_ALIASES = new Set(["weekend", "weekend_team", "sunday_am"]);

function ministryMatchesScheduleEntry(
  entryMinistryType: string | null | undefined,
  requestedMinistryType: string | null | undefined,
) {
  if (!requestedMinistryType) return true;
  if (!entryMinistryType) return false;

  if (WEEKEND_MINISTRY_ALIASES.has(requestedMinistryType)) {
    return WEEKEND_MINISTRY_ALIASES.has(entryMinistryType);
  }

  return entryMinistryType === requestedMinistryType;
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
    ministryMatchesScheduleEntry(entry.ministry_type, ministryType),
  );

  return matchingEntry ?? sortedEntries[0] ?? null;
}

export function useScheduledTeamForDate(
  date: Date | null,
  campusId?: string | null,
  ministryType?: string | null,
) {
  const dateStr = date
    ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
    : null;

  return useQuery({
    queryKey: ["scheduled-team-for-date", dateStr, campusId, ministryType],
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
          created_at,
          worship_teams(id, name, color, icon)
        `)
        .eq("schedule_date", dateStr);

      if (campusId) {
        // Get campus-specific entry first, fall back to shared (null) entry
        query = query.or(`campus_id.eq.${campusId},campus_id.is.null`);
      }

      const { data, error } = await query;

      if (error) throw error;
      const entry = resolveScheduledTeamEntry((data || []) as ScheduledTeamScheduleRow[], campusId, ministryType);
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
    enabled: !!dateStr,
  });
}
