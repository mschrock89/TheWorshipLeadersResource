import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { haptic } from "@/lib/haptics";
import { getCurrentResourceAppKey } from "@/lib/resourceApp";

interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

interface Reaction {
  id: string;
  user_id: string;
  reaction: string;
  profiles: Profile;
}

interface MessageReactionRow {
  id: string;
  user_id: string;
  reaction: string;
}

interface MessageRow {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  campus_id: string | null;
  ministry_type: string | null;
  resource_app_key: string | null;
  camp_instance_id: string | null;
  attachments: string[] | null;
  message_reactions: MessageReactionRow[] | null;
  /** Client-only marker for rows rendered before the server confirms them. */
  optimistic?: boolean;
}

export interface ChatMessage {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  campus_id: string | null;
  ministry_type: string | null;
  resource_app_key: string | null;
  camp_instance_id: string | null;
  attachments: string[] | null;
  profiles: Profile;
  message_reactions: Reaction[];
}

const PAGE_SIZE = 50;
const OPTIMISTIC_ID_PREFIX = "optimistic-";

type ChatCache = InfiniteData<MessageRow[], string | null>;

const makeOptimisticId = () =>
  `${OPTIMISTIC_ID_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2)}`;

const fallbackProfile = (id: string): Profile => ({ id, full_name: null, avatar_url: null });

