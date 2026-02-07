import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface WorshipTeam {
  id: string;
  name: string;
  color: string;
  icon: string;
  created_at: string;
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
  notes: string | null;
  created_at: string;
  campus_id?: string | null;
  worship_teams?: WorshipTeam;
}

export function useWorshipTeams() {
  return useQuery({
    queryKey: ["worship-teams"],
    staleTime: 10 * 60 * 1000, // 10 minutes - teams rarely change
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worship_teams")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as WorshipTeam[];
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
  return useQuery({
    queryKey: ["team-schedule", rotationPeriod, campusId],
    queryFn: async () => {
      let query = supabase
        .from("team_schedule")
        .select("*, worship_teams(*), campus_id")
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
        
        // First pass: add all entries
        for (const entry of data) {
          const key = `${entry.schedule_date}-${entry.ministry_type || 'default'}`;
          const existing = entriesByDate.get(key);
          
          // Prioritize campus-specific (has campus_id) over shared (null campus_id)
          if (!existing || (entry.campus_id && !existing.campus_id)) {
            entriesByDate.set(key, entry as TeamScheduleEntry);
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
  
  return useQuery({
    queryKey: ["team-for-date", dateStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_schedule")
        .select("*, worship_teams(*)")
        .eq("schedule_date", dateStr)
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
