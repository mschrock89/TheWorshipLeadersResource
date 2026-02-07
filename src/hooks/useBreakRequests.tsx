import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export interface BreakRequest {
  id: string;
  user_id: string;
  rotation_period_id: string;
  reason: string | null;
  request_type: "need_break" | "willing_break";
  status: "pending" | "approved" | "denied";
  reviewed_by: string | null;
  reviewed_at: string | null;
  ministry_type: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  user_name?: string;
  period_name?: string;
}

export interface RotationPeriod {
  id: string;
  name: string;
  trimester: number;
  year: number;
  campus_id: string | null;
  start_date: string;
  end_date: string;
  is_active: boolean;
}

export function useMyBreakRequests() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["break-requests", "my", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from("break_requests")
        .select(`
          *,
          rotation_periods!inner(name)
        `)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      return (data || []).map((r: any) => ({
        ...r,
        period_name: r.rotation_periods?.name,
      })) as BreakRequest[];
    },
    enabled: !!user?.id,
  });
}

export function useBreakRequestsForPeriod(rotationPeriodId: string | null) {
  return useQuery({
    queryKey: ["break-requests", "period", rotationPeriodId],
    queryFn: async () => {
      if (!rotationPeriodId) return [];

      // Fetch break requests
      const { data: requests, error: requestsError } = await supabase
        .from("break_requests")
        .select("*")
        .eq("rotation_period_id", rotationPeriodId)
        .order("created_at", { ascending: false });

      if (requestsError) throw requestsError;
      if (!requests || requests.length === 0) return [];

      // Fetch profile names using secure RPC
      const userIds = [...new Set(requests.map(r => r.user_id))];
      const { data: profiles } = await supabase.rpc("get_basic_profiles");
      
      const profileMap = new Map<string, string>();
      (profiles || []).forEach((p: { id: string; full_name: string }) => {
        profileMap.set(p.id, p.full_name);
      });

      return requests.map(r => ({
        ...r,
        user_name: profileMap.get(r.user_id) || "Unknown",
      })) as BreakRequest[];
    },
    enabled: !!rotationPeriodId,
  });
}

export function useRotationPeriodsForUser() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["rotation-periods", "user", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      // First get user's campus IDs
      const { data: userCampuses, error: campusError } = await supabase
        .from("user_campuses")
        .select("campus_id")
        .eq("user_id", user.id);

      if (campusError) throw campusError;
      if (!userCampuses || userCampuses.length === 0) return [];

      const campusIds = userCampuses.map((uc) => uc.campus_id);

      // Fetch rotation periods for those campuses
      const { data: periods, error: periodsError } = await supabase
        .from("rotation_periods")
        .select("*")
        .in("campus_id", campusIds)
        .order("year", { ascending: false })
        .order("trimester", { ascending: true });

      if (periodsError) throw periodsError;

      return (periods || []) as RotationPeriod[];
    },
    enabled: !!user?.id,
  });
}

export function useCreateBreakRequest() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      rotationPeriodId,
      reason,
      requestType = "need_break",
      ministryType,
    }: {
      rotationPeriodId: string;
      reason?: string;
      requestType?: "need_break" | "willing_break";
      ministryType?: string;
    }) => {
      if (!user?.id) throw new Error("Not authenticated");

      const { error } = await supabase.from("break_requests").insert({
        user_id: user.id,
        rotation_period_id: rotationPeriodId,
        reason: reason || null,
        request_type: requestType,
        ministry_type: ministryType || null,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["break-requests"] });
      toast.success("Break request submitted");
    },
    onError: (error: any) => {
      if (error.code === "23505") {
        toast.error("You already have a break request for this trimester");
      } else {
        toast.error("Failed to submit break request");
      }
    },
  });
}

export function useCancelBreakRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase
        .from("break_requests")
        .delete()
        .eq("id", requestId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["break-requests"] });
      toast.success("Break request cancelled");
    },
    onError: () => {
      toast.error("Failed to cancel break request");
    },
  });
}

export function useReviewBreakRequest() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      requestId,
      status,
    }: {
      requestId: string;
      status: "approved" | "denied";
    }) => {
      if (!user?.id) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("break_requests")
        .update({
          status,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", requestId);

      if (error) throw error;
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ["break-requests"] });
      toast.success(`Break request ${status}`);
    },
    onError: () => {
      toast.error("Failed to update break request");
    },
  });
}
