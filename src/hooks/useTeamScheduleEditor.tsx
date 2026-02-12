import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ScheduleEntry {
  id: string;
  schedule_date: string;
  team_id: string;
  team_name: string;
  team_color: string;
  team_icon: string;
  ministry_type: string | null;
  notes: string | null;
  campus_id: string | null;
  rotation_period: string;
}

export function useTeamScheduleForCampus(
  campusId: string | null,
  rotationPeriodName: string | null,
  ministryFilter: string | null
) {
  return useQuery({
    queryKey: ["team-schedule-campus", campusId, rotationPeriodName, ministryFilter],
    queryFn: async (): Promise<ScheduleEntry[]> => {
      if (!campusId || !rotationPeriodName) return [];

      let query = supabase
        .from("team_schedule")
        .select(`
          id,
          schedule_date,
          team_id,
          ministry_type,
          notes,
          campus_id,
          rotation_period,
          created_at,
          worship_teams(id, name, color, icon)
        `)
        .eq("rotation_period", rotationPeriodName)
        .order("schedule_date", { ascending: true });

      // Filter by campus - include entries for this campus OR null (shared)
      query = query.or(`campus_id.eq.${campusId},campus_id.is.null`);

      // Filter by ministry type if specified
      if (ministryFilter && ministryFilter !== "all") {
        query = query.eq("ministry_type", ministryFilter);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Prioritize campus-specific entries over shared ones
      // When same priority (e.g. duplicate shared entries), prefer newer by created_at
      const entriesMap = new Map<string, any>();
      const sorted = [...(data || [])].sort((a, b) => {
        const aT = new Date(a.created_at || 0).getTime();
        const bT = new Date(b.created_at || 0).getTime();
        return aT - bT; // older first, so newer overwrites
      });

      for (const entry of sorted) {
        const key = `${entry.schedule_date}-${entry.ministry_type || 'default'}`;
        const existing = entriesMap.get(key);

        // Keep campus-specific entries over shared (null) entries
        if (!existing || (entry.campus_id !== null && existing.campus_id === null)) {
          entriesMap.set(key, entry);
        } else if ((entry.campus_id ?? null) === (existing.campus_id ?? null)) {
          // Same priority - prefer newer
          const entryCreated = new Date(entry.created_at || 0).getTime();
          const existingCreated = new Date(existing.created_at || 0).getTime();
          if (entryCreated > existingCreated) {
            entriesMap.set(key, entry);
          }
        }
      }

      return Array.from(entriesMap.values())
        .sort((a, b) => a.schedule_date.localeCompare(b.schedule_date))
        .map((entry: any) => ({
          id: entry.id,
          schedule_date: entry.schedule_date,
          team_id: entry.team_id,
          team_name: entry.worship_teams?.name || "Unknown",
          team_color: entry.worship_teams?.color || "#888",
          team_icon: entry.worship_teams?.icon || "Users",
          ministry_type: entry.ministry_type,
          notes: entry.notes,
          campus_id: entry.campus_id,
          rotation_period: entry.rotation_period,
        }));
    },
    enabled: !!campusId && !!rotationPeriodName,
  });
}

export function useUpdateScheduleTeam() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      scheduleId,
      teamId,
      campusId,
    }: {
      scheduleId: string;
      teamId: string;
      campusId: string;
    }) => {
      // First check if this is a shared entry (campus_id is null)
      const { data: existing, error: fetchError } = await supabase
        .from("team_schedule")
        .select("campus_id, schedule_date, ministry_type, rotation_period, notes")
        .eq("id", scheduleId)
        .single();

      if (fetchError) throw fetchError;

      // If it's a shared entry, create a campus-specific copy instead of updating
      if (existing.campus_id === null) {
        const { error: insertError } = await supabase
          .from("team_schedule")
          .insert({
            schedule_date: existing.schedule_date,
            team_id: teamId,
            campus_id: campusId,
            ministry_type: existing.ministry_type,
            rotation_period: existing.rotation_period,
            notes: existing.notes,
          });

        if (insertError) throw insertError;
      } else {
        // Update existing campus-specific entry
        const { error: updateError } = await supabase
          .from("team_schedule")
          .update({ team_id: teamId })
          .eq("id", scheduleId);

        if (updateError) throw updateError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-schedule-campus"] });
      queryClient.invalidateQueries({ queryKey: ["team-schedule"] });
      queryClient.invalidateQueries({ queryKey: ["scheduled-team-for-date"] });
      toast.success("Schedule updated");
    },
    onError: (error) => {
      console.error("Failed to update schedule:", error);
      toast.error("Failed to update schedule");
    },
  });
}

export function useCreateScheduleEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      campusId,
      date,
      teamId,
      ministryType,
      rotationPeriod,
    }: {
      campusId: string;
      date: string;
      teamId: string;
      ministryType: string;
      rotationPeriod: string;
    }) => {
      const { error } = await supabase.from("team_schedule").insert({
        campus_id: campusId,
        schedule_date: date,
        team_id: teamId,
        ministry_type: ministryType,
        rotation_period: rotationPeriod,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-schedule-campus"] });
      queryClient.invalidateQueries({ queryKey: ["team-schedule"] });
      toast.success("Schedule entry added");
    },
    onError: (error) => {
      console.error("Failed to create schedule entry:", error);
      toast.error("Failed to add schedule entry");
    },
  });
}

export function useDeleteScheduleEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (scheduleId: string) => {
      const { error } = await supabase
        .from("team_schedule")
        .delete()
        .eq("id", scheduleId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-schedule-campus"] });
      queryClient.invalidateQueries({ queryKey: ["team-schedule"] });
      toast.success("Schedule entry removed");
    },
    onError: (error) => {
      console.error("Failed to delete schedule entry:", error);
      toast.error("Failed to remove schedule entry");
    },
  });
}
