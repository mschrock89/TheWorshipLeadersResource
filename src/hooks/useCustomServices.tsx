import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addWeeks, format, isAfter, isBefore, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface CustomService {
  id: string;
  campus_id: string;
  ministry_type: string;
  service_name: string;
  service_date: string;
  start_time: string | null;
  end_time: string | null;
  repeats_weekly: boolean;
  repeat_until: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomServiceOccurrence extends CustomService {
  occurrence_key: string;
  occurrence_date: string;
}

function expandServiceOccurrences(
  services: CustomService[],
  rangeStart: string,
  rangeEnd: string,
): CustomServiceOccurrence[] {
  const start = parseISO(rangeStart);
  const end = parseISO(rangeEnd);
  const occurrences: CustomServiceOccurrence[] = [];

  for (const service of services) {
    const baseDate = parseISO(service.service_date);
    const repeatUntil = service.repeat_until ? parseISO(service.repeat_until) : null;

    if (!service.repeats_weekly) {
      if (!isBefore(baseDate, start) && !isAfter(baseDate, end)) {
        occurrences.push({
          ...service,
          occurrence_key: `${service.id}:${service.service_date}`,
          occurrence_date: service.service_date,
        });
      }
      continue;
    }

    let current = baseDate;
    while (isBefore(current, start)) {
      current = addWeeks(current, 1);
    }

    while (!isAfter(current, end)) {
      if (repeatUntil && isAfter(current, repeatUntil)) break;
      occurrences.push({
        ...service,
        occurrence_key: `${service.id}:${format(current, "yyyy-MM-dd")}`,
        occurrence_date: format(current, "yyyy-MM-dd"),
      });
      current = addWeeks(current, 1);
    }
  }

  return occurrences.sort((a, b) => {
    const dateCmp = a.occurrence_date.localeCompare(b.occurrence_date);
    if (dateCmp !== 0) return dateCmp;
    return (a.start_time || "").localeCompare(b.start_time || "");
  });
}

export function useCustomServiceDefinitions(campusId?: string) {
  return useQuery({
    queryKey: ["custom-service-definitions", campusId],
    queryFn: async () => {
      let query = supabase
        .from("custom_services")
        .select("*")
        .eq("is_active", true)
        .order("service_date", { ascending: true });

      if (campusId) {
        query = query.eq("campus_id", campusId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as CustomService[];
    },
  });
}

export function useCustomServiceOccurrences({
  campusId,
  ministryType,
  startDate,
  endDate,
}: {
  campusId?: string;
  ministryType?: string;
  startDate: string;
  endDate: string;
}) {
  return useQuery({
    queryKey: ["custom-service-occurrences", campusId, ministryType, startDate, endDate],
    enabled: !!startDate && !!endDate,
    queryFn: async () => {
      let query = supabase
        .from("custom_services")
        .select("*")
        .eq("is_active", true)
        .lte("service_date", endDate)
        .order("service_date", { ascending: true });

      if (campusId) {
        query = query.eq("campus_id", campusId);
      }
      if (ministryType) {
        query = query.eq("ministry_type", ministryType);
      }

      const { data, error } = await query;
      if (error) throw error;

      return expandServiceOccurrences((data || []) as CustomService[], startDate, endDate);
    },
  });
}

export function useCreateCustomService() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (payload: {
      campus_id: string;
      ministry_type: string;
      service_name: string;
      service_date: string;
      start_time?: string | null;
      end_time?: string | null;
      repeats_weekly?: boolean;
      repeat_until?: string | null;
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from("custom_services")
        .insert({
          ...payload,
          created_by: user?.id ?? null,
        })
        .select()
        .single();

      if (error) throw error;
      return data as CustomService;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom-service-definitions"] });
      queryClient.invalidateQueries({ queryKey: ["custom-service-occurrences"] });
      toast({ title: "Custom service created" });
    },
    onError: (error) => {
      toast({ title: "Unable to create service", description: error.message, variant: "destructive" });
    },
  });
}

export function useDeleteCustomService() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("custom_services").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom-service-definitions"] });
      queryClient.invalidateQueries({ queryKey: ["custom-service-occurrences"] });
      toast({ title: "Custom service deleted" });
    },
    onError: (error) => {
      toast({ title: "Unable to delete service", description: error.message, variant: "destructive" });
    },
  });
}
