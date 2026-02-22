import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface GoogleCalendarConnection {
  id: string;
  user_id: string;
  google_email: string | null;
  calendar_id: string;
  token_expires_at: string;
  connected_at: string;
  updated_at: string;
}

export function useGoogleCalendarConnection() {
  return useQuery({
    queryKey: ["google-calendar-connection"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("google-calendar-status");
      if (error) throw error;
      return (data?.connection || null) as GoogleCalendarConnection | null;
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
      const popup = window.open(authUrl, "_blank");
      if (!popup || popup.closed || typeof popup.closed === "undefined") {
        toast({
          title: "Redirecting...",
          description: "Opening Google Calendar authorization.",
        });
        window.location.href = authUrl;
      }
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
