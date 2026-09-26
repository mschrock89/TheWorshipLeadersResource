import { createClient } from "npm:@supabase/supabase-js@2";
import { encodeRfc2822, gmailFetch, refreshGoogleAccessToken } from "../_shared/gmail.ts";

const corsHeaders = (origin: string) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-resource-app-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
});

function encodeHeader(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `=?UTF-8?B?${btoa(binary)}?=`;
}

function buildReplyRaw(params: {
  fromEmail: string;
  toEmail: string;
  toName?: string | null;
  subject: string;
  body: string;
  inReplyTo?: string | null;
}): string {
  const to = params.toName ? `${params.toName} <${params.toEmail}>` : params.toEmail;
  const subject = params.subject.toLowerCase().startsWith("re:") ? params.subject : `Re: ${params.subject}`;
  const lines = [
    `From: ${params.fromEmail}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 7bit",
  ];

  if (params.inReplyTo) {
    lines.push(`In-Reply-To: ${params.inReplyTo}`);
    lines.push(`References: ${params.inReplyTo}`);
  }

  lines.push("", params.body.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n"));
  return lines.join("\r\n");
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "*";
  const headers = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers });
  }

  try {
    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "missing_auth_header" }), {
        status: 401,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const googleClientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey || !googleClientId || !googleClientSecret) {
      return new Response(JSON.stringify({ error: "missing_env_configuration" }), {
        status: 500,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const service = createClient(supabaseUrl, supabaseServiceKey);

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const messageId = typeof body?.messageId === "string" ? body.messageId : "";
    const replyText = typeof body?.body === "string" ? body.body.trim() : "";

    if (!messageId || !replyText) {
      return new Response(JSON.stringify({ error: "messageId and body are required" }), {
        status: 400,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    const { data: inboxMessage, error: messageError } = await service
      .from("audition_inbox_messages")
      .select("id, connected_by, from_email, from_name, subject, rfc_message_id, gmail_thread_id, status")
      .eq("id", messageId)
      .maybeSingle();

    if (messageError || !inboxMessage) {
      return new Response(JSON.stringify({ error: "message_not_found" }), {
        status: 404,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    if (inboxMessage.connected_by !== user.id) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    const { data: integration } = await service
      .from("gmail_integrations")
      .select("email_address, refresh_token")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!integration?.refresh_token) {
      return new Response(JSON.stringify({ error: "gmail_not_connected" }), {
        status: 400,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    const accessToken = await refreshGoogleAccessToken({
      clientId: googleClientId,
      clientSecret: googleClientSecret,
      refreshToken: integration.refresh_token,
    });

    const raw = encodeRfc2822(
      buildReplyRaw({
        fromEmail: integration.email_address,
        toEmail: inboxMessage.from_email,
        toName: inboxMessage.from_name,
        subject: inboxMessage.subject || "Worship Team",
        body: replyText,
        inReplyTo: inboxMessage.rfc_message_id,
      }),
    );

    const sent = await gmailFetch<{ id?: string }>(accessToken, "/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        raw,
        threadId: inboxMessage.gmail_thread_id || undefined,
      }),
    });

    await service.from("audition_inbox_replies").insert({
      message_id: inboxMessage.id,
      sent_by: user.id,
      gmail_message_id: sent.id || null,
      body_text: replyText,
    });

    const nextStatus = inboxMessage.status === "scheduled" ? "scheduled" : "replied";
    await service
      .from("audition_inbox_messages")
      .update({
        status: nextStatus,
        replied_at: new Date().toISOString(),
      })
      .eq("id", inboxMessage.id);

    return new Response(JSON.stringify({ success: true, gmailMessageId: sent.id || null }), {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "unexpected_gmail_send_error" }),
      { status: 500, headers: { ...headers, "Content-Type": "application/json" } },
    );
  }
});
