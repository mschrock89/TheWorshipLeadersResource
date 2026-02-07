import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface ScheduledTeam {
  id: string;
  teamId: string;
  teamName: string;
  teamColor: string;
  teamIcon: string;
  scheduleDate: string;
  campusId: string | null;
}

export function useScheduledTeamForDate(date: Date | null, campusId?: string | null) {
  const dateStr = date
    ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
    : null;

  return useQuery({
    queryKey: ["scheduled-team-for-date", dateStr, campusId],
    queryFn: async (): Promise<ScheduledTeam | null> => {
      if (!dateStr) return null;

      // Build query - if campusId provided, prioritize campus-specific entries
      let query = supabase
        .from("team_schedule")
        .select(`
          id,
          schedule_date,
          team_id,
          campus_id,
          worship_teams(id, name, color, icon)
        `)
        .eq("schedule_date", dateStr);

      if (campusId) {
        // Get campus-specific entry first, fall back to shared (null) entry
        query = query.or(`campus_id.eq.${campusId},campus_id.is.null`);
      }

      const { data, error } = await query
        .order("campus_id", { ascending: false, nullsFirst: false }) // Campus-specific first
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (!data || !data.worship_teams) return null;

      const team = data.worship_teams as { id: string; name: string; color: string; icon: string };

      return {
        id: data.id,
        teamId: team.id,
        teamName: team.name,
        teamColor: team.color,
        teamIcon: team.icon,
        scheduleDate: data.schedule_date,
        campusId: data.campus_id,
      };
    },
    enabled: !!dateStr,
  });
}
