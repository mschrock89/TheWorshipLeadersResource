import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface GoogleCalendarConnection {
  id: string;
  user_id: string;
  google_email: string | null;
  calendar_id: string;
  calendar_name?: string | null;
  sync_setlists?: boolean;
  sync_events?: boolean;
  last_sync_status?: string | null;
  last_sync_error?: string | null;
  last_synced_at?: string | null;
  token_expires_at: string;
  connected_at: string;
  updated_at: string;
}

export interface GoogleCalendarSyncFailure {
  id: string;
  user_id: string;
  user_name: string | null;
  action: string;
  source_type: string | null;
  source_id: string | null;
  error_message: string | null;
  created_at: string;
}

export interface GoogleCalendarStatusResponse {
  connected: boolean;
  connection: GoogleCalendarConnection | null;
  isAdmin: boolean;
  recentFailures: GoogleCalendarSyncFailure[];
}

export interface GoogleCalendarOption {
  id: string;
  summary: string;
  primary: boolean;
  accessRole: string;
}

export function useGoogleCalendarConnection() {
  return useQuery({
    queryKey: ["google-calendar-connection"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("google-calendar-status");
      if (error) throw error;
      return (data || {
        connected: false,
        connection: null,
        isAdmin: false,
        recentFailures: [],
      }) as GoogleCalendarStatusResponse;
    },
  });
}

export function useStartGoogleCalendarAuth() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      const redirectUri = `${window.location.origin}/settings/planning-center`;
      const { data, error } = await supabase.functions.invoke("google-calendar-auth-start", {
        body: { redirectUri },
      });
      if (error) throw error;
      return data?.authUrl as string;
    },
    onSuccess: (authUrl) => {
      // Keep OAuth in the same tab/webview so auth state is preserved on iOS/mobile.
      toast({
        title: "Redirecting...",
        description: "Opening Google Calendar authorization.",
      });
      window.location.assign(authUrl);
    },
    onError: (error: Error) => {
      toast({
        title: "Google Calendar connection failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useSaveGoogleCalendarConnection() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (connectionCode: string) => {
      const { data, error } = await supabase.functions.invoke("google-calendar-save-connection", {
        body: { connectionCode },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["google-calendar-connection"] });
      toast({
        title: "Google Calendar connected",
        description: "Your setlists and events can now sync automatically.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Google Calendar connection failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useDisconnectGoogleCalendar() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("google-calendar-disconnect");
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["google-calendar-connection"] });
      toast({
        title: "Google Calendar disconnected",
        description: "Automatic calendar sync has been turned off.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Disconnect failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useGoogleCalendars(enabled: boolean) {
  return useQuery({
    queryKey: ["google-calendar-list"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("google-calendar-list-calendars");
      if (error) throw error;
      return (data?.calendars || []) as GoogleCalendarOption[];
    },
    enabled,
  });
}

export function useUpdateGoogleCalendarSettings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (settings: {
      calendarId?: string;
      calendarName?: string;
      syncSetlists?: boolean;
      syncEvents?: boolean;
    }) => {
      const { data, error } = await supabase.functions.invoke("google-calendar-update-settings", {
        body: settings,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["google-calendar-connection"] });
      toast({ title: "Google Calendar settings saved" });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to save Google Calendar settings",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useResyncGoogleCalendar() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("google-calendar-resync");
      if (error) throw error;
      return data as { success: boolean; setlistSynced: number; eventsSynced: number };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["google-calendar-connection"] });
      toast({
        title: "Google Calendar re-sync complete",
        description: `${data?.setlistSynced || 0} setlists and ${data?.eventsSynced || 0} events synced.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Google Calendar re-sync failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
