import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserCampuses } from "@/hooks/useCampuses";
import { getChatMinistryTypesForResourceApp, normalizeChatMinistryType } from "@/lib/chat";
import { getCurrentResourceAppKey } from "@/lib/resourceApp";

interface UnreadCount {
  campusId: string;
  ministryType: string;
  count: number;
}

// Module-level so every hook instance (bottom-nav badge + Chat page) shares one
// "currently viewing" state, and a missing RPC (migration not applied yet) only
// costs one failed request per session before falling back to per-pair counts.
let viewingChat: { campusId: string; ministryType: string } | null = null;
let unreadCountsRpcMissing = false;
let unreadChannelSeq = 0;

export function useUnreadMessages(campInstanceId?: string | null) {
  const { user } = useAuth();
  const { data: userCampuses } = useUserCampuses(user?.id);
  const queryClient = useQueryClient();
  const resourceAppKey = getCurrentResourceAppKey();
  const chatMinistryTypes = getChatMinistryTypesForResourceApp(resourceAppKey);

  const campusIds = useMemo(
    () => (userCampuses || []).map((uc) => uc.campus_id),
    [userCampuses],
  );
  const campusIdsRef = useRef(campusIds);
  useEffect(() => {
    campusIdsRef.current = campusIds;
  }, [campusIds]);

  const queryKey = useMemo(
    () => ["unread-chat-counts", user?.id, resourceAppKey, campInstanceId ?? null],
    [user?.id, resourceAppKey, campInstanceId],
  );

  const knownMinistryValues = useMemo(
    () => new Set<string>(chatMinistryTypes.map((m) => m.value)),
    [chatMinistryTypes],
  );

  const fetchCountsFallback = useCallback(async (): Promise<UnreadCount[]> => {
    if (!user) return [];

    // Pre-RPC path: read statuses once, then one HEAD count per campus x ministry.
    let readStatusQuery = supabase
      .from("message_read_status")
      .select("campus_id, ministry_type, last_read_at")
      .eq("user_id", user.id)
      .eq("resource_app_key", resourceAppKey)
      .in("campus_id", campusIdsRef.current);

    readStatusQuery = campInstanceId
      ? readStatusQuery.eq("camp_instance_id", campInstanceId)
      : readStatusQuery.is("camp_instance_id", null);

    const { data: readStatuses } = await readStatusQuery;

    const readStatusMap: Record<string, string> = {};
    readStatuses?.forEach((rs) => {
      const key = `${rs.campus_id}:${normalizeChatMinistryType(rs.ministry_type)}`;
      readStatusMap[key] = rs.last_read_at;
    });

    const countPromises: Promise<UnreadCount>[] = [];
    for (const campusId of campusIdsRef.current) {
      for (const { value: ministryType } of chatMinistryTypes) {
        countPromises.push((async () => {
          const lastReadAt = readStatusMap[`${campusId}:${ministryType}`];

          // Match Chat page + RPC: no read cursor means no unread backlog.
          // Counting all history here is what inflated badges to "99+".
          if (!lastReadAt) {
            return { campusId, ministryType, count: 0 };
          }

          let query = supabase
            .from("chat_messages")
            .select("id", { count: "exact", head: true })
            .eq("campus_id", campusId)
            .eq("ministry_type", ministryType)
            .neq("user_id", user.id)
            .gt("created_at", lastReadAt);

          query = campInstanceId
            ? query.eq("camp_instance_id", campInstanceId)
            : query.eq("resource_app_key", resourceAppKey).is("camp_instance_id", null);

          const { count } = await query;
          return { campusId, ministryType, count: count || 0 };
        })());
      }
    }

    const results = await Promise.all(countPromises);
    return results.filter((r) => r.count > 0);
  }, [user, campInstanceId, resourceAppKey, chatMinistryTypes]);

  const query = useQuery({
    queryKey,
    enabled: !!user && campusIds.length > 0,
    staleTime: 15 * 1000,
    queryFn: async (): Promise<UnreadCount[]> => {
      if (!unreadCountsRpcMissing) {
        const { data, error } = await supabase.rpc("get_unread_chat_counts", {
          p_resource_app_key: resourceAppKey,
          p_camp_instance_id: campInstanceId || null,
        });

        if (!error) {
          return (data || [])
            .map((row) => ({
              campusId: row.campus_id,
              ministryType: normalizeChatMinistryType(row.ministry_type),
              count: Number(row.unread_count) || 0,
            }))
            .filter((uc) => uc.count > 0 && knownMinistryValues.has(uc.ministryType));
        }
        unreadCountsRpcMissing = true;
      }

      return fetchCountsFallback();
    },
  });

  const unreadCounts = useMemo(() => query.data ?? [], [query.data]);

  const removePairFromCache = useCallback(
    (campusId: string, ministryType: string) => {
      queryClient.setQueryData<UnreadCount[]>(queryKey, (prev) =>
        (prev ?? []).filter(
          (uc) => !(uc.campusId === campusId && uc.ministryType === ministryType),
        ),
      );
    },
    [queryClient, queryKey],
  );

  const markAsRead = useCallback(async (campusId: string, ministryType: string = "weekend") => {
    if (!user) return;

    const normalizedMinistryType = normalizeChatMinistryType(ministryType);

    const { error } = await supabase
      .from("message_read_status")
      .upsert(
        {
          user_id: user.id,
          campus_id: campusId,
          ministry_type: normalizedMinistryType,
          resource_app_key: resourceAppKey,
          camp_instance_id: campInstanceId || null,
          last_read_at: new Date().toISOString(),
        },
        {
          onConflict: "user_id,campus_id,ministry_type,resource_app_key,camp_instance_id",
        },
      );

    if (error) {
      console.error("Error marking messages as read:", error);
      return;
    }

    removePairFromCache(campusId, normalizedMinistryType);
  }, [campInstanceId, user, resourceAppKey, removePairFromCache]);

  // Set which campus+ministry is currently being viewed (shared across instances,
  // so the bottom-nav badge also stops counting the chat that's on screen).
  const setViewingChat = useCallback((campusId: string | null, ministryType: string | null) => {
    const normalizedMinistryType = ministryType ? normalizeChatMinistryType(ministryType) : null;
    viewingChat = campusId && normalizedMinistryType
      ? { campusId, ministryType: normalizedMinistryType }
      : null;
    if (campusId && normalizedMinistryType) {
      removePairFromCache(campusId, normalizedMinistryType);
    }
  }, [removePairFromCache]);

  // Subscribe to new messages for realtime updates. Each instance invalidates the
  // shared query (deduped by react-query) instead of keeping its own counter.
  useEffect(() => {
    if (!user || campusIds.length === 0) return;

    const channel = supabase
      .channel(`unread-messages-${++unreadChannelSeq}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
        },
        (payload) => {
          const newMessage = payload.new as {
            campus_id: string;
            ministry_type: string;
            resource_app_key: string;
            camp_instance_id?: string | null;
            user_id: string;
          };

          const msgMinistry = normalizeChatMinistryType(newMessage.ministry_type);

          // Only refresh if it's in the user's campuses, not their own message,
          // AND they're not currently viewing that campus+ministry.
          if (
            campusIdsRef.current.includes(newMessage.campus_id) &&
            (campInstanceId
              ? newMessage.camp_instance_id === campInstanceId
              : newMessage.resource_app_key === resourceAppKey && !newMessage.camp_instance_id) &&
            newMessage.user_id !== user.id &&
            !(viewingChat?.campusId === newMessage.campus_id &&
              viewingChat?.ministryType === msgMinistry)
          ) {
            queryClient.invalidateQueries({ queryKey });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [campInstanceId, user, campusIds.length, resourceAppKey, queryClient, queryKey]);

  const totalUnread = unreadCounts.reduce((sum, uc) => sum + uc.count, 0);

  const getUnreadForCampusMinistry = useCallback((campusId: string, ministryType: string) => {
    const normalizedMinistryType = normalizeChatMinistryType(ministryType);
    return unreadCounts.find(
      (uc) => uc.campusId === campusId && uc.ministryType === normalizedMinistryType,
    )?.count || 0;
  }, [unreadCounts]);

  return {
    unreadCounts,
    totalUnread,
    isLoading: query.isLoading,
    markAsRead,
    setViewingChat,
    getUnreadForCampusMinistry,
    refetch: async () => {
      await query.refetch();
    },
  };
}

// Hook to get the last read timestamp for a specific campus+ministry
export function useLastReadAt(
  campusId: string | null,
  ministryType: string | null = 'weekend',
  campInstanceId?: string | null,
) {
  const [lastReadAt, setLastReadAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();
  const resourceAppKey = getCurrentResourceAppKey();

  useEffect(() => {
    if (!user || !campusId || !ministryType) {
      setLastReadAt(null);
      setIsLoading(false);
      return;
    }

    const fetchLastRead = async () => {
      const normalizedMinistryType = normalizeChatMinistryType(ministryType);
      let query = supabase
        .from("message_read_status")
        .select("last_read_at")
        .eq("user_id", user.id)
        .eq("campus_id", campusId)
        .eq("ministry_type", normalizedMinistryType)
        .eq("resource_app_key", resourceAppKey);

      query = campInstanceId
        ? query.eq("camp_instance_id", campInstanceId)
        : query.is("camp_instance_id", null);

      const { data, error } = await query.maybeSingle();

      if (error) {
        console.error("Error fetching last read status:", error);
        setLastReadAt(null);
      } else {
        setLastReadAt(data?.last_read_at || null);
      }
      setIsLoading(false);
    };

    fetchLastRead();
  }, [campInstanceId, user, campusId, ministryType, resourceAppKey]);

  return { lastReadAt, isLoading };
}
