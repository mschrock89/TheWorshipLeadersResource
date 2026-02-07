import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

// Detect if we're on iOS
function isIOS(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

// Trigger haptic feedback on iOS
function triggerHaptic() {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(10);
  }
}

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

export interface ChatMessage {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  campus_id: string | null;
  ministry_type: string | null;
  attachments: string[] | null;
  profiles: Profile;
  message_reactions: Reaction[];
}

export function useChatMessages(campusId: string | null, ministryType: string | null = 'weekend') {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();
  const isIOSDevice = useMemo(() => isIOS(), []);
  const previousMessageCountRef = useRef<number>(0);

  const fetchMessages = async () => {
    if (!campusId || !ministryType) {
      setMessages([]);
      setIsLoading(false);
      return;
    }

    // Fetch messages without profile join (profiles may be blocked by RLS for volunteers)
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
      .eq("campus_id", campusId)
      .eq("ministry_type", ministryType)
      .order("created_at", { ascending: true });

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching messages:", error);
      toast({
        title: "Error",
        description: "Failed to load messages",
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }

    // Fetch all basic profiles using the SECURITY DEFINER function
    // This bypasses complex RLS and allows volunteers to see sender names
    const { data: allProfiles } = await supabase.rpc("get_basic_profiles");
    const profileMap = new Map(
      (allProfiles || []).map((p: Profile) => [p.id, p])
    );

    const normalized = (data || []).map((m: any) => ({
      ...m,
      profiles: profileMap.get(m.user_id) ?? { id: m.user_id, full_name: null, avatar_url: null },
      message_reactions: Array.isArray(m.message_reactions) 
        ? m.message_reactions.map((r: any) => ({
            ...r,
            profiles: profileMap.get(r.user_id) ?? { id: r.user_id, full_name: null, avatar_url: null },
          }))
        : [],
    }));

    setMessages(normalized as unknown as ChatMessage[]);
    setIsLoading(false);
  };

  const sendMessage = async (content: string, attachments?: string[]) => {
    if (!user || !campusId || !ministryType) return;
    if (!content.trim() && (!attachments || attachments.length === 0)) return;

    // Trigger haptic feedback on iOS when sending
    if (isIOSDevice) {
      triggerHaptic();
    }

    const { error } = await supabase.from("chat_messages").insert({
      user_id: user.id,
      content: content.trim() || (attachments?.length ? "" : ""),
      campus_id: campusId,
      ministry_type: ministryType,
      attachments: attachments && attachments.length > 0 ? attachments : null,
    });

    if (error) {
      console.error("Error sending message:", error);
      toast({
        title: "Error",
        description: "Failed to send message",
        variant: "destructive",
      });
      return;
    }

    // Check for @mentions and send push notifications
    if (content.includes("@")) {
      try {
        // Get sender's name for the notification
        const { data: senderProfile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .single();
        
        // Get campus name
        const { data: campus } = await supabase
          .from("campuses")
          .select("name")
          .eq("id", campusId)
          .single();

        await supabase.functions.invoke("notify-chat-mention", {
          body: {
            messageContent: content,
            senderName: senderProfile?.full_name || "Someone",
            senderId: user.id,
            campusName: campus?.name || "the group",
          },
        });
      } catch (mentionError) {
        console.error("Failed to send mention notification:", mentionError);
        // Don't show error to user - notification is secondary
      }
    }
  };

  const editMessage = async (messageId: string, newContent: string) => {
    if (!user || !newContent.trim()) return false;

    const { error } = await supabase
      .from("chat_messages")
      .update({ content: newContent.trim() })
      .eq("id", messageId)
      .eq("user_id", user.id);

    if (error) {
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

    const { error } = await supabase
      .from("chat_messages")
      .delete()
      .eq("id", messageId)
      .eq("user_id", user.id);

    if (error) {
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

    // Check if user already has this reaction on this message
    const existingReaction = messages
      .find((m) => m.id === messageId)
      ?.message_reactions.find(
        (r) => r.user_id === user.id && r.reaction === emoji
      );

    if (existingReaction) {
      // Remove the reaction
      const { error } = await supabase
        .from("message_reactions")
        .delete()
        .eq("id", existingReaction.id);

      if (error) {
        console.error("Error removing reaction:", error);
      }
    } else {
      // Add the reaction
      const { error } = await supabase.from("message_reactions").insert({
        message_id: messageId,
        user_id: user.id,
        reaction: emoji,
      });

      if (error) {
        console.error("Error adding reaction:", error);
      }
    }
  };

  useEffect(() => {
    if (!campusId || !ministryType) {
      setMessages([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    fetchMessages();

    // Subscribe to new messages and reactions for this campus+ministry
    const messagesChannel = supabase
      .channel(`chat-messages-${campusId}-${ministryType}`)
      .on(
        "postgres_changes",
        { 
          event: "INSERT", 
          schema: "public", 
          table: "chat_messages",
          filter: `campus_id=eq.${campusId}`  // Note: Supabase doesn't support AND in filters, so we filter client-side
        },
        (payload) => {
          // Only process messages for our ministry type
          const newMsg = payload.new as { ministry_type?: string; user_id?: string };
          if (newMsg.ministry_type !== ministryType) return;
          
          // Trigger haptic feedback on iOS for new messages from other users
          if (isIOSDevice && newMsg.user_id !== user?.id) {
            triggerHaptic();
          }
          fetchMessages();
        }
      )
      .on(
        "postgres_changes",
        { 
          event: "UPDATE", 
          schema: "public", 
          table: "chat_messages",
          filter: `campus_id=eq.${campusId}`
        },
        (payload) => {
          // Only process updates for our ministry type
          const updatedMsg = payload.new as { ministry_type?: string };
          if (updatedMsg.ministry_type !== ministryType) return;
          fetchMessages();
        }
      )
      .on(
        "postgres_changes",
        { 
          event: "DELETE", 
          schema: "public", 
          table: "chat_messages",
          filter: `campus_id=eq.${campusId}`
        },
        () => {
          fetchMessages();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_reactions" },
        () => {
          fetchMessages();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(messagesChannel);
    };
  }, [campusId, ministryType, isIOSDevice, user?.id]);

  return {
    messages,
    isLoading,
    sendMessage,
    editMessage,
    deleteMessage,
    toggleReaction,
    refetch: fetchMessages,
    currentUserId: user?.id,
  };
}
