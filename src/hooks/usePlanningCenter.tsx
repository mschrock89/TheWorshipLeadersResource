import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface PcoConnection {
  id: string;
  user_id: string;
  campus_id: string | null;
  pco_organization_name: string | null;
  sync_team_members: boolean;
  sync_phone_numbers: boolean;
  sync_birthdays: boolean;
  sync_positions: boolean;
  sync_active_only: boolean;
  connected_at: string;
  last_sync_at: string | null;
}

export function usePcoConnection() {
  return useQuery({
    queryKey: ["pco-connection"],
    queryFn: async () => {
      // Use the secure function that excludes OAuth tokens
      const { data, error } = await supabase
        .rpc("get_my_pco_connection")
        .maybeSingle();

      if (error) throw error;
      return data as PcoConnection | null;
    },
  });
}

// Check if ANY PCO connection exists (for volunteers to see song library)
export function useAnyPcoConnection() {
  return useQuery({
    queryKey: ["any-pco-connection"],
    queryFn: async () => {
      // Check if there are any synced songs - this indicates PCO has been connected
      const { count, error } = await supabase
        .from("songs")
        .select("*", { count: "exact", head: true });

      if (error) throw error;
      return (count ?? 0) > 0;
    },
  });
}

export function useStartPcoAuth() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (campusId?: string) => {
      const redirectUri = `${window.location.origin}/settings/planning-center`;
      
      const { data, error } = await supabase.functions.invoke("pco-auth-start", {
        body: { redirectUri, campusId },
      });

      if (error) throw error;
      return data.authUrl as string;
    },
    onSuccess: (authUrl) => {
      // Try to open in new tab, fallback to same window if popup blocked
      const popup = window.open(authUrl, "_blank");
      if (!popup || popup.closed || typeof popup.closed === 'undefined') {
        // Popup was blocked - redirect in same window instead
        toast({
          title: "Redirecting...",
          description: "Opening Planning Center authorization.",
        });
        window.location.href = authUrl;
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Connection Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useSavePcoConnection() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (connectionCode: string) => {
      const { data, error } = await supabase.functions.invoke("pco-save-connection", {
        body: { connectionCode },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pco-connection"] });
      toast({
        title: "Connected!",
        description: "Planning Center account connected successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Connection Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useDisconnectPco() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("pco-disconnect");
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pco-connection"] });
      toast({
        title: "Disconnected",
        description: "Planning Center account disconnected.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useSyncPcoTeam() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("pco-sync-team");
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["pco-connection"] });
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
      
      const results = data.results;
      const total = results.synced + results.updated + results.skipped;
      
      let description = "";
      if (results.synced > 0) {
        description += `${results.synced} new member${results.synced !== 1 ? 's' : ''} added`;
      }
      if (results.updated > 0) {
        description += description ? ", " : "";
        description += `${results.updated} updated`;
      }
      if (results.synced === 0 && results.updated === 0) {
        description = "All members already in sync";
      }
      
      toast({
        title: "Sync Complete ✓",
        description,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Sync Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useSyncPcoPlans() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("pco-sync-plans");
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["pco-connection"] });
      queryClient.invalidateQueries({ queryKey: ["songs"] });
      queryClient.invalidateQueries({ queryKey: ["service-plans"] });
      
      const results = data.results || {};
      const plansSynced = results.plans_synced || 0;
      const songsSynced = results.songs_synced || 0;
      
      toast({
        title: "Plan Sync Complete ✓",
        description: `${plansSynced} plans and ${songsSynced} songs synced.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Plan Sync Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export interface PcoScheduleSyncOptions {
  date: string; // YYYY-MM-DD
  team_type?: 'audio' | 'video' | 'both';
  team_id?: string;
}

export interface PcoScheduleSyncResult {
  audio_synced: number;
  video_synced: number;
  audio_updated?: number;
  video_updated?: number;
  members_found: { name: string; position: string; team: string; email?: string }[];
  errors: string[];
}

export function useSyncPcoSchedule() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (options: PcoScheduleSyncOptions) => {
      const { data, error } = await supabase.functions.invoke("pco-sync-schedule", {
        body: options,
      });
      if (error) throw error;
      return data as { success: boolean; results: PcoScheduleSyncResult };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
      queryClient.invalidateQueries({ queryKey: ["team-roster"] });
      queryClient.invalidateQueries({ queryKey: ["team-roster-for-date"] });
      
      const results = data.results || { audio_synced: 0, video_synced: 0, audio_updated: 0, video_updated: 0, members_found: [], errors: [] };
      const audioSynced = results.audio_synced + (results.audio_updated || 0);
      const videoSynced = results.video_synced + (results.video_updated || 0);
      const membersFound = results.members_found;
      
      if (audioSynced > 0 || videoSynced > 0) {
        toast({
          title: "Schedule Sync Complete ✓",
          description: `Synced ${audioSynced} audio and ${videoSynced} video members.`,
        });
      } else if (membersFound.length > 0) {
        toast({
          title: "Members Found",
          description: `Found ${membersFound.length} audio/video members in PCO. Some may already exist.`,
        });
      } else {
        toast({
          title: "No Team Members Found",
          description: "No Audio or Video team members were found for this date in PCO.",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Schedule Sync Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useUpdatePcoSettings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (settings: Partial<PcoConnection>) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("pco_connections")
        .update(settings)
        .eq("user_id", user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pco-connection"] });
      toast({
        title: "Settings Saved",
        description: "Sync preferences updated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
