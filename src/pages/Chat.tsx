import { useEffect, useRef, useState, useMemo, useLayoutEffect, useCallback } from "react";
import { Navigate } from "react-router-dom";
import { Loader2, ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useChatMessages } from "@/hooks/useChatMessages";
import { useUserCampuses, useCampuses } from "@/hooks/useCampuses";
import { useUnreadMessages, useLastReadAt } from "@/hooks/useUnreadMessages";
import { useCampusSelectionOptional } from "@/components/layout/CampusSelectionContext";
import { useKeyboardOffset } from "@/hooks/useKeyboardOffset";
import { useProfile } from "@/hooks/useProfiles";

import { MessageBubble } from "@/components/chat/MessageBubble";
import { MessageInput } from "@/components/chat/MessageInput";
import { DateSeparator } from "@/components/chat/DateSeparator";
import { LastReadIndicator } from "@/components/chat/LastReadIndicator";
import { PullToRefresh, PullToRefreshRef } from "@/components/chat/PullToRefresh";
import { ChatErrorBoundary } from "@/components/chat/ChatErrorBoundary";
import { TypingIndicator, useTypingPresence } from "@/components/chat/TypingIndicator";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  getChatMinistryLabel,
  getChatMinistryTypesForResourceApp,
  getDefaultChatMinistryTypeForResourceApp,
  getUniqueNormalizedChatMinistries,
} from "@/lib/chat";
import { getCurrentResourceAppKey } from "@/lib/resourceApp";

// Hook to get ministries the user is assigned to at a specific campus
function useUserMinistriesForCampus(userId: string | undefined, campusId: string | null) {
  return useQuery({
    queryKey: ['user-ministries-for-campus', userId, campusId],
    queryFn: async () => {
      if (!userId || !campusId) return [];
      
      const { data, error } = await supabase
        .from('user_campus_ministry_positions')
        .select('ministry_type, position')
        .eq('user_id', userId)
        .eq('campus_id', campusId)
        .neq('position', 'drum_tech');
      
      if (error) throw error;
      return getUniqueNormalizedChatMinistries((data || []).map((row) => row.ministry_type));
    },
    enabled: !!userId && !!campusId,
    staleTime: 2 * 60 * 1000,
  });
}

