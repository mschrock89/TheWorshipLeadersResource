import { useEffect, useRef, useState, useMemo, useLayoutEffect, useCallback } from "react";
import { Navigate } from "react-router-dom";
import { Loader2, ArrowDown, ArrowUp } from "lucide-react";
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

// Ministry types that have their own chats
const CHAT_MINISTRY_TYPES = [
  { value: 'weekend', label: 'Weekend' },
  { value: 'encounter', label: 'Encounter' },
  { value: 'evident', label: 'Evident' },
  { value: 'eon', label: 'EON' },
  { value: 'production', label: 'Production' },
  { value: 'video', label: 'Video' },
] as const;

// Hook to get ministries the user is assigned to at a specific campus
function useUserMinistriesForCampus(userId: string | undefined, campusId: string | null) {
  return useQuery({
    queryKey: ['user-ministries-for-campus', userId, campusId],
    queryFn: async () => {
      if (!userId || !campusId) return [];
      
      const { data, error } = await supabase
        .from('user_ministry_campuses')
        .select('ministry_type')
        .eq('user_id', userId)
        .eq('campus_id', campusId);
      
      if (error) throw error;
      return data?.map(d => d.ministry_type) || [];
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
  const [selectedMinistryType, setSelectedMinistryType] = useState<string>('weekend');

  const selectedCampusId = campusCtx?.selectedCampusId ?? localCampusId;
  const setSelectedCampusId = campusCtx?.setSelectedCampusId ?? setLocalCampusId;

  const { markAsRead, setViewingChat, getUnreadForCampusMinistry } = useUnreadMessages();
  const { lastReadAt } = useLastReadAt(selectedCampusId, selectedMinistryType);
  const keyboardHeight = useKeyboardOffset();
  const { data: userProfile } = useProfile(user?.id);
  
  // Get user's ministries for the selected campus
  const { data: userMinistries, isLoading: ministriesLoading } = useUserMinistriesForCampus(
    user?.id, 
    selectedCampusId
  );
  
  
  // Fetch messages for the selected campus + ministry
  const {
    messages,
    isLoading,
    sendMessage,
    editMessage,
    deleteMessage,
    toggleReaction,
    refetch,
    currentUserId,
  } = useChatMessages(selectedCampusId, selectedMinistryType);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastReadRef = useRef<HTMLDivElement>(null);
  const pullToRefreshRef = useRef<PullToRefreshRef>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const hasInitiallyScrolled = useRef(false);
  const isAtBottomRef = useRef(true);
  const previousMessageCountRef = useRef(0);
  const [hasScrolledToLastRead, setHasScrolledToLastRead] = useState(false);
  const [hasClickedJumpToLastRead, setHasClickedJumpToLastRead] = useState(false);
  const lastSeenUnreadIndexRef = useRef<number>(-1);
  
  // Typing presence
  const { setTyping } = useTypingPresence(selectedCampusId, userProfile?.full_name ?? null);

  // Determine if we're still loading campuses data
  const isCampusDataLoading = isLeader ? allCampusesLoading : campusesLoading;

  // Admins see all campuses, others see only their assigned campuses
  const availableCampuses = isLeader && allCampuses 
    ? allCampuses.map(c => ({ campus_id: c.id, campuses: c }))
    : userCampuses || [];

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
    let ministries = CHAT_MINISTRY_TYPES.filter(m => {
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
  }, [isAdmin, isLeader, userMinistries, isMurfreesboroCentral]);

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
    previousMessageCountRef.current = 0;
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

  // Check if scroll container is at bottom
  const isScrolledToBottom = useCallback((threshold = 30): boolean => {
    const scrollElement = document.querySelector('[data-pull-to-refresh-container]');
    if (!scrollElement) return false;
    const { scrollTop, scrollHeight, clientHeight } = scrollElement;
    return scrollHeight - scrollTop - clientHeight <= threshold;
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior) => {
    pullToRefreshRef.current?.scrollToBottom(behavior);
    messagesEndRef.current?.scrollIntoView({ behavior, block: "end" });
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

  // Scroll to bottom on initial load
  useLayoutEffect(() => {
    if (isLoading) return;
    if (messages.length === 0) return;

    const isFirstScroll = !hasInitiallyScrolled.current;
    const retryTimers: number[] = [];

    if (isFirstScroll) {
      const attemptScroll = () => scrollToBottom("auto");

      const scheduleRetries = () => {
        requestAnimationFrame(() => {
          attemptScroll();
          retryTimers.push(window.setTimeout(() => {
            if (!isScrolledToBottom()) attemptScroll();
          }, 50));
          retryTimers.push(window.setTimeout(() => {
            if (!isScrolledToBottom()) attemptScroll();
          }, 150));
          retryTimers.push(window.setTimeout(() => {
            attemptScroll();
            setHasScrolledToLastRead(true);
          }, 300));
        });
      };

      scheduleRetries();
      hasInitiallyScrolled.current = true;

      return () => {
        retryTimers.forEach(timer => window.clearTimeout(timer));
      };
    }

    if (isAtBottomRef.current) {
      scrollToBottom("smooth");
    }
  }, [messages, isLoading, scrollToBottom, isScrolledToBottom]);

  // Track scroll position
  const handleScrollChange = useCallback((isAtBottom: boolean) => {
    isAtBottomRef.current = isAtBottom;
    setShowScrollButton(!isAtBottom);
    if (isAtBottom) setNewMessageCount(0);
  }, []);

  // Track new messages arriving while scrolled up
  useEffect(() => {
    if (!hasInitiallyScrolled.current || isLoading) return;
    
    const currentCount = messages.length;
    const previousCount = previousMessageCountRef.current;
    
    if (previousCount > 0 && currentCount > previousCount && !isAtBottomRef.current) {
      const newMessages = currentCount - previousCount;
      setNewMessageCount(prev => prev + newMessages);
    }
    
    previousMessageCountRef.current = currentCount;
  }, [messages.length, isLoading]);

  if (authLoading || isCampusDataLoading) {
    return (
      <div className="flex h-[calc(100dvh-(56px+env(safe-area-inset-top,0px)))] items-center justify-center bg-black">
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
      <div className="flex flex-col bg-black overflow-hidden h-[calc(100dvh-(56px+env(safe-area-inset-top,0px)))] max-w-full">
        <div className="flex flex-col items-center justify-center flex-1 text-zinc-500 px-4 text-center">
          <p className="text-lg font-medium">No campus assigned</p>
          <p className="text-sm">Contact a leader to be assigned to a campus to join the chat.</p>
        </div>
      </div>
    );
  }

  // Group messages by date
  const getDateKey = (dateString: string) => format(new Date(dateString), "yyyy-MM-dd");

  const shouldShowHeader = (index: number) => {
    if (index === 0) return true;
    const currentMessage = messages[index];
    const previousMessage = messages[index - 1];
    const currentDate = getDateKey(currentMessage.created_at);
    const previousDate = getDateKey(previousMessage.created_at);
    return currentMessage.user_id !== previousMessage.user_id || currentDate !== previousDate;
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
    const ministryLabel = CHAT_MINISTRY_TYPES.find(m => m.value === selectedMinistryType)?.label || '';
    return `${campusName} ${ministryLabel}`.trim();
  };

  return (
    <div 
      className="flex flex-col bg-black overflow-hidden max-w-full"
      style={{
        height: 'calc(100dvh - (56px + env(safe-area-inset-top, 0px)))',
      }}
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
      <div className="relative flex-1 min-h-0 overflow-hidden">
        <PullToRefresh
          ref={pullToRefreshRef}
          onRefresh={refetch}
          className="h-full"
          onScrollChange={handleScrollChange}
        >
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-white" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-zinc-500">
              <p className="text-lg font-medium">No messages yet</p>
              <p className="text-sm">Start the conversation!</p>
            </div>
          ) : (
            <div className="pb-4">
              {messages.map((message, index) => (
                <div key={message.id}>
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
              <div ref={messagesEndRef} />
            </div>
          )}
        </PullToRefresh>
        
        {/* Typing indicator */}
        <TypingIndicator campusId={selectedCampusId} />
        
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
        
        {/* Scroll to bottom button */}
        {showScrollButton && messages.length > 0 && (
          <button
            onClick={() => pullToRefreshRef.current?.scrollToBottom()}
            className="absolute bottom-4 right-4 flex items-center gap-2 rounded-full bg-zinc-800 border border-zinc-700 shadow-lg hover:bg-zinc-700 transition-colors px-3 py-2"
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

      {/* Input area */}
      <div className="sticky bottom-0 flex-shrink-0">
        {keyboardHeight === 0 && (
          <div className="absolute -top-6 left-0 right-0 h-6 bg-gradient-to-t from-black to-transparent pointer-events-none" />
        )}
        <div className={`bg-black ${keyboardHeight > 0 ? '' : 'backdrop-blur-md border-t border-zinc-800/50'}`}>
          <MessageInput 
            onSendMessage={sendMessage} 
            onTyping={setTyping}
            campusName={getChatDisplayName()}
            campusId={selectedCampusId}
            ministryType={selectedMinistryType}
          />
        </div>
      </div>
    </div>
  );
}

export default function Chat() {
  return (
    <ChatErrorBoundary>
      <ChatContent />
    </ChatErrorBoundary>
  );
}