// All basic profiles (names/avatars) via the SECURITY DEFINER function, cached and
// shared across chat mounts instead of re-downloaded on every message event.
// (Bypasses complex RLS so volunteers can see sender names.)
function useBasicProfiles() {
  return useQuery({
    queryKey: ["basic-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_basic_profiles");
      if (error) throw error;
      return (data || []) as Profile[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useChatMessages(
  campusId: string | null,
  ministryType: string | null = "weekend",
  campInstanceId?: string | null,
) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const resourceAppKey = getCurrentResourceAppKey();

  const enabled = !!campusId && !!ministryType;
  const queryKey = useMemo(
    () => ["chat-messages", campInstanceId ?? null, resourceAppKey, campusId, ministryType],
    [campInstanceId, resourceAppKey, campusId, ministryType],
  );

  // Pages are newest-first: page 0 holds the latest PAGE_SIZE messages, each next
  // page the PAGE_SIZE before it (cursor = created_at of the oldest loaded row).
  const messagesQuery = useInfiniteQuery({
    queryKey,
    enabled,
    staleTime: 30 * 1000,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      let query = supabase
        .from("chat_messages")
        .select(`
          *,
          message_reactions (
            id,
            user_id,
            reaction
          )
        `)
        .eq("campus_id", campusId!)
        .eq("ministry_type", ministryType!)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);

      query = campInstanceId
        ? query.eq("camp_instance_id", campInstanceId)
        : query.eq("resource_app_key", resourceAppKey).is("camp_instance_id", null);

      if (pageParam) query = query.lt("created_at", pageParam);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as MessageRow[];
    },
    getNextPageParam: (lastPage) =>
      lastPage.length === PAGE_SIZE ? lastPage[lastPage.length - 1].created_at : undefined,
  });

  useEffect(() => {
    if (!messagesQuery.isError) return;
    console.error("Error fetching messages:", messagesQuery.error);
    toast({
      title: "Error",
      description: "Failed to load messages",
      variant: "destructive",
    });
  }, [messagesQuery.isError, messagesQuery.error, toast]);

  // ---- Targeted cache updates (no full refetch per realtime event) ----

  const patchCache = useCallback(
    (updater: (pages: MessageRow[][]) => MessageRow[][]) => {
      queryClient.setQueryData<ChatCache>(queryKey, (old) =>
        old ? { ...old, pages: updater(old.pages) } : old,
      );
    },
    [queryClient, queryKey],
  );

  const prependMessage = useCallback(
    (row: MessageRow) => {
      patchCache((pages) => {
        if (pages.some((page) => page.some((m) => m.id === row.id))) return pages;
        const next = pages.length > 0 ? pages.map((page) => [...page]) : [[]];
        const firstPage = next[0];
        // A confirmed row replaces its own optimistic placeholder (our send racing
        // its realtime event); optimistic rows always append so rapid duplicate
        // sends don't swallow each other.
        const optimisticIndex = row.optimistic
          ? -1
          : firstPage.findIndex(
              (m) => m.optimistic && m.user_id === row.user_id && m.content === row.content,
            );
        if (optimisticIndex >= 0) firstPage[optimisticIndex] = row;
        else firstPage.unshift(row);
        return next;
      });
    },
    [patchCache],
  );

  const patchMessage = useCallback(
    (id: string, patch: (m: MessageRow) => MessageRow) => {
      patchCache((pages) => pages.map((page) => page.map((m) => (m.id === id ? patch(m) : m))));
    },
    [patchCache],
  );

  const removeMessage = useCallback(
    (id: string) => {
      patchCache((pages) => pages.map((page) => page.filter((m) => m.id !== id)));
    },
    [patchCache],
  );

  const addReaction = useCallback(
    (messageId: string, reaction: MessageReactionRow) => {
      patchMessage(messageId, (m) => {
        const existing = m.message_reactions ?? [];
        if (existing.some((r) => r.id === reaction.id)) return m;
        // A confirmed reaction replaces its own optimistic placeholder.
        const optimisticIndex = reaction.id.startsWith(OPTIMISTIC_ID_PREFIX)
          ? -1
          : existing.findIndex(
              (r) =>
                r.id.startsWith(OPTIMISTIC_ID_PREFIX) &&
                r.user_id === reaction.user_id &&
                r.reaction === reaction.reaction,
            );
        const nextReactions =
          optimisticIndex >= 0
            ? existing.map((r, i) => (i === optimisticIndex ? reaction : r))
            : [...existing, reaction];
        return { ...m, message_reactions: nextReactions };
      });
    },
    [patchMessage],
  );

  const removeReactionById = useCallback(
    (reactionId: string) => {
      patchCache((pages) =>
        pages.map((page) =>
          page.map((m) => {
            if (!m.message_reactions?.some((r) => r.id === reactionId)) return m;
            return {
              ...m,
              message_reactions: m.message_reactions.filter((r) => r.id !== reactionId),
            };
          }),
        ),
      );
    },
    [patchCache],
  );

  // ---- Display list: flatten pages (newest-first) into oldest-first with profiles ----

  const { data: profiles } = useBasicProfiles();
  const profileMap = useMemo(
    () => new Map((profiles || []).map((p) => [p.id, p])),
    [profiles],
  );
  const profileMapRef = useRef(profileMap);
  useEffect(() => {
    profileMapRef.current = profileMap;
  }, [profileMap]);

  const messages: ChatMessage[] = useMemo(() => {
    const pages = messagesQuery.data?.pages ?? [];
    const seen = new Set<string>();
    const rows: MessageRow[] = [];
    for (const page of pages) {
      for (const row of page) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        rows.push(row);
      }
    }
    rows.reverse();
    return rows.map((m) => ({
      ...m,
      profiles: profileMap.get(m.user_id) ?? fallbackProfile(m.user_id),
      message_reactions: (m.message_reactions ?? []).map((r) => ({
        ...r,
        profiles: profileMap.get(r.user_id) ?? fallbackProfile(r.user_id),
      })),
    }));
  }, [messagesQuery.data, profileMap]);

  // ---- Mutations (optimistic, with rollback on error) ----

  const sendMessage = async (content: string, attachments?: string[]) => {
    if (!user || !campusId || !ministryType) return;
    const trimmed = content.trim();
    if (!trimmed && (!attachments || attachments.length === 0)) return;

    haptic("light");

    const tempId = makeOptimisticId();
    prependMessage({
      id: tempId,
      user_id: user.id,
      content: trimmed,
      created_at: new Date().toISOString(),
      campus_id: campusId,
      ministry_type: ministryType,
      resource_app_key: resourceAppKey,
      camp_instance_id: campInstanceId || null,
      attachments: attachments && attachments.length > 0 ? attachments : null,
      message_reactions: [],
      optimistic: true,
    });

    const { data: insertedMessage, error } = await supabase
      .from("chat_messages")
      .insert({
        user_id: user.id,
        content: trimmed,
        campus_id: campusId,
        ministry_type: ministryType,
        resource_app_key: resourceAppKey,
        camp_instance_id: campInstanceId || null,
        attachments: attachments && attachments.length > 0 ? attachments : null,
      })
      .select("id, created_at")
      .single();

    if (error) {
      removeMessage(tempId);
      console.error("Error sending message:", error);
      toast({
        title: "Error",
        description: "Failed to send message",
        variant: "destructive",
      });
      return;
    }

    // Confirm the optimistic row (the realtime INSERT may have already replaced it).
    patchCache((pages) => {
      const hasReal = pages.some((page) => page.some((m) => m.id === insertedMessage.id));
      return pages.map((page) =>
        hasReal
          ? page.filter((m) => m.id !== tempId)
          : page.map((m) =>
              m.id === tempId
                ? { ...m, id: insertedMessage.id, created_at: insertedMessage.created_at, optimistic: false }
                : m,
            ),
      );
    });

    if (insertedMessage?.id) {
      try {
        // Invoke the chat notifier immediately from the sender's client.
        // The server-side trigger remains as a fallback if this call fails.
        await supabase.functions.invoke("notify-chat-message", {
          body: {
            messageId: insertedMessage.id,
            resourceAppKey,
            campInstanceId: campInstanceId || null,
          },
        });
      } catch (notificationError) {
        console.error("Failed to send chat notification:", notificationError);
      }
    }
  };

  const editMessage = async (messageId: string, newContent: string) => {
    if (!user || !newContent.trim()) return false;

    const snapshot = queryClient.getQueryData<ChatCache>(queryKey);
    patchMessage(messageId, (m) => ({ ...m, content: newContent.trim() }));

    let query = supabase
      .from("chat_messages")
      .update({ content: newContent.trim() })
      .eq("id", messageId)
      .eq("user_id", user.id);

    query = campInstanceId
      ? query.eq("camp_instance_id", campInstanceId)
      : query.eq("resource_app_key", resourceAppKey).is("camp_instance_id", null);

    const { error } = await query;

    if (error) {
      queryClient.setQueryData(queryKey, snapshot);
      console.error("Error editing message:", error);
      toast({
        title: "Error",
        description: "Failed to edit message",
        variant: "destructive",
      });
      return false;
    }
    return true;
  };

  const deleteMessage = async (messageId: string) => {
    if (!user) return false;

    const snapshot = queryClient.getQueryData<ChatCache>(queryKey);
    removeMessage(messageId);

    let query = supabase
      .from("chat_messages")
      .delete()
      .eq("id", messageId)
      .eq("user_id", user.id);

    query = campInstanceId
      ? query.eq("camp_instance_id", campInstanceId)
      : query.eq("resource_app_key", resourceAppKey).is("camp_instance_id", null);

    const { error } = await query;

    if (error) {
      queryClient.setQueryData(queryKey, snapshot);
      console.error("Error deleting message:", error);
      toast({
        title: "Error",
        description: "Failed to delete message",
        variant: "destructive",
      });
      return false;
    }
    return true;
  };

  const toggleReaction = async (messageId: string, emoji: string) => {
    if (!user) return;

    const existingReaction = messages
      .find((m) => m.id === messageId)
      ?.message_reactions.find((r) => r.user_id === user.id && r.reaction === emoji);

    if (existingReaction) {
      const snapshot = queryClient.getQueryData<ChatCache>(queryKey);
      removeReactionById(existingReaction.id);
      // An optimistic reaction hasn't reached the server yet; nothing to delete.
      if (existingReaction.id.startsWith(OPTIMISTIC_ID_PREFIX)) return;

      const { error } = await supabase
        .from("message_reactions")
        .delete()
        .eq("id", existingReaction.id);

      if (error) {
        queryClient.setQueryData(queryKey, snapshot);
        console.error("Error removing reaction:", error);
      }
      return;
    }

    const tempId = makeOptimisticId();
    addReaction(messageId, { id: tempId, user_id: user.id, reaction: emoji });

    const { data: insertedReaction, error } = await supabase
      .from("message_reactions")
      .insert({
        message_id: messageId,
        user_id: user.id,
        reaction: emoji,
      })
      .select("id")
      .single();

    if (error) {
      removeReactionById(tempId);
      console.error("Error adding reaction:", error);
      return;
    }

    // Confirm the optimistic reaction (the realtime INSERT may have already replaced it).
    patchMessage(messageId, (m) => {
      const reactions = m.message_reactions ?? [];
      const hasReal = reactions.some((r) => r.id === insertedReaction.id);
      return {
        ...m,
        message_reactions: hasReal
          ? reactions.filter((r) => r.id !== tempId)
          : reactions.map((r) => (r.id === tempId ? { ...r, id: insertedReaction.id } : r)),
      };
    });
  };

  // ---- Realtime: apply payloads directly to the cache ----

  const hasSubscribedRef = useRef(false);
  useEffect(() => {
    if (!enabled) return;
    hasSubscribedRef.current = false;

    const matchesScope = (row: {
      ministry_type?: string | null;
      resource_app_key?: string | null;
      camp_instance_id?: string | null;
    }) => {
      if (row.ministry_type !== ministryType) return false;
      return campInstanceId
        ? row.camp_instance_id === campInstanceId
        : row.resource_app_key === resourceAppKey && !row.camp_instance_id;
    };

    const channel = supabase
      .channel(`chat-messages-${campInstanceId || resourceAppKey}-${campusId}-${ministryType}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `campus_id=eq.${campusId}`, // Supabase can't AND filters; scope the rest client-side
        },
        (payload) => {
          const row = payload.new as MessageRow;
          if (!matchesScope(row)) return;
          if (row.user_id !== user?.id) haptic("light");
          prependMessage({ ...row, message_reactions: row.message_reactions ?? [] });
          // A sender we don't know yet (e.g. brand-new user): refresh the profile list.
          if (row.user_id && !profileMapRef.current.has(row.user_id)) {
            queryClient.invalidateQueries({ queryKey: ["basic-profiles"] });
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "chat_messages",
          filter: `campus_id=eq.${campusId}`,
        },
        (payload) => {
          const row = payload.new as MessageRow;
          if (!matchesScope(row)) return;
          patchMessage(row.id, (m) => ({ ...m, content: row.content, attachments: row.attachments }));
        },
      )
      .on(
        // DELETE payloads only carry the primary key (and column filters don't apply
        // to them), so just remove the id if we have it — a miss is a no-op.
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "chat_messages" },
        (payload) => {
          removeMessage((payload.old as { id: string }).id);
        },
      )
      .on(
        // Reactions can't be filtered server-side (the table has no campus column),
        // but patching is a no-op unless the message is in this chat's cache.
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "message_reactions" },
        (payload) => {
          const row = payload.new as {
            id: string;
            message_id: string;
            user_id: string;
            reaction: string;
          };
          addReaction(row.message_id, { id: row.id, user_id: row.user_id, reaction: row.reaction });
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "message_reactions" },
        (payload) => {
          removeReactionById((payload.old as { id: string }).id);
        },
      )
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        // Refetch after a reconnect to heal any events missed while offline.
        if (hasSubscribedRef.current) {
          queryClient.invalidateQueries({ queryKey });
        }
        hasSubscribedRef.current = true;
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [
    enabled,
    campInstanceId,
    campusId,
    ministryType,
    resourceAppKey,
    user?.id,
    queryClient,
    queryKey,
    prependMessage,
    patchMessage,
    removeMessage,
    addReaction,
    removeReactionById,
  ]);

  const loadOlder = useCallback(async () => {
    if (messagesQuery.hasNextPage && !messagesQuery.isFetchingNextPage) {
      await messagesQuery.fetchNextPage();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messagesQuery.hasNextPage, messagesQuery.isFetchingNextPage, messagesQuery.fetchNextPage]);

  return {
    messages,
    isLoading: messagesQuery.isLoading,
    isError: messagesQuery.isError,
    sendMessage,
    editMessage,
    deleteMessage,
    toggleReaction,
    refetch: async () => {
      await messagesQuery.refetch();
    },
    loadOlder,
    hasOlder: messagesQuery.hasNextPage ?? false,
    isLoadingOlder: messagesQuery.isFetchingNextPage,
    currentUserId: user?.id,
  };
}