function ChatContent() {
  const { user, isLoading: authLoading, isLeader, isAdmin } = useAuth();
  const { data: userCampuses, isLoading: campusesLoading } = useUserCampuses(user?.id);
  const { data: allCampuses, isLoading: allCampusesLoading } = useCampuses();

  const campusCtx = useCampusSelectionOptional();
  const [localCampusId, setLocalCampusId] = useState<string | null>(null);
  const resourceAppKey = getCurrentResourceAppKey();
  const chatMinistryTypes = useMemo(() => getChatMinistryTypesForResourceApp(resourceAppKey), [resourceAppKey]);
  const [selectedMinistryType, setSelectedMinistryType] = useState<string>(() =>
    getDefaultChatMinistryTypeForResourceApp(resourceAppKey)
  );

  const selectedCampusId = campusCtx?.selectedCampusId ?? localCampusId;
  const setSelectedCampusId = campusCtx?.setSelectedCampusId ?? setLocalCampusId;

  const { markAsRead, setViewingChat, getUnreadForCampusMinistry } = useUnreadMessages();
  const { lastReadAt } = useLastReadAt(selectedCampusId, selectedMinistryType);
  const { height: keyboardHeight, isOpen: isKeyboardOpen, visualHeight, offsetTop, translateY } = useKeyboardOffset();
  const { data: userProfile } = useProfile(user?.id);
  const prevKeyboardOpenRef = useRef(false);
  const [keyboardLayout, setKeyboardLayout] = useState<{ top: number; height: number } | null>(null);
  const [composerFocused, setComposerFocused] = useState(false);
  // Pin as soon as the field is focused — don't wait for visualViewport to catch up.
  const keyboardActive = isKeyboardOpen || composerFocused;
  
  // Get user's ministries for the selected campus
  const { data: userMinistries, isLoading: ministriesLoading } = useUserMinistriesForCampus(
    user?.id, 
    selectedCampusId
  );
  
  
  // Fetch messages for the selected campus + ministry
  const {
    messages,
    isLoading,
    isError,
    sendMessage,
    editMessage,
    deleteMessage,
    toggleReaction,
    refetch,
    loadOlder,
    hasOlder,
    currentUserId,
  } = useChatMessages(selectedCampusId, selectedMinistryType);
  const lastMessageRef = useRef<HTMLDivElement>(null);
  const lastReadRef = useRef<HTMLDivElement>(null);
  const pullToRefreshRef = useRef<PullToRefreshRef>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const hasInitiallyScrolled = useRef(false);
  const isAtBottomRef = useRef(true);
  // True while the user is actively touching/scrolling the thread. Auto-pin must
  // stand down during this window — on iOS the Safari toolbar toggles as you drag
  // up to read history, which resizes the container and would otherwise snap the
  // user back to the newest message.
  const interactingRef = useRef(false);
  const newestMessageIdRef = useRef<string | null>(null);
  const [hasScrolledToLastRead, setHasScrolledToLastRead] = useState(false);
  const [hasClickedJumpToLastRead, setHasClickedJumpToLastRead] = useState(false);
  const lastSeenUnreadIndexRef = useRef<number>(-1);
  
  // Typing presence (one channel tracks our typing state and reads everyone else's)
  const { setTyping, typingUsers } = useTypingPresence(selectedCampusId, selectedMinistryType, userProfile?.full_name ?? null);

  // Determine if we're still loading campuses data
  const isCampusDataLoading = isLeader ? allCampusesLoading : campusesLoading;

  // Admins see all campuses, others see only their assigned campuses
  const availableCampuses = useMemo(
    () => isLeader && allCampuses
      ? allCampuses.map(c => ({ campus_id: c.id, campuses: c }))
      : userCampuses || [],
    [allCampuses, isLeader, userCampuses],
  );

  const selectedCampus = useMemo(
    () => availableCampuses.find(uc => uc.campus_id === selectedCampusId),
    [availableCampuses, selectedCampusId]
  );

  // Get the selected campus name for filtering
  const selectedCampusName = selectedCampus?.campuses?.name || '';
  const isMurfreesboroCentral = selectedCampusName.toLowerCase().includes('murfreesboro central');
  
  // Admins/leaders see all ministries, others see only their assigned ministries
  // Evident chat is only available for Murfreesboro Central
  const availableMinistries = useMemo(() => {
    let ministries = chatMinistryTypes.filter(m => {
      // Evident is only for Murfreesboro Central
      if (m.value === 'evident' && !isMurfreesboroCentral) {
        return false;
      }
      return true;
    });
    
    // Non-admin/leader users also filter by their assigned ministries
    if (!isAdmin && !isLeader) {
      ministries = ministries.filter(m => userMinistries?.includes(m.value));
    }
    
    return ministries;
  }, [chatMinistryTypes, isAdmin, isLeader, userMinistries, isMurfreesboroCentral]);

  // Find the index of the first unread message and count total unread
  const { firstUnreadIndex, unreadCount } = useMemo(() => {
    if (!lastReadAt || messages.length === 0) return { firstUnreadIndex: -1, unreadCount: 0 };
    
    const index = messages.findIndex((msg) => {
      const msgTime = new Date(msg.created_at).getTime();
      const lastReadTime = new Date(lastReadAt).getTime();
      return msgTime > lastReadTime && msg.user_id !== currentUserId;
    });
    
    const count = index >= 0 
      ? messages.slice(index).filter(msg => msg.user_id !== currentUserId).length
      : 0;
    
    return { firstUnreadIndex: index, unreadCount: count };
  }, [messages, lastReadAt, currentUserId]);

  // Set default campus when campuses load
  useEffect(() => {
    if (campusCtx) return;
    if (availableCampuses.length > 0 && !localCampusId) {
      setLocalCampusId(availableCampuses[0].campus_id);
    }
  }, [campusCtx, availableCampuses, localCampusId]);

  // Auto-select first available ministry when they load or campus changes
  useEffect(() => {
    if (!ministriesLoading && availableMinistries.length > 0) {
      // If current selection is not available, switch to first available
      if (!availableMinistries.some(m => m.value === selectedMinistryType)) {
        setSelectedMinistryType(availableMinistries[0].value);
      }
    }
  }, [availableMinistries, selectedMinistryType, ministriesLoading]);

  // Reset scroll state when switching campuses or ministries
  useEffect(() => {
    hasInitiallyScrolled.current = false;
    isAtBottomRef.current = true;
    newestMessageIdRef.current = null;
    lastSeenUnreadIndexRef.current = -1;
    setShowScrollButton(false);
    setHasScrolledToLastRead(false);
    setHasClickedJumpToLastRead(false);
    setNewMessageCount(0);
    
    // Tell the unread messages hook we're viewing this campus+ministry
    setViewingChat(selectedCampusId, selectedMinistryType);
    
    // Immediately clear the unread badge
    if (selectedCampusId && selectedMinistryType) {
      markAsRead(selectedCampusId, selectedMinistryType);
    }
    
    return () => {
      setViewingChat(null, null);
    };
  }, [selectedCampusId, selectedMinistryType, setViewingChat, markAsRead]);

  // Mark messages as read when viewing the chat (delayed)
  useEffect(() => {
    if (selectedCampusId && selectedMinistryType && !isLoading && hasScrolledToLastRead) {
      const timeout = setTimeout(() => {
        markAsRead(selectedCampusId, selectedMinistryType);
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [selectedCampusId, selectedMinistryType, isLoading, markAsRead, hasScrolledToLastRead]);

  // Hard-pin to the absolute bottom of the latest message. Used whenever we
  // intend to stay glued to newest content (send, keyboard, layout resize).
  const pinToLatestMessage = useCallback((behavior: ScrollBehavior = "auto") => {
    const run = () => {
      const scrollElement = document.querySelector(
        "[data-pull-to-refresh-container]",
      ) as HTMLDivElement | null;
      if (!scrollElement) return;

      if (behavior === "smooth") {
        scrollElement.scrollTo({ top: scrollElement.scrollHeight, behavior: "smooth" });
      } else {
        // Direct assignment is more reliable than scrollTo("auto") on iOS.
        scrollElement.scrollTop = scrollElement.scrollHeight;
      }

      lastMessageRef.current?.scrollIntoView({
        behavior,
        block: "end",
        inline: "nearest",
      });

      if (behavior !== "smooth") {
        scrollElement.scrollTop = scrollElement.scrollHeight;
      }

      isAtBottomRef.current = true;
      setShowScrollButton(false);
      setNewMessageCount(0);
    };

    run();
    requestAnimationFrame(run);
  }, []);

  const scrollToLastRead = useCallback(() => {
    setHasClickedJumpToLastRead(true);
    lastSeenUnreadIndexRef.current = firstUnreadIndex;
    setTimeout(() => {
      if (lastReadRef.current) {
        lastReadRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 50);
  }, [firstUnreadIndex]);

  // Scroll to bottom on initial load and whenever new messages arrive while pinned.
  useLayoutEffect(() => {
    if (isLoading) return;
    if (messages.length === 0) return;

    const isFirstScroll = !hasInitiallyScrolled.current;
    const retryTimers: number[] = [];

    if (isFirstScroll) {
      const scheduleRetries = () => {
        requestAnimationFrame(() => {
          pinToLatestMessage("auto");
          retryTimers.push(window.setTimeout(() => pinToLatestMessage("auto"), 50));
          retryTimers.push(window.setTimeout(() => pinToLatestMessage("auto"), 150));
          retryTimers.push(
            window.setTimeout(() => {
              pinToLatestMessage("auto");
              setHasScrolledToLastRead(true);
            }, 300),
          );
        });
      };

      scheduleRetries();
      hasInitiallyScrolled.current = true;

      return () => {
        retryTimers.forEach((timer) => window.clearTimeout(timer));
      };
    }

    if (isAtBottomRef.current) {
      pinToLatestMessage("auto");
    }
  }, [messages, isLoading, pinToLatestMessage]);

  // Keep glued to the latest message when images/media expand the thread — but
  // only when the user is genuinely parked at the bottom and not mid-gesture.
  useEffect(() => {
    const scrollElement = document.querySelector(
      "[data-pull-to-refresh-container]",
    ) as HTMLDivElement | null;
    if (!scrollElement) return;

    // Track active touch/scroll so a toolbar-driven resize during a drag can't
    // trigger an auto-pin. Hold the flag briefly past touchend to cover momentum.
    let releaseTimer = 0;
    const beginInteract = () => {
      window.clearTimeout(releaseTimer);
      interactingRef.current = true;
    };
    const endInteract = () => {
      window.clearTimeout(releaseTimer);
      releaseTimer = window.setTimeout(() => {
        interactingRef.current = false;
      }, 350);
    };
    const onWheel = () => {
      beginInteract();
      endInteract();
    };

    scrollElement.addEventListener("touchstart", beginInteract, { passive: true });
    scrollElement.addEventListener("touchmove", beginInteract, { passive: true });
    scrollElement.addEventListener("touchend", endInteract, { passive: true });
    scrollElement.addEventListener("touchcancel", endInteract, { passive: true });
    scrollElement.addEventListener("wheel", onWheel, { passive: true });

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => {
        if (interactingRef.current || !isAtBottomRef.current) return;
        // Re-verify against the live DOM; a stale "at bottom" ref must not win.
        const atBottom =
          scrollElement.scrollHeight -
            scrollElement.scrollTop -
            scrollElement.clientHeight <
          30;
        if (atBottom) pinToLatestMessage("auto");
      });

      observer.observe(scrollElement);
      const content = scrollElement.firstElementChild;
      if (content) observer.observe(content);
    }

    return () => {
      scrollElement.removeEventListener("touchstart", beginInteract);
      scrollElement.removeEventListener("touchmove", beginInteract);
      scrollElement.removeEventListener("touchend", endInteract);
      scrollElement.removeEventListener("touchcancel", endInteract);
      scrollElement.removeEventListener("wheel", onWheel);
      window.clearTimeout(releaseTimer);
      observer?.disconnect();
    };
  }, [pinToLatestMessage, selectedCampusId, selectedMinistryType]);

  // Track scroll position
  const handleScrollChange = useCallback((isAtBottom: boolean) => {
    isAtBottomRef.current = isAtBottom;
    setShowScrollButton(!isAtBottom);
    if (isAtBottom) setNewMessageCount(0);
  }, []);

  // Track new messages arriving while scrolled up. Watch the NEWEST message id
  // rather than the list length, so loading older history (which prepends) never
  // counts toward the badge.
  useEffect(() => {
    if (!hasInitiallyScrolled.current || isLoading) return;

    const newest = messages[messages.length - 1];
    const previousNewestId = newestMessageIdRef.current;

    if (
      newest &&
      previousNewestId &&
      newest.id !== previousNewestId &&
      newest.user_id !== currentUserId &&
      !isAtBottomRef.current
    ) {
      setNewMessageCount(prev => prev + 1);
    }

    newestMessageIdRef.current = newest?.id ?? null;
  }, [messages, isLoading, currentUserId]);

  // Pull-to-refresh loads the previous page of history; keep the viewport anchored
  // on the same message while the older page prepends above it.
  const handleLoadOlder = useCallback(async () => {
    if (!hasOlder) {
      await refetch();
      return;
    }

    const container = document.querySelector('[data-pull-to-refresh-container]') as HTMLDivElement | null;
    const prevScrollHeight = container?.scrollHeight ?? 0;
    const prevScrollTop = container?.scrollTop ?? 0;

    await loadOlder();

    requestAnimationFrame(() => {
      const el = document.querySelector('[data-pull-to-refresh-container]') as HTMLDivElement | null;
      if (el) el.scrollTop = prevScrollTop + (el.scrollHeight - prevScrollHeight);
    });
  }, [hasOlder, loadOlder, refetch]);

  // Send optimistically appends the message; jump to it on the next frame.
  const handleSendMessage = useCallback((content: string, attachments?: string[]) => {
    void sendMessage(content, attachments);
    requestAnimationFrame(() => pinToLatestMessage("auto"));
  }, [sendMessage, pinToLatestMessage]);

  const handleComposerFocusChange = useCallback((focused: boolean) => {
    setComposerFocused(focused);
    if (focused) {
      isAtBottomRef.current = true;
      window.scrollTo(0, 0);
    }
  }, []);

  // When the keyboard / focus activates, keep the latest message flush to the bottom.
  useEffect(() => {
    if (keyboardActive && !prevKeyboardOpenRef.current) {
      isAtBottomRef.current = true;
      requestAnimationFrame(() => pinToLatestMessage("auto"));
    }
    prevKeyboardOpenRef.current = keyboardActive;
  }, [keyboardActive, pinToLatestMessage]);

  // Re-pin after keyboard shell top/bottom settle (height changes mid-open).
  useEffect(() => {
    if (!keyboardActive || !keyboardLayout || !isAtBottomRef.current) return;
    pinToLatestMessage("auto");
    const timer = window.setTimeout(() => pinToLatestMessage("auto"), 50);
    return () => window.clearTimeout(timer);
  }, [keyboardActive, keyboardLayout, pinToLatestMessage]);

  // Pin the chat shell to the visible visual viewport while focused / keyboard
  // open. Use top+height (not bottom) — iOS fixed `bottom` overshoots and leaves
  // the black gap above the keyboard. Never subtract the header from visualHeight
  // again; measure the visible band under the header instead.
  useLayoutEffect(() => {
    const updateKeyboardLayout = () => {
      const viewport = window.visualViewport;
      if (!keyboardActive || !viewport) {
        setKeyboardLayout(null);
        return;
      }

      const visualTop = viewport.offsetTop;
      const visualBottom = viewport.offsetTop + viewport.height;
      const header = document.querySelector("header");
      const headerBottom = header?.getBoundingClientRect().bottom ?? visualTop;
      const top = Math.round(Math.max(visualTop, headerBottom));
      const height = Math.round(Math.max(0, visualBottom - top));

      setKeyboardLayout((prev) =>
        prev && prev.top === top && prev.height === height ? prev : { top, height }
      );
    };

    updateKeyboardLayout();

    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", updateKeyboardLayout);
    viewport?.addEventListener("scroll", updateKeyboardLayout);
    window.addEventListener("resize", updateKeyboardLayout);

    let rafId = 0;
    let frames = 0;
    let cancelled = false;
    if (composerFocused) {
      const tick = () => {
        if (cancelled) return;
        updateKeyboardLayout();
        if (isAtBottomRef.current) pinToLatestMessage("auto");
        frames += 1;
        if (frames < 45) {
          rafId = requestAnimationFrame(tick);
        }
      };
      rafId = requestAnimationFrame(tick);
    }

    return () => {
      cancelled = true;
      viewport?.removeEventListener("resize", updateKeyboardLayout);
      viewport?.removeEventListener("scroll", updateKeyboardLayout);
      window.removeEventListener("resize", updateKeyboardLayout);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [keyboardActive, composerFocused, visualHeight, offsetTop, pinToLatestMessage]);

  // ProtectedLayout now gives the chat route a fixed, viewport-filling frame, so
  // the shell can simply fill it. Because that frame never document-scrolls, the
  // composer stays pinned to the bottom. Keyboard-open state is handled below.
  const closedChatHeight = "100%";
  const isKeyboardPinned = keyboardActive && keyboardLayout != null && keyboardLayout.height > 0;

  if (authLoading || isCampusDataLoading) {
    return (
      <div
        className="flex items-center justify-center bg-black"
        style={{ height: closedChatHeight }}
      >
        <Loader2 className="h-8 w-8 animate-spin text-white" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // User has no campuses assigned (and is not an admin)
  if (!isLeader && (!userCampuses || userCampuses.length === 0)) {
    return (
      <div
        className="flex max-w-full flex-col overflow-hidden bg-black"
        style={{ height: closedChatHeight }}
      >
        <div className="flex flex-col items-center justify-center flex-1 text-zinc-500 px-4 text-center">
          <p className="text-lg font-medium">No campus assigned</p>
          <p className="text-sm">Contact a leader to be assigned to a campus to join the chat.</p>
        </div>
      </div>
    );
  }

  // Group messages by date / sender / time window (GroupMe-style clustering)
  const MESSAGE_GROUP_WINDOW_MS = 3 * 60 * 1000;
  const getDateKey = (dateString: string) => format(new Date(dateString), "yyyy-MM-dd");

  const shouldShowHeader = (index: number) => {
    if (index === 0) return true;
    const currentMessage = messages[index];
    const previousMessage = messages[index - 1];
    if (currentMessage.user_id !== previousMessage.user_id) return true;
    const currentDate = getDateKey(currentMessage.created_at);
    const previousDate = getDateKey(previousMessage.created_at);
    if (currentDate !== previousDate) return true;
    const gap =
      new Date(currentMessage.created_at).getTime() -
      new Date(previousMessage.created_at).getTime();
    return gap > MESSAGE_GROUP_WINDOW_MS;
  };

  const shouldShowDateSeparator = (index: number) => {
    if (index === 0) return true;
    const currentDate = getDateKey(messages[index].created_at);
    const previousDate = getDateKey(messages[index - 1].created_at);
    return currentDate !== previousDate;
  };

  // Get the display name for the chat (campus name + ministry)
  const getChatDisplayName = () => {
    const campusName = selectedCampus?.campuses?.name || 'Chat';
    const ministryLabel = getChatMinistryLabel(selectedMinistryType);
    return `${campusName} ${ministryLabel}`.trim();
  };

  return (
    <>
      {/* Keep document flow height while the shell is fixed over the keyboard. */}
      {isKeyboardPinned && <div style={{ height: closedChatHeight }} aria-hidden />}
      <div
        className={`flex flex-col overflow-hidden max-w-full ${isKeyboardPinned ? "bg-[#191A1C]" : "bg-black"}`}
        style={
          isKeyboardPinned
            ? {
                position: "fixed",
                left: 0,
                right: 0,
                top: keyboardLayout.top,
                height: keyboardLayout.height,
                zIndex: 45,
              }
            : {
                height: closedChatHeight,
                transform:
                  !keyboardActive && translateY > 0
                    ? `translateY(${translateY}px)`
                    : undefined,
              }
        }
      >
      {/* Chat Header with Ministry Tabs */}
      <ChatHeader
        campuses={availableCampuses}
        selectedCampusId={selectedCampusId}
        selectedCampusName={getChatDisplayName()}
        onSelectCampus={setSelectedCampusId}
        canSwitchCampus={availableCampuses.length > 1}
        ministries={availableMinistries}
        selectedMinistryType={selectedMinistryType}
        onSelectMinistry={setSelectedMinistryType}
        getUnreadCount={getUnreadForCampusMinistry}
      />

      {/* Messages area */}
      <div className="relative flex-1 min-h-0 overflow-hidden bg-black">
        <PullToRefresh
          ref={pullToRefreshRef}
          onRefresh={handleLoadOlder}
          className="h-full"
          onScrollChange={handleScrollChange}
        >
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-white" />
            </div>
          ) : isError && messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-zinc-500">
              <p className="text-lg font-medium">Couldn't load messages</p>
              <p className="text-sm">Check your connection and try again.</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                className="mt-4 border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800 hover:text-white"
              >
                Try again
              </Button>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-zinc-500">
              <p className="text-lg font-medium">No messages yet</p>
              <p className="text-sm">Start the conversation!</p>
            </div>
          ) : (
            <div className="pb-3">
              {/* Full history is always available — older pages load on pull-to-refresh */}
              <div className="py-2 text-center text-xs text-zinc-600">
                {hasOlder
                  ? "Pull down to load earlier messages"
                  : "This is the beginning of the conversation"}
              </div>
              {messages.map((message, index) => (
                <div
                  key={message.id}
                  ref={index === messages.length - 1 ? lastMessageRef : null}
                >
                  {shouldShowDateSeparator(index) && (
                    <DateSeparator date={message.created_at} />
                  )}
                  {index === firstUnreadIndex && (
                    <LastReadIndicator ref={lastReadRef} />
                  )}
                  <MessageBubble
                    message={message}
                    isOwnMessage={message.user_id === currentUserId}
                    onToggleReaction={toggleReaction}
                    onEditMessage={editMessage}
                    onDeleteMessage={deleteMessage}
                    currentUserId={currentUserId}
                    showHeader={shouldShowHeader(index)}
                  />
                </div>
              ))}
            </div>
          )}
        </PullToRefresh>
        
        {/* Floating "Jump to last read" button */}
        {firstUnreadIndex > 0 && 
         hasScrolledToLastRead && 
         (!hasClickedJumpToLastRead || firstUnreadIndex !== lastSeenUnreadIndexRef.current) && (
          <button
            onClick={scrollToLastRead}
            className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-all animate-in fade-in slide-in-from-top-2 duration-200 z-10"
          >
            <ArrowUp className="h-4 w-4" />
            <span className="text-sm font-medium">Jump to last read</span>
            {unreadCount > 0 && (
              <span className="flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-white/20 text-xs font-bold">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>
        )}
        
        {/* Scroll to bottom — sits in the message pane so it never overlaps the composer */}
        {showScrollButton && messages.length > 0 && (
          <button
            onClick={() => pinToLatestMessage("smooth")}
            className="absolute bottom-3 right-3 flex items-center gap-2 rounded-full bg-zinc-800 border border-zinc-700 shadow-lg hover:bg-zinc-700 transition-colors px-3 py-2 z-10"
          >
            {newMessageCount > 0 && (
              <span className="flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-xs font-bold animate-in fade-in zoom-in duration-200">
                {newMessageCount > 99 ? "99+" : newMessageCount}
              </span>
            )}
            <ArrowDown className="h-5 w-5 text-zinc-300" />
          </button>
        )}
      </div>

      {/* Typing + composer — typing sits above input, outside the scroll pane */}
      <div className="flex-shrink-0 relative z-10">
        {!keyboardActive && (
          <div className="absolute -top-6 left-0 right-0 h-6 bg-gradient-to-t from-[#191A1C] to-transparent pointer-events-none" />
        )}
        <TypingIndicator typingUsers={typingUsers} />
        <div className={`bg-[#191A1C] ${keyboardActive ? '' : 'backdrop-blur-md border-t border-zinc-800/50'}`}>
          <MessageInput
            onSendMessage={handleSendMessage}
            onTyping={setTyping}
            onFocusChange={handleComposerFocusChange}
            campusName={getChatDisplayName()}
            campusId={selectedCampusId}
            ministryType={selectedMinistryType}
          />
        </div>
      </div>
    </div>
    </>
  );
}

export default function Chat() {
  return (
    <ChatErrorBoundary>
      <ChatContent />
    </ChatErrorBoundary>
  );
}
