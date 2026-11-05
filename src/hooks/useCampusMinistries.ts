import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useCampusMinistryRows(campusId?: string | null) {
  const fetchAll = campusId === undefined;
  return useQuery({
    queryKey: fetchAll ? ["campus-ministries"] : ["campus-ministries", campusId],
    enabled: fetchAll || Boolean(campusId),
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      let query = supabase.from("campus_ministries").select("campus_id, ministry_type");
      if (campusId) query = query.eq("campus_id", campusId);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });
}

/** Null means this campus has not saved a ministry list, so every ministry stays available. */
export function useCampusMinistrySet(campusId: string | null | undefined) {
  const query = useCampusMinistryRows(campusId || null);
  const enabled = useMemo(() => {
    if (!campusId || query.isError || !query.isSuccess || !query.data || query.data.length === 0) return null;
    return new Set(query.data.map((row) => row.ministry_type));
  }, [campusId, query.data, query.isError, query.isSuccess]);

  return {
    enabled,
    isLoading: Boolean(campusId) && query.isLoading,
    isError: query.isError,
    isSuccess: query.isSuccess,
  };
}

export function useAllCampusMinistries() {
  const query = useCampusMinistryRows();
  const byCampus = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const row of query.data || []) {
      const set = map.get(row.campus_id) ?? new Set<string>();
      set.add(row.ministry_type);
      map.set(row.campus_id, set);
    }
    return map;
  }, [query.data]);

  return { ...query, byCampus };
}
