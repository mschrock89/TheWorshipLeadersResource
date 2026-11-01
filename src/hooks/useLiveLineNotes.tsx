import { useCallback, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCapabilities } from "@/hooks/useCapabilities";
import { useLiveModeAccess } from "@/hooks/useCanOpenLiveMode";
import { useToast } from "@/hooks/use-toast";
import { CAPABILITIES } from "@/lib/capabilities";
import { canUseLiveLineNotes, type LiveStation } from "@/lib/liveMode";

export const LIVE_LINE_NOTE_MAX = 2000;

export type LiveLineNote = {
  service_flow_item_id: string;
  station: LiveStation;
  body: string;
  updated_at: string;
};

function isActiveRevoke(expiresAt: string | null) {
  if (!expiresAt) return true;
  const expires = new Date(expiresAt).getTime();
  return Number.isFinite(expires) && expires > Date.now();
}

export function useCanUseLiveLineNotes(campusId?: string | null) {
  const { user } = useAuth();
  const { can, isLoading: capabilitiesLoading } = useCapabilities();
  const access = useLiveModeAccess(campusId);
  const revokeQuery = useQuery({
    queryKey: ["live-line-notes-revoked", user?.id],
    enabled: !!user?.id,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_capability_overrides")
        .select("expires_at")
        .eq("user_id", user!.id)
        .eq("capability_key", CAPABILITIES.LIVE_LINE_NOTES)
        .eq("granted", false);
      if (error) return false;
      return (data || []).some((row) => isActiveRevoke(row.expires_at));
    },
  });

  const allowed = canUseLiveLineNotes({
    hasCapability: can(CAPABILITIES.LIVE_LINE_NOTES),
    revoked: revokeQuery.data === true,
    hasLiveTeamAssignment: access.hasLiveTeamAssignment,
  });

  return {
    allowed,
    isLoading: capabilitiesLoading || access.isLoading || revokeQuery.isLoading,
  };
}

export function useLiveLineNotes(itemIds: string[], station: LiveStation, enabled: boolean) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const itemKey = useMemo(() => [...itemIds].sort().join(","), [itemIds]);
  const queryKey = useMemo(
    () => ["live-line-notes", user?.id, station, itemKey] as const,
    [itemKey, station, user?.id],
  );

  const query = useQuery({
    queryKey,
    enabled: enabled && !!user?.id && itemIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("live_line_notes")
        .select("service_flow_item_id, station, body, updated_at")
        .eq("user_id", user!.id)
        .eq("station", station)
        .in("service_flow_item_id", itemIds);
      if (error) throw error;
      return (data || []) as LiveLineNote[];
    },
  });

  useEffect(() => {
    if (!enabled || !user?.id) return;
    const channel = supabase
      .channel(`live-line-notes:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_line_notes", filter: `user_id=eq.${user.id}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["live-line-notes", user.id] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, queryClient, user?.id]);

  const notes = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of query.data || []) map.set(row.service_flow_item_id, row.body);
    return map;
  }, [query.data]);

  const saveNote = useCallback(
    async (itemId: string, body: string) => {
      if (!user) return false;
      const trimmed = body.trim().slice(0, LIVE_LINE_NOTE_MAX);
      const request = trimmed
        ? supabase.from("live_line_notes").upsert(
            {
              user_id: user.id,
              service_flow_item_id: itemId,
              station,
              body: trimmed,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id,service_flow_item_id,station" },
          )
        : supabase
            .from("live_line_notes")
            .delete()
            .eq("user_id", user.id)
            .eq("service_flow_item_id", itemId)
            .eq("station", station);
      const { error } = await request;
      if (error) {
        toast({
          title: "Could not save that note",
          description: error.message,
          variant: "destructive",
        });
        return false;
      }
      queryClient.setQueryData<LiveLineNote[]>(queryKey, (current) => {
        const rows = (current || []).filter((row) => row.service_flow_item_id !== itemId);
        if (!trimmed) return rows;
        return [
          ...rows,
          {
            service_flow_item_id: itemId,
            station,
            body: trimmed,
            updated_at: new Date().toISOString(),
          },
        ];
      });
      return true;
    },
    [queryClient, queryKey, station, toast, user],
  );

  return {
    notes,
    saveNote,
    isLoading: query.isLoading,
  };
}
