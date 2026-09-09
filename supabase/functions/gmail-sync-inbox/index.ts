import { createClient } from "npm:@supabase/supabase-js@2";
import {
  classifyAuditionInterestEmail,
  GMAIL_INTEREST_QUERY,
  parseEmailAddress,
} from "../_shared/auditionInboxMatch.ts";
import {
  extractMessageBodies,
  gmailFetch,
  headerValue,
  htmlToText,
  refreshGoogleAccessToken,
  type GmailMessage,
} from "../_shared/gmail.ts";

const corsHeaders = (origin: string) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-resource-app-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
});

type ServiceClient = ReturnType<typeof createClient>;

type GmailIntegrationRow = {
  id: string;
  user_id: string;
  email_address: string;
  refresh_token: string;
  history_id: string | null;
};

type HistoryListResponse = {
  history?: Array<{ messagesAdded?: Array<{ message?: { id?: string } }> }>;
  historyId?: string;
  nextPageToken?: string;
};

type MessageListResponse = {
  messages?: Array<{ id: string; threadId?: string }>;
  nextPageToken?: string;
  resultSizeEstimate?: number;
};

const MAX_LIST_PAGES = 6;
const LIST_PAGE_SIZE = 50;
const GET_BATCH_SIZE = 8;
const INITIAL_LOOKBACK_QUERY = `${GMAIL_INTEREST_QUERY} newer_than:120d`;

async function assertLeader(authClient: ServiceClient, userId: string) {
  const allowedRoles = [
    "admin",
    "campus_admin",
    "campus_worship_pastor",
    "student_worship_pastor",
    "childrens_pastor",
    "network_worship_pastor",
    "network_worship_leader",
    "network_student_pastor",
    "student_pastor",
    "video_director",
    "production_manager",
    "leader",
  ];

  for (const role of allowedRoles) {
    const { data } = await authClient.rpc("has_role", { _user_id: userId, _role: role });
    if (data) return;
  }

  throw Object.assign(new Error("Forbidden"), { status: 403 });
}

async function listMessageIdsFromSearch(accessToken: string, query: string): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < MAX_LIST_PAGES; page += 1) {
    const params = new URLSearchParams({
      q: query,
      maxResults: String(LIST_PAGE_SIZE),
    });
    if (pageToken) params.set("pageToken", pageToken);

    const payload = await gmailFetch<MessageListResponse>(accessToken, `/messages?${params.toString()}`);
    for (const message of payload.messages || []) {
      if (message.id) ids.push(message.id);
    }

    pageToken = payload.nextPageToken;
    if (!pageToken) break;
  }

  return Array.from(new Set(ids));
}

async function listNewMessageIdsFromHistory(
  accessToken: string,
  startHistoryId: string,
): Promise<{ ids: string[]; historyId: string | null; expired: boolean }> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  let latestHistoryId: string | null = null;

  try {
    for (let page = 0; page < MAX_LIST_PAGES; page += 1) {
      const params = new URLSearchParams({
        startHistoryId,
        historyTypes: "messageAdded",
      });
      if (pageToken) params.set("pageToken", pageToken);

      const payload = await gmailFetch<HistoryListResponse>(accessToken, `/history?${params.toString()}`);
      latestHistoryId = payload.historyId || latestHistoryId;

      for (const item of payload.history || []) {
        for (const added of item.messagesAdded || []) {
          if (added.message?.id) ids.push(added.message.id);
        }
      }

      pageToken = payload.nextPageToken;
      if (!pageToken) break;
    }

    return { ids: Array.from(new Set(ids)), historyId: latestHistoryId, expired: false };
  } catch (error) {
    const status = (error as Error & { status?: number }).status;
    if (status === 404) {
      return { ids: [], historyId: null, expired: true };
    }
    throw error;
  }
}

async function fetchMessages(accessToken: string, ids: string[]): Promise<GmailMessage[]> {
  const messages: GmailMessage[] = [];

  for (let i = 0; i < ids.length; i += GET_BATCH_SIZE) {
    const batch = ids.slice(i, i + GET_BATCH_SIZE);
    const results = await Promise.all(
      batch.map((id) =>
        gmailFetch<GmailMessage>(
          accessToken,
          `/messages/${encodeURIComponent(id)}?format=full`,
        ).catch(() => null),
      ),
    );
    for (const result of results) {
      if (result) messages.push(result);
    }
  }

  return messages;
}

