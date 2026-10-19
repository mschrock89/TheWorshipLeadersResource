import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import type { SongMapCue, SongMapKind } from "@/lib/songMap";

type SongMapRow = {
  id: string;
  service_flow_item_id: string;
  offset_seconds: number;
  body: string;
  kind: string;
};

function mapCue(row: SongMapRow): SongMapCue {
  return {
    id: row.id,
    serviceFlowItemId: row.service_flow_item_id,
    offsetSeconds: row.offset_seconds,
    body: row.body,
    kind: row.kind === "mix" ? "mix" : "note",
  };
}

function sortCues(cues: SongMapCue[]) {
  return [...cues].sort(
    (left, right) => left.offsetSeconds - right.offsetSeconds || left.id.localeCompare(right.id),
  );
}

function isMissingSongMapSchema(error: unknown) {
  const text = `${(error as { message?: string } | null)?.message || ""} ${(error as { code?: string } | null)?.code || ""}`.toLowerCase();
  return text.includes("song_map_cues") || text.includes("schema cache") || text.includes("42p01") || text.includes("pgrst205");
}

export function useSongMapCues(flowId: string | null, itemIds: string[]) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();
  const idsKey = itemIds.slice().sort().join(",");
  const queryKey = ["song-map-cues", flowId, idsKey] as const;

  const query = useQuery({
    queryKey,
    enabled: !!flowId && itemIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("song_map_cues")
        .select("id, service_flow_item_id, offset_seconds, body, kind")
        .in("service_flow_item_id", itemIds)
        .order("offset_seconds", { ascending: true });
      if (error) throw error;
      return sortCues((data || []).map((row) => mapCue(row as SongMapRow)));
    },
  });

  useEffect(() => {
    if (!flowId || !idsKey) return;
    const ids = new Set(idsKey.split(","));
    const channel = supabase
      .channel(`song-map-${flowId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "song_map_cues" },
        (payload) => {
          const row = (payload.new || payload.old) as { service_flow_item_id?: string } | null;
          if (!row?.service_flow_item_id || !ids.has(row.service_flow_item_id)) return;
          void queryClient.invalidateQueries({ queryKey: ["song-map-cues", flowId] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [flowId, idsKey, queryClient]);

  const writeCache = (cue: SongMapCue, remove = false) => {
    queryClient.setQueryData<SongMapCue[]>(queryKey, (current) => {
      const next = (current || []).filter((entry) => entry.id !== cue.id);
      if (!remove) next.push(cue);
      return sortCues(next);
    });
  };

  const saveCue = async (input: {
    id?: string;
    serviceFlowItemId: string;
    offsetSeconds: number;
    body: string;
    kind: SongMapKind;
  }) => {
    const body = input.body.trim();
    if (!body) throw new Error("Write the note first.");
    const payload = {
      offset_seconds: Math.max(0, Math.round(input.offsetSeconds)),
      body,
      kind: input.kind,
    };
    const request = input.id
      ? supabase.from("song_map_cues").update(payload).eq("id", input.id).select("id, service_flow_item_id, offset_seconds, body, kind").single()
      : supabase
          .from("song_map_cues")
          .insert({
            ...payload,
            service_flow_item_id: input.serviceFlowItemId,
            created_by: user?.id || null,
          })
          .select("id, service_flow_item_id, offset_seconds, body, kind")
          .single();
    const { data, error } = await request;
    if (error || !data) {
      toast({
        title: "Couldn't save that note",
        description: error?.message || "Try again.",
        variant: "destructive",
      });
      throw error || new Error("Couldn't save that note");
    }
    writeCache(mapCue(data as SongMapRow));
  };

  const deleteCue = async (id: string) => {
    const existing = (query.data || []).find((cue) => cue.id === id);
    const { error } = await supabase.from("song_map_cues").delete().eq("id", id);
    if (error) {
      toast({
        title: "Couldn't remove that note",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
    if (existing) writeCache(existing, true);
  };

  return {
    cues: query.data || [],
    schemaMissing: isMissingSongMapSchema(query.error),
    saveCue,
    deleteCue,
  };
}
