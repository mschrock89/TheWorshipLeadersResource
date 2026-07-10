import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Ministry {
  key: string;
  name: string;
  resource_app_key: string;
  is_active: boolean;
}

export interface ServingRecord {
  id: string;
  ministry_key: string;
  campus_id: string;
  service_date: string;
  category: string;
  count: number;
  notes: string | null;
  campuses: { name: string } | null;
  ministries: { name: string } | null;
}

export interface MinistryMembership {
  id: string;
  user_id: string;
  ministry_key: string;
  campus_id: string;
  campuses: { name: string } | null;
  ministries: { name: string } | null;
}

export interface HubProfile {
  id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
}

export function useMinistries() {
  return useQuery({
    queryKey: ["hub-ministries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ministries")
        .select("key, name, resource_app_key, is_active")
        .eq("is_active", true)
        .order("key");

      if (error) throw error;
      return data as Ministry[];
    },
  });
}

export function useServingRecords(ministryKey?: string) {
  return useQuery({
    queryKey: ["hub-serving-records", ministryKey ?? "all"],
    queryFn: async () => {
      let query = supabase
        .from("serving_records")
        .select("id, ministry_key, campus_id, service_date, category, count, notes, campuses(name), ministries(name)")
        .order("service_date", { ascending: false })
        .limit(200);

      if (ministryKey) {
        query = query.eq("ministry_key", ministryKey);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as ServingRecord[];
    },
  });
}

export function useUpsertServingRecord() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (record: {
      ministry_key: string;
      campus_id: string;
      service_date: string;
      category: string;
      count: number;
      notes: string | null;
      recorded_by: string;
    }) => {
      const { error } = await supabase
        .from("serving_records")
        .upsert(record, { onConflict: "ministry_key,campus_id,service_date,category" });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hub-serving-records"] });
    },
  });
}

export function useHubProfiles() {
  return useQuery({
    queryKey: ["hub-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .order("full_name");

      if (error) throw error;
      return data as HubProfile[];
    },
  });
}

export function useMinistryMemberships() {
  return useQuery({
    queryKey: ["hub-ministry-memberships"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ministry_memberships")
        .select("id, user_id, ministry_key, campus_id, campuses(name), ministries(name)");

      if (error) throw error;
      return data as MinistryMembership[];
    },
  });
}

export function useAddMinistryMembership() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (membership: { user_id: string; ministry_key: string; campus_id: string }) => {
      const { error } = await supabase.from("ministry_memberships").insert(membership);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hub-ministry-memberships"] });
    },
  });
}

export function useRemoveMinistryMembership() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (membershipId: string) => {
      const { error } = await supabase.from("ministry_memberships").delete().eq("id", membershipId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hub-ministry-memberships"] });
    },
  });
}