async function syncSingleUser(
  service: ServiceClient,
  integration: GmailIntegrationRow,
  googleClientId: string,
  googleClientSecret: string,
): Promise<{ scanned: number; matched: number; inserted: number; historyId: string | null }> {
  const accessToken = await refreshGoogleAccessToken({
    clientId: googleClientId,
    clientSecret: googleClientSecret,
    refreshToken: integration.refresh_token,
  });

  const profile = await gmailFetch<{ emailAddress?: string; historyId?: string }>(accessToken, "/profile");
  const connectedEmail = (profile.emailAddress || integration.email_address || "").toLowerCase();
  let messageIds: string[] = [];
  let nextHistoryId = profile.historyId || integration.history_id;

  if (integration.history_id) {
    const history = await listNewMessageIdsFromHistory(accessToken, integration.history_id);
    if (history.expired) {
      messageIds = await listMessageIdsFromSearch(accessToken, INITIAL_LOOKBACK_QUERY);
    } else {
      messageIds = history.ids;
      nextHistoryId = history.historyId || nextHistoryId;
    }
  } else {
    messageIds = await listMessageIdsFromSearch(accessToken, INITIAL_LOOKBACK_QUERY);
  }

  const { data: existingRows } = await service
    .from("audition_inbox_messages")
    .select("gmail_message_id")
    .eq("connected_by", integration.user_id)
    .in("gmail_message_id", messageIds.length > 0 ? messageIds : ["__none__"]);

  const existingIds = new Set((existingRows || []).map((row) => row.gmail_message_id));
  const newIds = messageIds.filter((id) => !existingIds.has(id));
  const messages = await fetchMessages(accessToken, newIds);

  let matched = 0;
  let inserted = 0;

  for (const message of messages) {
    const from = parseEmailAddress(headerValue(message, "From"));
    const to = parseEmailAddress(headerValue(message, "To"));
    const subject = headerValue(message, "Subject");
    const rfcMessageId = headerValue(message, "Message-ID") || headerValue(message, "Message-Id");
    const bodies = extractMessageBodies(message);
    const bodyText = bodies.text || htmlToText(bodies.html) || message.snippet || "";
    const receivedAt = message.internalDate
      ? new Date(Number(message.internalDate)).toISOString()
      : new Date().toISOString();

    const classification = classifyAuditionInterestEmail({
      fromEmail: from.email,
      fromName: from.name,
      subject,
      snippet: message.snippet,
      bodyText,
      connectedEmail,
    });

    if (!classification.matched || !from.email) continue;
    matched += 1;

    const { error } = await service.from("audition_inbox_messages").upsert(
      {
        connected_by: integration.user_id,
        gmail_message_id: message.id,
        gmail_thread_id: message.threadId || null,
        rfc_message_id: rfcMessageId || null,
        from_email: from.email,
        from_name: from.name,
        to_email: to.email || connectedEmail,
        subject: subject || null,
        snippet: message.snippet || bodyText.slice(0, 280) || null,
        body_text: bodyText || null,
        received_at: receivedAt,
        matched_keywords: classification.keywords,
        match_reason: classification.reason,
      },
      { onConflict: "connected_by,gmail_message_id", ignoreDuplicates: true },
    );

    if (!error) inserted += 1;
  }

  await service
    .from("gmail_integrations")
    .update({
      email_address: connectedEmail || integration.email_address,
      history_id: nextHistoryId || integration.history_id,
      last_synced_at: new Date().toISOString(),
      last_sync_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", integration.id);

  return {
    scanned: messages.length,
    matched,
    inserted,
    historyId: nextHistoryId || null,
  };
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

    const service = createClient(supabaseUrl, supabaseServiceKey);
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const requestBody = await req.json().catch(() => ({}));
    const isServiceRequest = token === supabaseServiceKey;

    const loadIntegration = async (userId: string) => {
      const { data, error } = await service
        .from("gmail_integrations")
        .select("id, user_id, email_address, refresh_token, history_id")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw new Error(`integration_lookup_failed_${error.code ?? "unknown"}`);
      return data as GmailIntegrationRow | null;
    };

    if (isServiceRequest && requestBody?.run_all === true) {
      const { data: rows, error } = await service
        .from("gmail_integrations")
        .select("id, user_id, email_address, refresh_token, history_id")
        .not("refresh_token", "is", null);

      if (error) {
        return new Response(JSON.stringify({ error: `run_all_lookup_failed_${error.code ?? "unknown"}` }), {
          status: 500,
          headers: { ...headers, "Content-Type": "application/json" },
        });
      }

      const perUser = [];
      for (const row of (rows || []) as GmailIntegrationRow[]) {
        try {
          const summary = await syncSingleUser(service, row, googleClientId, googleClientSecret);
          perUser.push({ user_id: row.user_id, success: true, ...summary });
        } catch (syncError) {
          const message = syncError instanceof Error ? syncError.message : "unknown_sync_error";
          await service
            .from("gmail_integrations")
            .update({ last_sync_error: message, updated_at: new Date().toISOString() })
            .eq("id", row.id);
          perUser.push({ user_id: row.user_id, success: false, error: message });
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          mode: "run_all",
          users_processed: perUser.length,
          users_successful: perUser.filter((row) => row.success).length,
          per_user: perUser,
        }),
        { status: 200, headers: { ...headers, "Content-Type": "application/json" } },
      );
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
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

    await assertLeader(authClient, user.id);

    const integration = await loadIntegration(user.id);
    if (!integration) {
      return new Response(JSON.stringify({ error: "gmail_not_connected" }), {
        status: 400,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    const summary = await syncSingleUser(service, integration, googleClientId, googleClientSecret);
    return new Response(JSON.stringify({ success: true, ...summary }), {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  } catch (error) {
    const status = (error as Error & { status?: number }).status || 500;
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "unexpected_gmail_sync_error" }),
      { status, headers: { ...headers, "Content-Type": "application/json" } },
    );
  }
});
