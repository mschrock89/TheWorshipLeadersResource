import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  weekendColumnsFromDrafts,
  type DayScheduleDraft,
  type MinistryServiceScheduleRow,
} from "@/lib/campusMinistrySchedule";

export type CampusMinistryServiceSchedule = MinistryServiceScheduleRow & {
  id: string;
  created_at: string;
  updated_at: string;
};

export function useCampusMinistrySchedules() {
  return useQuery({
    queryKey: ["campus-ministry-schedules"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campus_ministry_service_schedules")
        .select("id, campus_id, ministry_type, day_of_week, service_times, created_at, updated_at")
        .order("day_of_week", { ascending: true });

      if (error) throw error;
      return (data || []) as CampusMinistryServiceSchedule[];
    },
  });
}

export function useSaveCampusMinistrySchedule() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      campusId,
      ministryType,
      drafts,
    }: {
      campusId: string;
      ministryType: string;
      drafts: DayScheduleDraft[];
    }) => {
      const rows = drafts
        .filter((draft) => draft.enabled)
        .map((draft) => ({
          campus_id: campusId,
          ministry_type: ministryType,
          day_of_week: draft.day,
          service_times: [...new Set(draft.times.map((time) => time.trim().slice(0, 5)).filter(Boolean))].sort(),
        }))
        .filter((row) => row.service_times.length > 0);

      if (rows.length > 0) {
        const { error: upsertError } = await supabase
          .from("campus_ministry_service_schedules")
          .upsert(rows, { onConflict: "campus_id,ministry_type,day_of_week" });
        if (upsertError) throw upsertError;
      }

      const keptDays = rows.map((row) => row.day_of_week);
      let deleteQuery = supabase
        .from("campus_ministry_service_schedules")
        .delete()
        .eq("campus_id", campusId)
        .eq("ministry_type", ministryType);
      if (keptDays.length > 0) {
        deleteQuery = deleteQuery.not("day_of_week", "in", `(${keptDays.join(",")})`);
      }
      const { error: deleteError } = await deleteQuery;
      if (deleteError) throw deleteError;

      if (ministryType === "weekend") {
        const columns = weekendColumnsFromDrafts(drafts);
        const { error: campusError } = await supabase
          .from("campuses")
          .update({
            has_saturday_service: columns.has_saturday_service,
            has_sunday_service: columns.has_sunday_service,
            saturday_service_time: columns.saturday_service_time,
            sunday_service_time: columns.sunday_service_time,
          })
          .eq("id", campusId);
        if (campusError) throw campusError;
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["campus-ministry-schedules"] }),
        queryClient.invalidateQueries({ queryKey: ["campuses"] }),
      ]);
      toast({ title: "Service schedule updated" });
    },
    onError: (error) => {
      toast({
        title: "Error updating service schedule",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
