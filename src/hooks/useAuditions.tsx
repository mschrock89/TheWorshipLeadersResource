import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export type AuditionStage = "pre_audition" | "audition";
export type AuditionTrack = "vocalist" | "instrumentalist";
export type AuditionStatus = "scheduled" | "completed" | "cancelled";

export interface Audition {
  id: string;
  candidate_id: string;
  campus_id: string | null;
  audition_date: string;
  start_time: string | null;
  end_time: string | null;
  stage: AuditionStage;
  candidate_track: AuditionTrack;
  lead_song: string | null;
  harmony_song: string | null;
  song_one: string | null;
  song_two: string | null;
  notes: string | null;
  status: AuditionStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  campuses?: { name: string } | null;
}

export function useUpcomingAudition(candidateId: string | undefined) {
  return useQuery({
    queryKey: ["upcoming-audition", candidateId],
    enabled: !!candidateId,
    queryFn: async () => {
      if (!candidateId) return null;

      const today = new Date().toISOString().split("T")[0];

      const { data, error } = await supabase
        .from("auditions")
        .select("*, campuses(name)")
        .eq("candidate_id", candidateId)
        .eq("status", "scheduled")
        .gte("audition_date", today)
        .order("audition_date", { ascending: true })
        .order("start_time", { ascending: true, nullsFirst: true })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return (data as Audition | null) ?? null;
    },
  });
}

export function useCandidateAudition(candidateId: string | undefined) {
  return useQuery({
    queryKey: ["candidate-audition", candidateId],
    enabled: !!candidateId,
    queryFn: async () => {
      if (!candidateId) return null;

      const today = new Date().toISOString().split("T")[0];
      const upcoming = await supabase
        .from("auditions")
        .select("*, campuses(name)")
        .eq("candidate_id", candidateId)
        .eq("status", "scheduled")
        .gte("audition_date", today)
        .order("audition_date", { ascending: true })
        .order("start_time", { ascending: true, nullsFirst: true })
        .limit(1)
        .maybeSingle();

      if (upcoming.error) throw upcoming.error;
      if (upcoming.data) return upcoming.data as Audition;

      const fallback = await supabase
        .from("auditions")
        .select("*, campuses(name)")
        .eq("candidate_id", candidateId)
        .order("audition_date", { ascending: false })
        .order("start_time", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

      if (fallback.error) throw fallback.error;
      return (fallback.data as Audition | null) ?? null;
    },
  });
}

type UpsertAuditionInput = {
  id?: string;
  candidate_id: string;
  campus_id?: string | null;
  audition_date: string;
  start_time?: string | null;
  end_time?: string | null;
  stage: AuditionStage;
  candidate_track: AuditionTrack;
  lead_song?: string | null;
  harmony_song?: string | null;
  song_one?: string | null;
  song_two?: string | null;
  notes?: string | null;
  status?: AuditionStatus;
};

export function useUpsertAudition() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (payload: UpsertAuditionInput) => {
      const { data: authData } = await supabase.auth.getUser();
      const currentUserId = authData.user?.id ?? null;

      const { data, error } = await supabase
        .from("auditions")
        .upsert(
          {
            ...payload,
            created_by: currentUserId,
          },
          { onConflict: "id" }
        )
        .select("*, campuses(name)")
        .single();

      if (error) throw error;
      return data as Audition;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["upcoming-audition", data.candidate_id] });
      queryClient.invalidateQueries({ queryKey: ["candidate-audition", data.candidate_id] });
      toast({
        title: "Audition saved",
        description: "Audition details were updated successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Unable to save audition",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
