import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BUSY_CHAT_MESSAGE_THRESHOLD = 5;
const BUSY_CHAT_WINDOW_MS = 60 * 1000;
const MAX_PREVIEW_LENGTH = 120;

const MINISTRY_LABELS: Record<string, string> = {
  weekend: "Weekend",
  encounter: "Encounter",
  evident: "Evident",
  eon: "EON",
  production: "Production",
  video: "Video",
};

interface NotifyChatMessageRequest {
  messageId: string;
}

interface ChatMessageRecord {
  id: string;
  user_id: string;
  content: string | null;
  campus_id: string;
  ministry_type: string;
  attachments: string[] | null;
  created_at: string;
  profiles: {
    full_name: string | null;
  } | null;
  campuses: {
    name: string | null;
  } | null;
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}

function getMessagePreview(message: ChatMessageRecord): string {
  const content = message.content?.trim();
  if (content) return truncateText(content, MAX_PREVIEW_LENGTH);

  const attachmentCount = message.attachments?.length || 0;
  if (attachmentCount > 1) return "Sent attachments";
  if (attachmentCount === 1) return "Sent an attachment";
  return "Sent a message";
}

function extractMentions(messageContent: string): string[] {
  const mentionRegex = /@([A-Za-z]+(?:\s+[A-Za-z]+)*)/g;
  const mentions: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = mentionRegex.exec(messageContent)) !== null) {
    mentions.push(match[1].trim().toLowerCase());
  }

  return Array.from(new Set(mentions));
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messageId }: NotifyChatMessageRequest = await req.json();

    if (!messageId) {
      return new Response(
        JSON.stringify({ error: "messageId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: message, error: messageError } = await supabase
      .from("chat_messages")
      .select(`
        id,
        user_id,
        content,
        campus_id,
        ministry_type,
        attachments,
        created_at,
        profiles(full_name),
        campuses(name)
      `)
      .eq("id", messageId)
      .single<ChatMessageRecord>();

    if (messageError || !message) {
      throw new Error(`Failed to load chat message: ${messageError?.message || "Not found"}`);
    }

    const senderName = message.profiles?.full_name?.trim() || "Someone";
    const campusName = message.campuses?.name?.trim() || "your campus";
    const ministryLabel = MINISTRY_LABELS[message.ministry_type] || message.ministry_type;
    const chatLabel = `${campusName} ${ministryLabel}`.trim();
    const chatKey = `${message.campus_id}:${message.ministry_type}`;

    const { data: chatProfiles, error: chatProfilesError } = await supabase.rpc(
      "get_profiles_for_chat_mention",
      { _campus_id: message.campus_id, _ministry_type: message.ministry_type },
    );

    if (chatProfilesError) {
      throw new Error(`Failed to resolve chat members: ${chatProfilesError.message}`);
    }

    const recipientUserIds = Array.from(
      new Set(
        (chatProfiles || [])
          .map((profile) => profile.id)
          .filter((userId): userId is string => Boolean(userId) && userId !== message.user_id),
      ),
    );

    if (recipientUserIds.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No recipients for this chat message" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const mentionNames = extractMentions(message.content || "");
    const mentionUserIds = mentionNames.length === 0
      ? []
      : Array.from(
          new Set(
            (chatProfiles || [])
              .filter((profile) => {
                const fullName = profile.full_name?.trim().toLowerCase();
                return !!fullName && mentionNames.some((mention) => fullName.includes(mention));
              })
              .map((profile) => profile.id)
              .filter((userId): userId is string => Boolean(userId) && userId !== message.user_id),
          ),
        );

    const generalRecipientUserIds = recipientUserIds.filter((userId) => !mentionUserIds.includes(userId));
    const messagePreview = getMessagePreview(message);

    let mentionPushSent = 0;
    if (mentionUserIds.length > 0) {
      const mentionResponse = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          title: `${senderName} mentioned you`,
          message: messagePreview,
          url: "/chat",
          tag: `chat-mention-${message.id}`,
          userIds: mentionUserIds,
          contextType: "chat-mention",
          contextId: message.id,
          createdBy: message.user_id,
          metadata: {
            campusId: message.campus_id,
            ministryType: message.ministry_type,
            messageId: message.id,
          },
        }),
      });

      if (!mentionResponse.ok) {
        console.error("Failed to send mention push:", await mentionResponse.text());
      } else {
        const mentionResult = await mentionResponse.json();
        mentionPushSent = mentionResult.sent || 0;
      }
    }

    const windowStartIso = new Date(new Date(message.created_at).getTime() - BUSY_CHAT_WINDOW_MS).toISOString();
    const { count: recentMessageCount, error: recentMessageError } = await supabase
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("campus_id", message.campus_id)
      .eq("ministry_type", message.ministry_type)
      .gte("created_at", windowStartIso);

    if (recentMessageError) {
      throw new Error(`Failed to count recent chat activity: ${recentMessageError.message}`);
    }

    const isBusyChat = (recentMessageCount || 0) >= BUSY_CHAT_MESSAGE_THRESHOLD;
    let busyNotificationSent = false;
    let busyPushSent = 0;
    let messagePushSent = 0;

    if (isBusyChat && generalRecipientUserIds.length > 0) {
      const { data: recentBusyLog, error: recentBusyLogError } = await supabase
        .from("push_notification_logs")
        .select("id")
        .eq("context_type", "chat-busy")
        .eq("context_id", chatKey)
        .gte("created_at", windowStartIso)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (recentBusyLogError) {
        throw new Error(`Failed to inspect recent busy chat pushes: ${recentBusyLogError.message}`);
      }

      if (!recentBusyLog) {
        const busyResponse = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            title: `${chatLabel} is busy`,
            message: "A lot is happening in chat right now. Join the conversation.",
            url: "/chat",
            tag: `chat-busy-${chatKey}`,
            userIds: generalRecipientUserIds,
            contextType: "chat-busy",
            contextId: chatKey,
            createdBy: message.user_id,
            metadata: {
              campusId: message.campus_id,
              ministryType: message.ministry_type,
              messageId: message.id,
              recentMessageCount: recentMessageCount || 0,
            },
          }),
        });

        if (!busyResponse.ok) {
          console.error("Failed to send busy chat push:", await busyResponse.text());
        } else {
          const busyResult = await busyResponse.json();
          busyNotificationSent = true;
          busyPushSent = busyResult.sent || 0;
        }
      }
    }

    if (!busyNotificationSent && generalRecipientUserIds.length > 0) {
      const messageResponse = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          title: `${senderName} in ${chatLabel}`,
          message: messagePreview,
          url: "/chat",
          tag: `chat-message-${message.id}`,
          userIds: generalRecipientUserIds,
          contextType: "chat-message",
          contextId: message.id,
          createdBy: message.user_id,
          metadata: {
            campusId: message.campus_id,
            ministryType: message.ministry_type,
            messageId: message.id,
          },
        }),
      });

      if (!messageResponse.ok) {
        console.error("Failed to send chat message push:", await messageResponse.text());
      } else {
        const messageResult = await messageResponse.json();
        messagePushSent = messageResult.sent || 0;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        messageId: message.id,
        recipientCount: recipientUserIds.length,
        mentionRecipientCount: mentionUserIds.length,
        mentionPushSent,
        messagePushSent,
        busyNotificationSent,
        busyPushSent,
        recentMessageCount: recentMessageCount || 0,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error in notify-chat-message:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
