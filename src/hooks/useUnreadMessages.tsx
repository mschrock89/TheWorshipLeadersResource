import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserCampuses } from "@/hooks/useCampuses";

// Ministry types that have their own chats
const CHAT_MINISTRY_TYPES = ['weekend', 'encounter', 'evident', 'eon'] as const;

interface UnreadCount {
  campusId: string;
  ministryType: string;
  count: number;
}

interface LastReadStatus {
  campusId: string;
  ministryType: string;
  lastReadAt: string | null;
}

export function useUnreadMessages() {
  const [unreadCounts, setUnreadCounts] = useState<UnreadCount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();
  const { data: userCampuses } = useUserCampuses(user?.id);
  
  // Track which campus+ministry is currently being viewed
  const viewingChatRef = useRef<{ campusId: string; ministryType: string } | null>(null);

  const fetchUnreadCounts = useCallback(async () => {
    if (!user || !userCampuses?.length) {
      setUnreadCounts([]);
      setIsLoading(false);
      return;
    }

    const campusIds = userCampuses.map((uc) => uc.campus_id);
    
    // Get read status for all user's campuses and ministries
    const { data: readStatuses } = await supabase
      .from("message_read_status")
      .select("campus_id, ministry_type, last_read_at")
      .eq("user_id", user.id)
      .in("campus_id", campusIds);

    // Build a map of campus_id:ministry_type -> last_read_at
    const readStatusMap: Record<string, string> = {};
    readStatuses?.forEach((rs) => {
      const key = `${rs.campus_id}:${rs.ministry_type || 'weekend'}`;
      readStatusMap[key] = rs.last_read_at;
    });

    // Count unread messages for ALL campuses and ministry types in parallel
    const countPromises: Promise<UnreadCount>[] = [];
    
    for (const campusId of campusIds) {
      for (const ministryType of CHAT_MINISTRY_TYPES) {
        countPromises.push((async () => {
          const key = `${campusId}:${ministryType}`;
          const lastReadAt = readStatusMap[key];
          
          let query = supabase
            .from("chat_messages")
            .select("id", { count: "exact", head: true })
            .eq("campus_id", campusId)
            .eq("ministry_type", ministryType)
            .neq("user_id", user.id);
          
          if (lastReadAt) {
            query = query.gt("created_at", lastReadAt);
          }
          
          const { count } = await query;
          return { campusId, ministryType, count: count || 0 };
        })());
      }
    }

    const results = await Promise.all(countPromises);
    const counts = results.filter((r) => r.count > 0);
    
    setUnreadCounts(counts);
    setIsLoading(false);
  }, [user, userCampuses]);

  const markAsRead = useCallback(async (campusId: string, ministryType: string = 'weekend') => {
    if (!user) return;

    const { error } = await supabase
      .from("message_read_status")
      .upsert(
        {
          user_id: user.id,
          campus_id: campusId,
          ministry_type: ministryType,
          last_read_at: new Date().toISOString(),
        },
        {
          onConflict: "user_id,campus_id,ministry_type",
        }
      );

    if (error) {
      console.error("Error marking messages as read:", error);
      return;
    }

    // Update local state to remove this campus+ministry from unread counts
    setUnreadCounts((prev) => 
      prev.filter((uc) => !(uc.campusId === campusId && uc.ministryType === ministryType))
    );
  }, [user]);

  // Set which campus+ministry is currently being viewed
  const setViewingChat = useCallback((campusId: string | null, ministryType: string | null) => {
    viewingChatRef.current = campusId && ministryType 
      ? { campusId, ministryType } 
      : null;
    // If we're viewing a chat, immediately clear its unread count
    if (campusId && ministryType) {
      setUnreadCounts((prev) => 
        prev.filter((uc) => !(uc.campusId === campusId && uc.ministryType === ministryType))
      );
    }
  }, []);

  // Legacy: setViewingCampus for backwards compatibility (defaults to weekend)
  const setViewingCampus = useCallback((campusId: string | null) => {
    setViewingChat(campusId, campusId ? 'weekend' : null);
  }, [setViewingChat]);

  useEffect(() => {
    fetchUnreadCounts();
  }, [fetchUnreadCounts]);

  // Subscribe to new messages for realtime updates
  useEffect(() => {
    if (!user || !userCampuses?.length) return;

    const campusIds = userCampuses.map((uc) => uc.campus_id);
    
    const channel = supabase
      .channel("unread-messages")
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
            user_id: string;
          };
          
          const msgMinistry = newMessage.ministry_type || 'weekend';
          
          // Only count if it's in user's campuses, not their own message,
          // AND they're not currently viewing that campus+ministry
          if (
            campusIds.includes(newMessage.campus_id) &&
            newMessage.user_id !== user.id &&
            !(viewingChatRef.current?.campusId === newMessage.campus_id && 
              viewingChatRef.current?.ministryType === msgMinistry)
          ) {
            setUnreadCounts((prev) => {
              const existing = prev.find(
                (uc) => uc.campusId === newMessage.campus_id && uc.ministryType === msgMinistry
              );
              if (existing) {
                return prev.map((uc) =>
                  uc.campusId === newMessage.campus_id && uc.ministryType === msgMinistry
                    ? { ...uc, count: uc.count + 1 }
                    : uc
                );
              }
              return [...prev, { campusId: newMessage.campus_id, ministryType: msgMinistry, count: 1 }];
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, userCampuses]);

  // Get total unread count
  const totalUnread = unreadCounts.reduce((sum, uc) => sum + uc.count, 0);
  
  // Get unread count for a specific campus (all ministries combined)
  const getUnreadForCampus = useCallback((campusId: string) => {
    return unreadCounts
      .filter((uc) => uc.campusId === campusId)
      .reduce((sum, uc) => sum + uc.count, 0);
  }, [unreadCounts]);
  
  // Get unread count for a specific campus+ministry
  const getUnreadForCampusMinistry = useCallback((campusId: string, ministryType: string) => {
    return unreadCounts.find(
      (uc) => uc.campusId === campusId && uc.ministryType === ministryType
    )?.count || 0;
  }, [unreadCounts]);

  return {
    unreadCounts,
    totalUnread,
    isLoading,
    markAsRead,
    setViewingCampus,
    setViewingChat,
    getUnreadForCampus,
    getUnreadForCampusMinistry,
    refetch: fetchUnreadCounts,
  };
}

// Hook to get the last read timestamp for a specific campus+ministry
export function useLastReadAt(campusId: string | null, ministryType: string | null = 'weekend') {
  const [lastReadAt, setLastReadAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (!user || !campusId || !ministryType) {
      setLastReadAt(null);
      setIsLoading(false);
      return;
    }

    const fetchLastRead = async () => {
      const { data, error } = await supabase
        .from("message_read_status")
        .select("last_read_at")
        .eq("user_id", user.id)
        .eq("campus_id", campusId)
        .eq("ministry_type", ministryType)
        .maybeSingle();

      if (error) {
        console.error("Error fetching last read status:", error);
        setLastReadAt(null);
      } else {
        setLastReadAt(data?.last_read_at || null);
      }
      setIsLoading(false);
    };

    fetchLastRead();
  }, [user, campusId, ministryType]);

  return { lastReadAt, isLoading };
}
