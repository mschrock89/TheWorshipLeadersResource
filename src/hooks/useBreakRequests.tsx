import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";
import { normalizeWeekendWorshipMinistryType } from "@/lib/constants";

export interface BreakRequest {
  id: string;
  user_id: string;
  rotation_period_id: string;
  reason: string | null;
  request_type: "need_break" | "willing_break";
  request_scope: "full_trimester" | "blackout_dates";
  blackout_dates: string[] | null;
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

type MyBreakRequestRow = BreakRequest & {
  rotation_periods?: {
    name: string;
  } | null;
};

interface CreateBlackoutPeriodGroup {
  rotationPeriodId: string;
  blackoutDates: string[];
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

      return ((data || []) as MyBreakRequestRow[]).map((r) => ({
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

      const { data: targetPeriod, error: targetPeriodError } = await supabase
        .from("rotation_periods")
        .select("id, year, trimester, campus_id")
        .eq("id", rotationPeriodId)
        .maybeSingle();

      if (targetPeriodError) throw targetPeriodError;
      if (!targetPeriod) return [];

      const periodIds = [rotationPeriodId];

      if (targetPeriod.campus_id) {
        const { data: networkWidePeriod, error: networkWidePeriodError } = await supabase
          .from("rotation_periods")
          .select("id")
          .eq("year", targetPeriod.year)
          .eq("trimester", targetPeriod.trimester)
          .is("campus_id", null)
          .maybeSingle();

        if (networkWidePeriodError) throw networkWidePeriodError;
        if (networkWidePeriod?.id) {
          periodIds.push(networkWidePeriod.id);
        }
      }

      const { data: requests, error: requestsError } = await supabase
        .from("break_requests")
        .select("*")
        .in("rotation_period_id", periodIds)
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

      const { data: userCampuses, error: campusError } = await supabase
        .from("user_campuses")
        .select("campus_id")
        .eq("user_id", user.id);

      if (campusError) throw campusError;

      const campusIds = (userCampuses || []).map((uc) => uc.campus_id);

      const [networkWideResult, campusResult] = await Promise.all([
        supabase
          .from("rotation_periods")
          .select("*")
          .is("campus_id", null),
        campusIds.length > 0
          ? supabase
              .from("rotation_periods")
              .select("*")
              .in("campus_id", campusIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (networkWideResult.error) throw networkWideResult.error;
      if (campusResult.error) throw campusResult.error;

      const periods = [...(networkWideResult.data || []), ...(campusResult.data || [])];

      return periods
        .sort((a, b) => {
          if (a.year !== b.year) return b.year - a.year;
          if (a.trimester !== b.trimester) return a.trimester - b.trimester;
          return (a.campus_id || "").localeCompare(b.campus_id || "");
        }) as RotationPeriod[];
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
      requestScope = "full_trimester",
      blackoutDates,
      ministryType,
      blackoutPeriodGroups,
    }: {
      rotationPeriodId: string;
      reason?: string;
      requestType?: "need_break" | "willing_break";
      requestScope?: "full_trimester" | "blackout_dates";
      blackoutDates?: string[];
      ministryType?: string;
      blackoutPeriodGroups?: CreateBlackoutPeriodGroup[];
    }) => {
      if (!user?.id) throw new Error("Not authenticated");

      const normalizedMinistryType = normalizeWeekendWorshipMinistryType(ministryType);

      if (requestScope === "blackout_dates" && blackoutPeriodGroups?.length) {
        const periodIds = blackoutPeriodGroups.map((group) => group.rotationPeriodId);
        const { data: existingRequests, error: existingRequestsError } = await supabase
          .from("break_requests")
          .select("id, rotation_period_id, request_scope, blackout_dates, reason")
          .eq("user_id", user.id)
          .in("rotation_period_id", periodIds);

        if (existingRequestsError) throw existingRequestsError;

        for (const group of blackoutPeriodGroups) {
          const uniqueBlackoutDates = Array.from(new Set(group.blackoutDates)).sort();
          const existingRequest = existingRequests?.find(
            (request) => request.rotation_period_id === group.rotationPeriodId
          );

          if (existingRequest?.request_scope === "full_trimester") {
            continue;
          }

          if (existingRequest) {
            const mergedDates = Array.from(
              new Set([...(existingRequest.blackout_dates || []), ...uniqueBlackoutDates])
            ).sort();

            const { error: updateError } = await supabase
              .from("break_requests")
              .update({
                reason: reason || existingRequest.reason || null,
                request_type: requestType,
                request_scope: "blackout_dates",
                blackout_dates: mergedDates,
                ministry_type: null,
                status: "pending",
                reviewed_by: null,
                reviewed_at: null,
              })
              .eq("id", existingRequest.id);

            if (updateError) throw updateError;
          } else {
            const { error: insertError } = await supabase.from("break_requests").insert({
              user_id: user.id,
              rotation_period_id: group.rotationPeriodId,
              reason: reason || null,
              request_type: requestType,
              request_scope: "blackout_dates",
              blackout_dates: uniqueBlackoutDates,
              ministry_type: null,
            });

            if (insertError) throw insertError;
          }
        }

        return;
      }

      const { error } = await supabase.from("break_requests").insert({
        user_id: user.id,
        rotation_period_id: rotationPeriodId,
        reason: reason || null,
        request_type: requestType,
        request_scope: requestScope,
        blackout_dates: blackoutDates?.length ? blackoutDates : null,
        ministry_type: normalizedMinistryType || null,
      });

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["break-requests"] });
      toast.success(
        variables.requestScope === "blackout_dates"
          ? "Blackout dates submitted"
          : "Break request submitted"
      );
    },
    onError: (error: { code?: string }) => {
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

export function useCreateManagedBreakRequest() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      userId,
      rotationPeriodId,
      ministryType,
      reason,
    }: {
      userId: string;
      rotationPeriodId: string;
      ministryType?: string;
      reason?: string;
    }) => {
      if (!user?.id) throw new Error("Not authenticated");

      const normalizedMinistryType = normalizeWeekendWorshipMinistryType(ministryType);

      const { error } = await supabase.from("break_requests").insert({
        user_id: userId,
        rotation_period_id: rotationPeriodId,
        reason: reason || null,
        request_type: "need_break",
        request_scope: "full_trimester",
        blackout_dates: null,
        ministry_type: normalizedMinistryType || null,
        status: "approved",
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["break-requests"] });
      toast.success("Volunteer sat for this rotation");
    },
    onError: (error: { code?: string; message?: string }) => {
      if (error.code === "23505") {
        toast.error("That volunteer already has a break request for this rotation");
      } else {
        toast.error(error.message || "Failed to sit volunteer for this rotation");
      }
    },
  });
}

export function useDeleteManagedBreakRequest() {
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
      toast.success("Volunteer unsat for this rotation");
    },
    onError: (error: { message?: string }) => {
      toast.error(error.message || "Failed to unsit volunteer for this rotation");
    },
  });
}
