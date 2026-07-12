import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getCurrentResourceAppKey } from "@/lib/resourceApp";

export interface TypingUser {
  userId: string;
  name: string;
}

interface TypingPresence {
  userId?: string;
  name?: string;
  isTyping?: boolean;
}

function getTypingChannelName(campusId: string, ministryType: string | null) {
  return `typing-${getCurrentResourceAppKey()}-${campusId}-${ministryType || "chat"}`;
}

// One presence channel per chat handles both directions: tracking our own typing
// state and listening for everyone else's (previously two subscriptions to the
// same topic — one in this component, one in the hook).
export function useTypingPresence(
  campusId: string | null,
  ministryType: string | null,
  userName: string | null,
) {
  const { user } = useAuth();
  const [channel, setChannel] = useState<ReturnType<typeof supabase.channel> | null>(null);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);

  useEffect(() => {
    if (!campusId || !user) {
      setTypingUsers([]);
      return;
    }

    const ch = supabase.channel(getTypingChannelName(campusId, ministryType));

    ch
      .on("presence", { event: "sync" }, () => {
        const state = ch.presenceState();
        const users: TypingUser[] = [];

        Object.values(state).forEach((presences) => {
          (presences as TypingPresence[]).forEach((presence) => {
            if (presence.userId && presence.userId !== user.id && presence.isTyping) {
              users.push({ userId: presence.userId, name: presence.name || "Someone" });
            }
          });
        });

        setTypingUsers(users);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await ch.track({ userId: user.id, name: userName || "Someone", isTyping: false });
        }
      });
    setChannel(ch);

    return () => {
      supabase.removeChannel(ch);
      setChannel(null);
      setTypingUsers([]);
    };
  }, [campusId, ministryType, user, userName]);

  const setTyping = useCallback(
    async (isTyping: boolean) => {
      if (!channel || !user) return;
      await channel.track({ userId: user.id, name: userName || "Someone", isTyping });
    },
    [channel, user, userName]
  );

  return { setTyping, typingUsers };
}

export function TypingIndicator({ typingUsers }: { typingUsers: TypingUser[] }) {
  if (typingUsers.length === 0) return null;

  const text =
    typingUsers.length === 1
      ? `${typingUsers[0].name} is typing...`
      : typingUsers.length === 2
      ? `${typingUsers[0].name} and ${typingUsers[1].name} are typing...`
      : `${typingUsers[0].name} and ${typingUsers.length - 1} others are typing...`;

  return (
    <div className="px-4 py-1 text-xs text-zinc-400 animate-pulse truncate bg-[#1C1C1E]">
      {text}
    </div>
  );
}
