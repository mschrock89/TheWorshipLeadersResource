import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMyTeamAssignments } from "@/hooks/useMyTeamAssignments";
import { getCurrentResourceAppKey } from "@/lib/resourceApp";
import {
  groupScriptAssignments,
  monthStartForDate,
  type ServiceScriptKind,
  type ServiceScriptStatus,
} from "@/lib/serviceScripts";

export interface ServiceScriptRow {
  id: string;
  campus_id: string;
  ministry_type: string;
  resource_app_key: string;
  script_kind: ServiceScriptKind;
  month_start: string;
  weekend_date: string | null;
  body: string;
  status: ServiceScriptStatus;
  sent_at: string | null;
  sent_by: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SaveServiceScriptInput {
  id?: string | null;
  campusId: string;
  ministryType: string;
  scriptKind: ServiceScriptKind;
  monthStart: string;
  weekendDate: string | null;
  body: string;
  status: ServiceScriptStatus;
  userId: string;
}

export type ServiceScriptNotifyEvent = "sent" | "updated" | "removed";

export interface ServiceScriptNotifyResult {
  recipients: number;
  pushSent: number;
  pushFailed: number;
}

function scriptsTable() {
  return supabase.from("service_scripts");
}

export function useServiceScripts(campusId: string | null, ministryType: string, monthStart: string) {
  const resourceAppKey = getCurrentResourceAppKey();

  return useQuery({
    queryKey: ["service-scripts", "admin", resourceAppKey, campusId, ministryType, monthStart],
    enabled: Boolean(campusId && ministryType && monthStart),
    queryFn: async () => {
      const { data, error } = await scriptsTable()
        .select("*")
        .eq("resource_app_key", resourceAppKey)
        .eq("campus_id", campusId!)
        .eq("ministry_type", ministryType)
        .eq("month_start", monthStart)
        .order("weekend_date", { ascending: true, nullsFirst: true });

      if (error) throw error;
      return (data || []) as ServiceScriptRow[];
    },
  });
}

export function useSentServiceScripts(campusIds: string[], monthStarts: string[]) {
  const resourceAppKey = getCurrentResourceAppKey();
  const campusKey = [...campusIds].sort().join(",");
  const monthKey = [...monthStarts].sort().join(",");

  return useQuery({
    queryKey: ["service-scripts", "sent", resourceAppKey, campusKey, monthKey],
    enabled: campusIds.length > 0 && monthStarts.length > 0,
    queryFn: async () => {
      const { data, error } = await scriptsTable()
        .select("*")
        .eq("resource_app_key", resourceAppKey)
        .eq("status", "sent")
        .in("campus_id", campusIds)
        .in("month_start", monthStarts);

      if (error) throw error;
      return (data || []) as ServiceScriptRow[];
    },
  });
}

export function useSaveServiceScript() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SaveServiceScriptInput) => {
      const resourceAppKey = getCurrentResourceAppKey();
      const payload = {
        campus_id: input.campusId,
        ministry_type: input.ministryType,
        resource_app_key: resourceAppKey,
        script_kind: input.scriptKind,
        month_start: input.monthStart,
        weekend_date: input.weekendDate,
        body: input.body.trim(),
        status: input.status,
        updated_by: input.userId,
        ...(input.status === "sent"
          ? { sent_at: new Date().toISOString(), sent_by: input.userId }
          : {}),
      };

      if (input.id) {
        const { data, error } = await scriptsTable()
          .update(payload)
          .eq("id", input.id)
          .select("*")
          .single();
        if (error) throw error;
        return data as ServiceScriptRow;
      }

      const { data, error } = await scriptsTable()
        .insert({ ...payload, created_by: input.userId })
        .select("*")
        .single();
      if (error) throw error;
      return data as ServiceScriptRow;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service-scripts"] });
    },
  });
}

export function useDeleteServiceScript() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await scriptsTable().delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service-scripts"] });
    },
  });
}

export function useNotifyServiceScript() {
  return useMutation({
    mutationFn: async ({ scriptId, event }: { scriptId: string; event: ServiceScriptNotifyEvent }) => {
      const { data, error } = await supabase.functions.invoke("notify-service-script", {
        body: { scriptId, event },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as ServiceScriptNotifyResult;
    },
  });
}

export function monthStartsForScheduleDates(scheduleDates: string[]) {
  return [...new Set(scheduleDates.map((date) => monthStartForDate(date)))];
}

export function useMyServiceScriptGroups() {
  const { scheduledDates, isLoading: datesLoading } = useMyTeamAssignments();
  const groups = useMemo(
    () =>
      groupScriptAssignments(
        scheduledDates.map((date) => ({
          scheduleDate: date.scheduleDate,
          campusId: date.campusId,
          campusName: date.campusName,
          ministryType: date.ministryType,
          position: date.position,
          teamName: date.teamName,
        })),
      ),
    [scheduledDates],
  );
  const campusIds = useMemo(() => [...new Set(groups.map((group) => group.campusId))], [groups]);
  const monthStarts = useMemo(
    () => [...new Set(groups.map((group) => monthStartForDate(group.weekendKey)))],
    [groups],
  );
  const scriptsQuery = useSentServiceScripts(campusIds, monthStarts);

  return {
    groups,
    scripts: scriptsQuery.data ?? [],
    isLoading: datesLoading || (groups.length > 0 && scriptsQuery.isLoading),
    error: scriptsQuery.error,
  };
}
