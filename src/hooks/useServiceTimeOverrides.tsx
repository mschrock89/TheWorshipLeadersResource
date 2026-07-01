import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { getMinistryLabel, isNetworkWideMinistryType, resolveMinistryCampusId } from "@/lib/constants";

export interface ServiceTimeOverride {
  id: string;
  campus_id: string | null;
  ministry_type: string;
  service_date: string;
  service_times: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const WEEKEND_OVERRIDE_MINISTRIES = new Set(["weekend", "sunday_am", "weekend_team"]);

async function syncCustomServicesFromOverride(payload: {
  campus_id: string | null;
  ministry_type: string;
  service_date: string;
  service_times: string[];
  created_by: string | null;
}) {
  if (WEEKEND_OVERRIDE_MINISTRIES.has(payload.ministry_type)) return;

  let existingServicesQuery = supabase
    .from("custom_services")
    .select("start_time")
    .eq("service_date", payload.service_date)
    .eq("ministry_type", payload.ministry_type)
    .eq("is_active", true)
    .eq("repeats_weekly", false);

  existingServicesQuery = payload.campus_id
    ? existingServicesQuery.eq("campus_id", payload.campus_id)
    : existingServicesQuery.is("campus_id", null);

  const { data: existingServices, error: existingServicesError } = await existingServicesQuery;

  if (existingServicesError) throw existingServicesError;

  const existingStartTimes = new Set(
    (existingServices || [])
      .map((service) => service.start_time?.slice(0, 5))
      .filter(Boolean),
  );

  const missingTimes = payload.service_times.filter((time) => !existingStartTimes.has(time));
  if (missingTimes.length === 0) return;

  const serviceName = getMinistryLabel(payload.ministry_type);

  const { error: insertError } = await supabase
    .from("custom_services")
    .insert(
      missingTimes.map((time) => ({
        campus_id: payload.campus_id,
        ministry_type: payload.ministry_type,
        service_name: serviceName,
        service_date: payload.service_date,
        start_time: time,
        repeats_weekly: false,
        is_active: true,
        created_by: payload.created_by,
      })),
    );

  if (insertError) throw insertError;
}

export function useServiceTimeOverrides({
  campusId,
  startDate,
  endDate,
}: {
  campusId?: string;
  startDate: string;
  endDate: string;
}) {
  return useQuery({
    queryKey: ["service-time-overrides", campusId, startDate, endDate],
    enabled: !!startDate && !!endDate,
    queryFn: async () => {
      let query = supabase
        .from("service_time_overrides")
        .select("*")
        .gte("service_date", startDate)
        .lte("service_date", endDate)
        .order("service_date", { ascending: true });

      // Include Network Wide overrides (campus_id IS NULL, e.g. Student Camp)
      // alongside the selected campus.
      if (campusId) {
        query = query.or(`campus_id.eq.${campusId},campus_id.is.null`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as ServiceTimeOverride[];
    },
  });
}

export function useUpsertServiceTimeOverride() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (payload: {
      campus_id: string;
      ministry_type: string;
      service_date: string;
      service_times: string[];
    }) => {
      // Network-wide ministries (Student Camp) are stored with campus_id = NULL.
      const networkWide = isNetworkWideMinistryType(payload.ministry_type);
      const effectiveCampusId = resolveMinistryCampusId(payload.ministry_type, payload.campus_id);

      let existingQuery = supabase
        .from("service_time_overrides")
        .select("id, service_times")
        .eq("ministry_type", payload.ministry_type)
        .eq("service_date", payload.service_date);

      existingQuery = networkWide
        ? existingQuery.is("campus_id", null)
        : existingQuery.eq("campus_id", effectiveCampusId as string);

      const { data: existingOverride, error: existingError } = await existingQuery.maybeSingle();

      if (existingError) throw existingError;

      const normalizedTimes = Array.from(
        new Set(
          [...(existingOverride?.service_times || []), ...payload.service_times]
            .map((time) => time.trim().slice(0, 5))
            .filter(Boolean),
        ),
      ).sort();

      if (normalizedTimes.length === 0) {
        throw new Error("Add at least one service time.");
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      // NULL campus_id cannot be deduped via ON CONFLICT (NULLs are distinct), so
      // resolve the insert/update manually for both network-wide and campus rows.
      let data: ServiceTimeOverride;
      if (existingOverride?.id) {
        const { data: updated, error } = await supabase
          .from("service_time_overrides")
          .update({ service_times: normalizedTimes, created_by: user?.id ?? null })
          .eq("id", existingOverride.id)
          .select()
          .single();
        if (error) throw error;
        data = updated as ServiceTimeOverride;
      } else {
        const { data: inserted, error } = await supabase
          .from("service_time_overrides")
          .insert({
            campus_id: effectiveCampusId,
            ministry_type: payload.ministry_type,
            service_date: payload.service_date,
            service_times: normalizedTimes,
            created_by: user?.id ?? null,
          })
          .select()
          .single();
        if (error) throw error;
        data = inserted as ServiceTimeOverride;
      }

      await syncCustomServicesFromOverride({
        campus_id: effectiveCampusId,
        ministry_type: payload.ministry_type,
        service_date: payload.service_date,
        service_times: normalizedTimes,
        created_by: user?.id ?? null,
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service-time-overrides"] });
      queryClient.invalidateQueries({ queryKey: ["custom-service-definitions"] });
      queryClient.invalidateQueries({ queryKey: ["custom-service-occurrences"] });
      toast({ title: "Service times updated" });
    },
    onError: (error) => {
      toast({
        title: "Unable to save service times",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useDeleteServiceTimeOverride() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("service_time_overrides")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service-time-overrides"] });
      toast({ title: "Weekend-only service removed" });
    },
    onError: (error) => {
      toast({
        title: "Unable to remove service times",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
