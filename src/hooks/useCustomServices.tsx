import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addWeeks, format, isAfter, isBefore, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
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

export interface CustomServiceAssignment {
  id: string;
  custom_service_id: string;
  assignment_date: string;
  user_id: string;
  role: Database["public"]["Enums"]["team_position"];
  assigned_by: string | null;
  created_at: string;
  profiles: {
    full_name: string | null;
    avatar_url: string | null;
  } | null;
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

export function useCustomServiceCampusMembers(campusId?: string) {
  return useQuery({
    queryKey: ["custom-service-campus-members", campusId],
    enabled: !!campusId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_campuses")
        .select("user_id, profiles!inner(id, full_name, avatar_url)")
        .eq("campus_id", campusId!)
        .order("user_id", { ascending: true });

      if (error) throw error;

      const unique = new Map<string, { id: string; full_name: string | null; avatar_url: string | null }>();
      for (const row of data || []) {
        const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
        if (!profile) continue;
        unique.set(profile.id, {
          id: profile.id,
          full_name: profile.full_name,
          avatar_url: profile.avatar_url,
        });
      }
      return Array.from(unique.values()).sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
    },
  });
}

export function useCustomServiceAssignments(customServiceId?: string, assignmentDate?: string) {
  return useQuery({
    queryKey: ["custom-service-assignments", customServiceId, assignmentDate],
    enabled: !!customServiceId && !!assignmentDate,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("custom_service_assignments")
        .select("*, profiles!custom_service_assignments_user_id_fkey(full_name, avatar_url)")
        .eq("custom_service_id", customServiceId!)
        .eq("assignment_date", assignmentDate!)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return (data || []) as CustomServiceAssignment[];
    },
  });
}

export function useAddCustomServiceAssignment() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (payload: {
      custom_service_id: string;
      assignment_date: string;
      user_id: string;
      role: Database["public"]["Enums"]["team_position"];
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from("custom_service_assignments")
        .upsert(
          {
            ...payload,
            assigned_by: user?.id ?? null,
          },
          { onConflict: "custom_service_id,assignment_date,user_id,role" },
        )
        .select("*, profiles!custom_service_assignments_user_id_fkey(full_name, avatar_url)")
        .single();

      if (error) throw error;
      return data as CustomServiceAssignment;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["custom-service-assignments", variables.custom_service_id, variables.assignment_date],
      });
      toast({ title: "Team member assigned" });
    },
    onError: (error) => {
      toast({ title: "Unable to assign member", description: error.message, variant: "destructive" });
    },
  });
}

export function useRemoveCustomServiceAssignment() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (payload: { id: string; custom_service_id: string; assignment_date: string }) => {
      const { error } = await supabase.from("custom_service_assignments").delete().eq("id", payload.id);
      if (error) throw error;
      return payload;
    },
    onSuccess: (payload) => {
      queryClient.invalidateQueries({
        queryKey: ["custom-service-assignments", payload.custom_service_id, payload.assignment_date],
      });
      toast({ title: "Assignment removed" });
    },
    onError: (error) => {
      toast({ title: "Unable to remove assignment", description: error.message, variant: "destructive" });
    },
  });
}
