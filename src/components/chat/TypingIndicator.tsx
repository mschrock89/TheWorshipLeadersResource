import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface TypingUser {
  userId: string;
  name: string;
}

interface TypingIndicatorProps {
  campusId: string | null;
}

export function TypingIndicator({ campusId }: TypingIndicatorProps) {
  const { user } = useAuth();
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);

  useEffect(() => {
    if (!campusId || !user) return;

    const channel = supabase.channel(`typing-${campusId}`);

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const users: TypingUser[] = [];
        
        Object.values(state).forEach((presences: any) => {
          presences.forEach((presence: any) => {
            if (presence.userId !== user.id && presence.isTyping) {
              users.push({ userId: presence.userId, name: presence.name });
            }
          });
        });
        
        setTypingUsers(users);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [campusId, user]);

  if (typingUsers.length === 0) return null;

  const text =
    typingUsers.length === 1
      ? `${typingUsers[0].name} is typing...`
      : typingUsers.length === 2
      ? `${typingUsers[0].name} and ${typingUsers[1].name} are typing...`
      : `${typingUsers[0].name} and ${typingUsers.length - 1} others are typing...`;

  return (
    <div className="px-4 py-1 text-xs text-zinc-400 animate-pulse">
      {text}
    </div>
  );
}

export function useTypingPresence(campusId: string | null, userName: string | null) {
  const { user } = useAuth();
  const [channel, setChannel] = useState<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!campusId || !user) return;

    const ch = supabase.channel(`typing-${campusId}`);
    ch.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await ch.track({ userId: user.id, name: userName || "Someone", isTyping: false });
      }
    });
    setChannel(ch);

    return () => {
      supabase.removeChannel(ch);
    };
  }, [campusId, user, userName]);

  const setTyping = useCallback(
    async (isTyping: boolean) => {
      if (!channel || !user) return;
      await channel.track({ userId: user.id, name: userName || "Someone", isTyping });
    },
    [channel, user, userName]
  );

  return { setTyping };
}
