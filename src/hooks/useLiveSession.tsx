import { useCallback, useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { getCurrentResourceAppKey } from "@/lib/resourceApp";
import {
  getLiveClientId,
  sanitizeTalkbackTranscript,
  shouldDropRepeat,
  type LiveStation,
} from "@/lib/liveMode";

export type LiveSessionRow = Database["public"]["Tables"]["live_sessions"]["Row"];
export type LiveTalkbackChannel = Database["public"]["Tables"]["live_talkback_channels"]["Row"];
export type LiveTalkbackLine = Database["public"]["Tables"]["live_talkback_lines"]["Row"];
export type LiveChatMessage = Database["public"]["Tables"]["live_chat_messages"]["Row"];
export type LiveSessionNotes = Database["public"]["Tables"]["live_session_notes"]["Row"];

type LiveSessionParams = {
  campusId: string | null;
  ministryType: string;
  serviceDate: string;
  customServiceId?: string | null;
  draftSetId?: string | null;
};

function errorText(error: unknown) {
  if (!error || typeof error !== "object") return "";
  const row = error as { message?: string; details?: string; hint?: string; code?: string };
  return `${row.code || ""} ${row.message || ""} ${row.details || ""} ${row.hint || ""}`.toLowerCase();
}

function isForbidden(error: unknown) {
  return errorText(error).includes("forbidden");
}

function isMissingLiveSchema(error: unknown) {
  const text = errorText(error);
  return (
    text.includes("ensure_live_session") ||
    text.includes("schema cache") ||
    text.includes("live_sessions") ||
    text.includes("pgrst202")
  );
}

export function useLiveSession({
  campusId,
  ministryType,
  serviceDate,
  customServiceId = null,
  draftSetId = null,
}: LiveSessionParams) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const resourceAppKey = getCurrentResourceAppKey();
  const clientId = useMemo(() => getLiveClientId(), []);
  const recentLines = useRef(new Map<string, { text: string; at: number }>());

  const sessionKey = useMemo(
    () => ["live-session", resourceAppKey, campusId, ministryType, serviceDate, customServiceId || null, draftSetId || null] as const,
    [resourceAppKey, campusId, ministryType, serviceDate, customServiceId, draftSetId],
  );

  const sessionQuery = useQuery({
    queryKey: sessionKey,
    enabled: !!campusId && !!serviceDate && !!ministryType && !!user,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ensure_live_session", {
        _campus_id: campusId!,
        _ministry_type: ministryType,
        _service_date: serviceDate,
        _custom_service_id: customServiceId,
        _draft_set_id: draftSetId,
        _resource_app_key: resourceAppKey,
      });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });

  const session = sessionQuery.data ?? null;
  const sessionId = session?.id ?? null;
  const channelsKey = useMemo(() => ["live-channels", sessionId] as const, [sessionId]);
  const linesKey = useMemo(() => ["live-lines", sessionId] as const, [sessionId]);
  const chatKey = useMemo(() => ["live-chat", sessionId] as const, [sessionId]);
  const notesKey = useMemo(() => ["live-notes", sessionId] as const, [sessionId]);

  const channelsQuery = useQuery({
    queryKey: channelsKey,
    enabled: !!sessionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("live_talkback_channels")
        .select("*")
        .eq("session_id", sessionId!)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const linesQuery = useQuery({
    queryKey: linesKey,
    enabled: !!sessionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("live_talkback_lines")
        .select("*")
        .eq("session_id", sessionId!)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data || []).slice().reverse();
    },
  });

  const chatQuery = useQuery({
    queryKey: chatKey,
    enabled: !!sessionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("live_chat_messages")
        .select("*")
        .eq("session_id", sessionId!)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data || []).slice().reverse();
    },
  });

  const notesQuery = useQuery({
    queryKey: notesKey,
    enabled: !!sessionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("live_session_notes")
        .select("*")
        .eq("session_id", sessionId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const appendChat = useCallback(
    (message: LiveChatMessage) => {
      queryClient.setQueryData<LiveChatMessage[]>(chatKey, (current = []) => {
        if (current.some((row) => row.id === message.id)) return current;
        return [...current, message].slice(-400);
      });
    },
    [chatKey, queryClient],
  );

  const appendLine = useCallback(
    (line: LiveTalkbackLine) => {
      queryClient.setQueryData<LiveTalkbackLine[]>(linesKey, (current = []) => {
        if (current.some((row) => row.id === line.id)) return current;
        return [...current, line].slice(-400);
      });
    },
    [linesKey, queryClient],
  );

  useEffect(() => {
    if (!sessionId) return;
    const channel = supabase
      .channel(`live-mode-${sessionId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "live_sessions", filter: `id=eq.${sessionId}` },
        (payload) => {
          queryClient.setQueryData(sessionKey, payload.new as LiveSessionRow);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_talkback_channels", filter: `session_id=eq.${sessionId}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: channelsKey });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "live_talkback_lines", filter: `session_id=eq.${sessionId}` },
        (payload) => {
          appendLine(payload.new as LiveTalkbackLine);
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "live_talkback_lines", filter: `session_id=eq.${sessionId}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: linesKey });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "live_chat_messages", filter: `session_id=eq.${sessionId}` },
        (payload) => {
          appendChat(payload.new as LiveChatMessage);
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "live_chat_messages", filter: `session_id=eq.${sessionId}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: chatKey });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_session_notes", filter: `session_id=eq.${sessionId}` },
        (payload) => {
          if (payload.eventType === "DELETE") {
            queryClient.setQueryData(notesKey, null);
            return;
          }
          queryClient.setQueryData(notesKey, payload.new as LiveSessionNotes);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [appendChat, appendLine, channelsKey, chatKey, linesKey, notesKey, queryClient, sessionId, sessionKey]);

  const report = useCallback(
    (error: unknown, title: string) => {
      const message = error instanceof Error ? error.message : "Something went wrong.";
      toast({ title, description: message, variant: "destructive" });
    },
    [toast],
  );

  const patchSession = useCallback(
    (patch: Partial<LiveSessionRow>) => {
      queryClient.setQueryData<LiveSessionRow | null>(sessionKey, (current) =>
        current ? { ...current, ...patch } : current,
      );
    },
    [queryClient, sessionKey],
  );

  const claimListener = useCallback(
    async (station: LiveStation) => {
      if (!sessionId) return;
      const listener_heartbeat = new Date().toISOString();
      const patch = {
        listener_client_id: clientId,
        listener_station: station,
        listener_heartbeat,
      };
      patchSession(patch);
      const { error } = await supabase.from("live_sessions").update(patch).eq("id", sessionId);
      if (error) report(error, "Could not start listening");
    },
    [clientId, patchSession, report, sessionId],
  );

  const heartbeatListener = useCallback(async () => {
    if (!sessionId) return;
    const listener_heartbeat = new Date().toISOString();
    patchSession({ listener_heartbeat });
    await supabase
      .from("live_sessions")
      .update({ listener_heartbeat })
      .eq("id", sessionId)
      .eq("listener_client_id", clientId);
  }, [clientId, patchSession, sessionId]);

  const releaseListener = useCallback(async () => {
    if (!sessionId) return;
    patchSession({
      listener_client_id: null,
      listener_station: null,
      listener_heartbeat: null,
    });
    await supabase
      .from("live_sessions")
      .update({
        listener_client_id: null,
        listener_station: null,
        listener_heartbeat: null,
      })
      .eq("id", sessionId)
      .eq("listener_client_id", clientId);
  }, [clientId, patchSession, sessionId]);

  const setCurrentItem = useCallback(
    async (itemId: string | null) => {
      if (!sessionId) return;
      patchSession({ current_item_id: itemId });
      const { error } = await supabase
        .from("live_sessions")
        .update({ current_item_id: itemId })
        .eq("id", sessionId);
      if (error) report(error, "Could not cue that line");
    },
    [patchSession, report, sessionId],
  );

  const addLine = useCallback(
    async (channelId: string, raw: string) => {
      if (!sessionId) return;
      const transcript = sanitizeTalkbackTranscript(raw);
      if (!transcript) return;
      const at = Date.now();
      if (shouldDropRepeat(recentLines.current.get(channelId), transcript, at)) return;
      recentLines.current.set(channelId, { text: transcript, at });
      const { data, error } = await supabase
        .from("live_talkback_lines")
        .insert({ session_id: sessionId, channel_id: channelId, transcript })
        .select("*")
        .single();
      if (error) {
        report(error, "Could not share that caption");
        return;
      }
      if (data) appendLine(data);
    },
    [appendLine, report, sessionId],
  );

  const sendChatMessage = useCallback(
    async (raw: string) => {
      if (!sessionId || !user) return;
      const body = raw.trim().slice(0, 2000);
      if (!body) return;
      const { data, error } = await supabase
        .from("live_chat_messages")
        .insert({ session_id: sessionId, user_id: user.id, body })
        .select("*")
        .single();
      if (error) {
        report(error, "Could not send that message");
        return;
      }
      if (data) appendChat(data);
    },
    [appendChat, report, sessionId, user],
  );

  const clearLines = useCallback(async () => {
    if (!sessionId) return;
    const { error } = await supabase.from("live_talkback_lines").delete().eq("session_id", sessionId);
    if (error) {
      report(error, "Could not clear captions");
      return;
    }
    queryClient.setQueryData(linesKey, []);
  }, [linesKey, queryClient, report, sessionId]);

  const addChannel = useCallback(
    async (label: string) => {
      if (!sessionId) return;
      const trimmed = label.trim().slice(0, 80);
      if (!trimmed) return;
      const sortOrder = (channelsQuery.data || []).reduce(
        (max, channel) => Math.max(max, channel.sort_order),
        -1,
      ) + 1;
      const { error } = await supabase.from("live_talkback_channels").insert({
        session_id: sessionId,
        label: trimmed,
        sort_order: sortOrder,
      });
      if (error) report(error, "Could not add that position");
      else void queryClient.invalidateQueries({ queryKey: channelsKey });
    },
    [channelsKey, channelsQuery.data, queryClient, report, sessionId],
  );

  const renameChannel = useCallback(
    async (channelId: string, label: string) => {
      const trimmed = label.trim().slice(0, 80);
      if (!trimmed) return;
      const { error } = await supabase
        .from("live_talkback_channels")
        .update({ label: trimmed })
        .eq("id", channelId);
      if (error) report(error, "Could not rename that position");
      else void queryClient.invalidateQueries({ queryKey: channelsKey });
    },
    [channelsKey, queryClient, report],
  );

  const removeChannel = useCallback(
    async (channelId: string) => {
      const { error } = await supabase.from("live_talkback_channels").delete().eq("id", channelId);
      if (error) report(error, "Could not remove that position");
      else void queryClient.invalidateQueries({ queryKey: channelsKey });
    },
    [channelsKey, queryClient, report],
  );

  const saveNotes = useCallback(
    async (body: string) => {
      if (!sessionId || !user) return false;
      const { error } = await supabase.from("live_session_notes").upsert({
        session_id: sessionId,
        body: body.slice(0, 8000),
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      });
      if (error) {
        report(error, "Could not save notes");
        return false;
      }
      return true;
    },
    [report, sessionId, user],
  );

  return {
    clientId,
    session,
    channels: channelsQuery.data || [],
    lines: linesQuery.data || [],
    chatMessages: chatQuery.data || [],
    currentUserId: user?.id ?? null,
    notes: notesQuery.data ?? null,
    isLoading: sessionQuery.isLoading || (!!sessionId && channelsQuery.isLoading),
    accessDenied: isForbidden(sessionQuery.error),
    schemaMissing: isMissingLiveSchema(sessionQuery.error),
    claimListener,
    heartbeatListener,
    releaseListener,
    setCurrentItem,
    addLine,
    sendChatMessage,
    clearLines,
    addChannel,
    renameChannel,
    removeChannel,
    saveNotes,
  };
}
