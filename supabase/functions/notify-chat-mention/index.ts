import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface MentionNotificationRequest {
  messageContent: string;
  senderName: string;
  senderId: string;
  campusName: string;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { messageContent, senderName, senderId, campusName }: MentionNotificationRequest = await req.json();

    if (!messageContent) {
      return new Response(
        JSON.stringify({ error: "No message content provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing mention notification from ${senderName}: ${messageContent}`);

    // Extract @mentions from the message (format: @Full Name)
    const mentionRegex = /@([A-Za-z]+(?:\s+[A-Za-z]+)*)/g;
    const mentions: string[] = [];
    let match;
    while ((match = mentionRegex.exec(messageContent)) !== null) {
      mentions.push(match[1].trim());
    }

    if (mentions.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No mentions found", notified: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found mentions: ${mentions.join(", ")}`);

    // Find user IDs for mentioned users
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name")
      .not("id", "eq", senderId); // Don't notify yourself

    if (profileError) {
      console.error("Error fetching profiles:", profileError);
      throw new Error("Failed to fetch profiles");
    }

    // Match mentioned names to profiles (case-insensitive partial match)
    const mentionedUserIds: string[] = [];
    for (const mention of mentions) {
      const mentionLower = mention.toLowerCase();
      const matchedProfile = profiles?.find(p => 
        p.full_name?.toLowerCase().includes(mentionLower) ||
        p.full_name?.toLowerCase() === mentionLower
      );
      if (matchedProfile && !mentionedUserIds.includes(matchedProfile.id)) {
        mentionedUserIds.push(matchedProfile.id);
      }
    }

    if (mentionedUserIds.length === 0) {
      console.log("No matching users found for mentions");
      return new Response(
        JSON.stringify({ success: true, message: "No matching users found", notified: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Sending push to ${mentionedUserIds.length} mentioned users`);

    // Send push notification
    const pushResponse = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        title: `${senderName} mentioned you`,
        message: messageContent.length > 100 ? messageContent.substring(0, 100) + "..." : messageContent,
        url: "/chat",
        tag: "chat-mention",
        userIds: mentionedUserIds,
      }),
    });

    let pushSent = 0;
    if (pushResponse.ok) {
      const pushResult = await pushResponse.json();
      pushSent = pushResult.sent || 0;
      console.log(`Push notifications sent: ${pushSent}`);
    } else {
      console.error("Failed to send push:", await pushResponse.text());
    }

    return new Response(
      JSON.stringify({
        success: true,
        notified: mentionedUserIds.length,
        pushSent,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in notify-chat-mention:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
