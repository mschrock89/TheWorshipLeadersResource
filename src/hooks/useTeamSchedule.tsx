import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TeamTemplateConfig } from "@/lib/teamTemplates";
import { getCurrentResourceAppKey } from "@/lib/resourceApp";

/** Get the rotation period name that covers a given date for a campus (for filtering team_schedule) */
export function useRotationPeriodForDate(campusId: string | null, date: Date | null) {
  const dateStr = date
    ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
    : null;

  return useQuery({
    queryKey: ["rotation-period-for-date", campusId, dateStr],
    queryFn: async (): Promise<string | null> => {
      if (!campusId || !dateStr) return null;
      const { data, error } = await supabase
        .from("rotation_periods")
        .select("name")
        .eq("campus_id", campusId)
        .lte("start_date", dateStr)
        .gte("end_date", dateStr)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data?.name ?? null;
    },
    enabled: !!campusId && !!dateStr,
  });
}

export interface WorshipTeam {
  id: string;
  name: string;
  color: string;
  icon: string;
  created_at: string;
  resource_app_key?: string;
  template_config?: TeamTemplateConfig | null;
}

export interface TeamMember {
  id: string;
  team_id: string;
  member_name: string;
  position: string;
  display_order: number;
  created_at: string;
}

export interface TeamScheduleEntry {
  id: string;
  team_id: string;
  schedule_date: string;
  rotation_period: string;
  ministry_type?: string | null;
  time_of_day?: string | null;
  notes: string | null;
  created_at: string;
  campus_id?: string | null;
  resource_app_key?: string;
  worship_teams?: WorshipTeam;
}

const WORSHIP_TEAM_DISPLAY_ORDER = [
  "Team 1",
  "Team 2",
  "Team 3",
  "Team 4",
  "Combined",
  "Simple Worship",
  "5th Sunday",
] as const;

function sortWorshipTeams(teams: WorshipTeam[]) {
  const orderMap = new Map(
    WORSHIP_TEAM_DISPLAY_ORDER.map((name, index) => [name.toLowerCase(), index]),
  );

  return [...teams].sort((a, b) => {
    const aIndex = orderMap.get(a.name.toLowerCase());
    const bIndex = orderMap.get(b.name.toLowerCase());

    if (aIndex !== undefined || bIndex !== undefined) {
      if (aIndex === undefined) return 1;
      if (bIndex === undefined) return -1;
      if (aIndex !== bIndex) return aIndex - bIndex;
    }

    return a.name.localeCompare(b.name);
  });
}

export function useWorshipTeams() {
  const resourceAppKey = getCurrentResourceAppKey();

  return useQuery({
    queryKey: ["worship-teams", resourceAppKey],
    staleTime: 10 * 60 * 1000, // 10 minutes - teams rarely change
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worship_teams")
        .select("*")
        .eq("resource_app_key", resourceAppKey)
        .order("name");
      if (error) throw error;
      return sortWorshipTeams((data || []) as WorshipTeam[]);
    },
  });
}

export function useTeamMembers(teamId?: string) {
  return useQuery({
    queryKey: ["team-members", teamId],
    queryFn: async () => {
      let query = supabase
        .from("team_members")
        .select("*")
        .order("display_order");
      
      if (teamId) {
        query = query.eq("team_id", teamId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as TeamMember[];
    },
  });
}

export function useTeamSchedule(rotationPeriod?: string, campusId?: string | null) {
  const resourceAppKey = getCurrentResourceAppKey();

  return useQuery({
    queryKey: ["team-schedule", rotationPeriod, campusId, resourceAppKey],
    queryFn: async () => {
      let query = supabase
        .from("team_schedule")
        .select("*, worship_teams(*), campus_id")
        .eq("resource_app_key", resourceAppKey)
        .order("schedule_date");
      
      if (rotationPeriod) {
        query = query.eq("rotation_period", rotationPeriod);
      }
      
      // If campusId is provided, get campus-specific OR shared (null) entries
      if (campusId) {
        query = query.or(`campus_id.eq.${campusId},campus_id.is.null`);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      // If campusId is provided, prioritize campus-specific entries over shared ones
      if (campusId && data) {
        const entriesByDate = new Map<string, TeamScheduleEntry>();
        
        // Sort so newer entries (by created_at) are processed last - they win when same priority
        const sorted = [...data].sort((a, b) => {
          const aT = new Date((a as { created_at?: string }).created_at || 0).getTime();
          const bT = new Date((b as { created_at?: string }).created_at || 0).getTime();
          return aT - bT; // older first, so newer overwrites
        });

        for (const entry of sorted) {
          const key = `${entry.schedule_date}-${entry.ministry_type || 'default'}-${(entry as TeamScheduleEntry).time_of_day || 'all'}`;
          const existing = entriesByDate.get(key);
          const entryAny = entry as TeamScheduleEntry & { created_at?: string };
          
          // Prioritize campus-specific (has campus_id) over shared (null campus_id)
          if (!existing || (entry.campus_id && !existing.campus_id)) {
            entriesByDate.set(key, entry as TeamScheduleEntry);
          } else if ((entry.campus_id ?? null) === (existing.campus_id ?? null)) {
            // Same priority (both shared or both campus-specific) - prefer newer
            const entryCreated = new Date(entryAny.created_at || 0).getTime();
            const existingCreated = new Date((existing as TeamScheduleEntry & { created_at?: string }).created_at || 0).getTime();
            if (entryCreated > existingCreated) {
              entriesByDate.set(key, entry as TeamScheduleEntry);
            }
          }
        }
        
        return Array.from(entriesByDate.values());
      }
      
      return data as TeamScheduleEntry[];
    },
  });
}

export function useTeamForDate(date: Date) {
  const dateStr = date.toISOString().split("T")[0];
  const resourceAppKey = getCurrentResourceAppKey();
  
  return useQuery({
    queryKey: ["team-for-date", dateStr, resourceAppKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_schedule")
        .select("*, worship_teams(*)")
        .eq("schedule_date", dateStr)
        .eq("resource_app_key", resourceAppKey)
        .maybeSingle();
      
      if (error) throw error;
      return data as TeamScheduleEntry | null;
    },
  });
}

export function getTeamIcon(icon: string) {
  return icon;
}

export function getTeamColor(color: string) {
  return color;
}
