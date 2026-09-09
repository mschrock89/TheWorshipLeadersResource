import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { AuditionInboxStatus } from "@/lib/auditionInbox";

export type GmailInboxConnection = {
  email_address: string;
  last_synced_at: string | null;
  last_sync_error: string | null;
  created_at: string;
};

export type AuditionInboxMessage = {
  id: string;
  connected_by: string;
  gmail_message_id: string;
  gmail_thread_id: string | null;
  rfc_message_id: string | null;
  from_email: string;
  from_name: string | null;
  to_email: string | null;
  subject: string | null;
  snippet: string | null;
  body_text: string | null;
  received_at: string;
  matched_keywords: string[];
  match_reason: string | null;
  status: AuditionInboxStatus;
  candidate_user_id: string | null;
  audition_id: string | null;
  replied_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AuditionInboxReply = {
  id: string;
  message_id: string;
  body_text: string;
  sent_at: string;
};

export type MatchedProfile = {
  id: string;
  full_name: string | null;
  email: string;
  isCandidate: boolean;
};

const getFunctionAuthHeaders = async () => {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("You must be logged in");
  }

  return {
    Authorization: `Bearer ${session.access_token}`,
  };
};

const getFunctionErrorMessage = async (error: unknown, fallback: string) => {
  if (error instanceof FunctionsHttpError) {
    try {
      const payload = await error.context.json();
      if (typeof payload?.error === "string" && payload.error.trim()) {
        return payload.error.trim();
      }
    } catch {
      // Fall through.
    }
  }

  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
};

export function useGmailInboxConnection(userId: string | undefined) {
  return useQuery({
    queryKey: ["gmail-inbox-connection", userId],
    enabled: !!userId,
    queryFn: async (): Promise<GmailInboxConnection | null> => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from("gmail_integrations")
        .select("email_address, last_synced_at, last_sync_error, created_at")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useAuditionInboxMessages(userId: string | undefined) {
  return useQuery({
    queryKey: ["audition-inbox-messages", userId],
    enabled: !!userId,
    queryFn: async (): Promise<AuditionInboxMessage[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("audition_inbox_messages")
        .select("*")
        .eq("connected_by", userId)
        .order("received_at", { ascending: false });
      if (error) throw error;
      return (data || []) as AuditionInboxMessage[];
    },
  });
}

export function useAuditionInboxReplies(messageId: string | null) {
  return useQuery({
    queryKey: ["audition-inbox-replies", messageId],
    enabled: !!messageId,
    queryFn: async (): Promise<AuditionInboxReply[]> => {
      if (!messageId) return [];
      const { data, error } = await supabase
        .from("audition_inbox_replies")
        .select("id, message_id, body_text, sent_at")
        .eq("message_id", messageId)
        .order("sent_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });
}

export function useMatchedInboxProfiles(emails: string[]) {
  const unique = Array.from(new Set(emails.map((email) => email.toLowerCase()).filter(Boolean)));

  return useQuery({
    queryKey: ["audition-inbox-profiles", unique],
    enabled: unique.length > 0,
    queryFn: async (): Promise<Record<string, MatchedProfile>> => {
      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("email", unique);
      if (profileError) throw profileError;

      const ids = (profiles || []).map((profile) => profile.id);
      let candidateIds = new Set<string>();
      if (ids.length > 0) {
        const { data: roles, error: roleError } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "audition_candidate")
          .in("user_id", ids);
        if (roleError) throw roleError;
        candidateIds = new Set((roles || []).map((row) => row.user_id));
      }

      const map: Record<string, MatchedProfile> = {};
      for (const profile of profiles || []) {
        map[profile.email.toLowerCase()] = {
          id: profile.id,
          full_name: profile.full_name,
          email: profile.email,
          isCandidate: candidateIds.has(profile.id),
        };
      }
      return map;
    },
  });
}

export function useConnectGmailInbox() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (returnTo: string) => {
      const headers = await getFunctionAuthHeaders();
      const { data, error } = await supabase.functions.invoke("gmail-auth-start", {
        headers,
        body: { returnTo },
      });
      if (error) throw new Error(await getFunctionErrorMessage(error, "Failed to start Gmail connection"));
      if (!data?.url) throw new Error("Gmail auth URL was not returned");
      window.location.href = data.url;
    },
    onError: (error) => {
      toast({
        title: "Unable to connect Gmail",
        description: error instanceof Error ? error.message : "Gmail connection failed.",
        variant: "destructive",
      });
    },
  });
}

export function useDisconnectGmailInbox(userId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      const headers = await getFunctionAuthHeaders();
      const { error } = await supabase.functions.invoke("gmail-disconnect", {
        headers,
        body: {},
      });
      if (error) throw new Error(await getFunctionErrorMessage(error, "Failed to disconnect Gmail"));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gmail-inbox-connection", userId] });
      queryClient.invalidateQueries({ queryKey: ["audition-inbox-messages", userId] });
      toast({ title: "Gmail disconnected" });
    },
    onError: (error) => {
      toast({
        title: "Unable to disconnect Gmail",
        description: error instanceof Error ? error.message : "Disconnect failed.",
        variant: "destructive",
      });
    },
  });
}

export function useSyncGmailInbox(userId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      const headers = await getFunctionAuthHeaders();
      const { data, error } = await supabase.functions.invoke("gmail-sync-inbox", {
        headers,
        body: {},
      });
      if (error) throw new Error(await getFunctionErrorMessage(error, "Failed to sync Gmail"));
      return data as { scanned?: number; matched?: number; inserted?: number };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["gmail-inbox-connection", userId] });
      queryClient.invalidateQueries({ queryKey: ["audition-inbox-messages", userId] });
      toast({
        title: "Inbox synced",
        description: `${data?.inserted ?? 0} new interest email${(data?.inserted ?? 0) === 1 ? "" : "s"} added.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Unable to sync Gmail",
        description: error instanceof Error ? error.message : "Sync failed.",
        variant: "destructive",
      });
    },
  });
}

export function useSendInboxReply(userId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (payload: { messageId: string; body: string }) => {
      const headers = await getFunctionAuthHeaders();
      const { error } = await supabase.functions.invoke("gmail-send-reply", {
        headers,
        body: payload,
      });
      if (error) throw new Error(await getFunctionErrorMessage(error, "Failed to send reply"));
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["audition-inbox-messages", userId] });
      queryClient.invalidateQueries({ queryKey: ["audition-inbox-replies", variables.messageId] });
      toast({ title: "Reply sent" });
    },
    onError: (error) => {
      toast({
        title: "Unable to send reply",
        description: error instanceof Error ? error.message : "Send failed.",
        variant: "destructive",
      });
    },
  });
}

export function useUpdateInboxMessage(userId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (payload: {
      id: string;
      status?: AuditionInboxStatus;
      candidate_user_id?: string | null;
      audition_id?: string | null;
    }) => {
      const { id, ...updates } = payload;
      const { error } = await supabase.from("audition_inbox_messages").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["audition-inbox-messages", userId] });
    },
    onError: (error) => {
      toast({
        title: "Unable to update message",
        description: error instanceof Error ? error.message : "Update failed.",
        variant: "destructive",
      });
    },
  });
}
