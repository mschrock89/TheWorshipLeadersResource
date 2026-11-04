import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getCurrentResourceAppKey } from "@/lib/resourceApp";

export type GapRequestStatus = "open" | "filled" | "cancelled";
export type GapResponse = "pending" | "yes" | "no";

export interface GapPerson {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

export interface GapRecipient {
  id: string;
  user_id: string;
  response: GapResponse;
  responded_at: string | null;
  profile: GapPerson | null;
}

export interface GapRequest {
  id: string;
  created_by: string;
  campus_id: string;
  ministry_type: string;
  schedule_date: string;
  position: string;
  position_slot: string;
  covers_weekend_pair: boolean;
  team_id: string | null;
  slotted_dates: string[];
  message: string | null;
  status: GapRequestStatus;
  filled_by_user_id: string | null;
  filled_at: string | null;
  target_campus_ids: string[];
  target_ministry_types: string[];
  created_at: string;
  campus_name: string | null;
  sender: GapPerson | null;
  can_manage: boolean;
  /** Everyone asked; only populated when the viewer manages the request. */
  recipients: GapRecipient[];
  /** The viewer's own answer when they were asked. */
  my_response: GapResponse | null;
}

export interface GapCandidate {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  campus_names: string[];
  ministry_types: string[];
}

export interface GapRequestDraft {
  campusId: string;
  ministryType: string;
  scheduleDate: string;
  position: string;
  positionSlot: string;
  coversWeekendPair: boolean;
  targetCampusIds: string[];
  targetMinistryTypes: string[];
  message?: string;
  userIds?: string[];
}

async function functionErrorMessage(error: unknown, fallback: string): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const payload = await error.context.json();
      if (typeof payload?.error === "string" && payload.error.trim()) return payload.error.trim();
    } catch {
      // Keep the fallback.
    }
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

export function isGapRequestClosed(request: Pick<GapRequest, "status" | "schedule_date">): boolean {
  if (request.status !== "open") return true;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  return request.schedule_date < today;
}

export function useGapRequests() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const resourceAppKey = getCurrentResourceAppKey();

  const query = useQuery({
    queryKey: ["gap-requests", user?.id, resourceAppKey],
    enabled: !!user?.id,
    queryFn: async (): Promise<GapRequest[]> => {
      const { data: requests, error } = await supabase
        .from("gap_requests")
        .select("*, campuses(name)")
        .eq("resource_app_key", resourceAppKey)
        .order("schedule_date", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) throw error;
      if (!requests?.length) return [];

      const { data: recipientRows, error: recipientsError } = await supabase
        .from("gap_request_recipients")
        .select("id, gap_request_id, user_id, response, responded_at")
        .in("gap_request_id", requests.map((request) => request.id));

      if (recipientsError) throw recipientsError;

      const profileIds = Array.from(
        new Set([
          ...requests.flatMap((request) => [request.created_by, request.filled_by_user_id]),
          ...(recipientRows || []).map((row) => row.user_id),
        ].filter((id): id is string => Boolean(id))),
      );

      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", profileIds);

      if (profilesError) throw profilesError;

      const profilesById = new Map((profiles || []).map((profile) => [profile.id, profile as GapPerson]));

      return requests.map((request) => {
        const rows = (recipientRows || []).filter((row) => row.gap_request_id === request.id);
        const mine = rows.find((row) => row.user_id === user!.id);
        // RLS only returns other people's answers to the sender and campus leads.
        const canManage = request.created_by === user!.id || rows.some((row) => row.user_id !== user!.id);

        return {
          ...request,
          status: request.status as GapRequestStatus,
          campus_name: (request.campuses as { name: string } | null)?.name ?? null,
          sender: profilesById.get(request.created_by) ?? null,
          can_manage: canManage,
          recipients: canManage
            ? rows.map((row) => ({
                id: row.id,
                user_id: row.user_id,
                response: row.response as GapResponse,
                responded_at: row.responded_at,
                profile: profilesById.get(row.user_id) ?? null,
              }))
            : [],
          my_response: (mine?.response as GapResponse | undefined) ?? null,
        };
      });
    },
  });

  useEffect(() => {
    if (!user?.id) return;

    const refresh = () => queryClient.invalidateQueries({ queryKey: ["gap-requests"] });
    const channel = supabase
      .channel(`gap-requests-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "gap_requests" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "gap_request_recipients" }, refresh)
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, user?.id]);

  return query;
}

/** Open gap requests still waiting on the current user's answer (menu badge). */
export function usePendingGapInviteCount() {
  const { user } = useAuth();
  const resourceAppKey = getCurrentResourceAppKey();

  return useQuery({
    queryKey: ["gap-requests", "pending-count", user?.id, resourceAppKey],
    enabled: !!user?.id,
    queryFn: async () => {
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
      const { count, error } = await supabase
        .from("gap_request_recipients")
        .select("id, gap_requests!inner(status, schedule_date, resource_app_key)", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .eq("response", "pending")
        .eq("gap_requests.status", "open")
        .eq("gap_requests.resource_app_key", resourceAppKey)
        .gte("gap_requests.schedule_date", today);

      if (error) throw error;
      return count || 0;
    },
  });
}

export function usePreviewGapRecipients() {
  const resourceAppKey = getCurrentResourceAppKey();

  return useMutation({
    mutationFn: async (
      draft: Omit<GapRequestDraft, "userIds" | "message" | "positionSlot" | "coversWeekendPair">,
    ): Promise<GapCandidate[]> => {
      const { data, error } = await supabase.functions.invoke("send-gap-request", {
        body: { ...draft, dryRun: true, resourceAppKey },
      });
      if (error) throw new Error(await functionErrorMessage(error, "Couldn't load volunteers"));
      return (data?.candidates || []) as GapCandidate[];
    },
  });
}

export function useSendGapRequest() {
  const queryClient = useQueryClient();
  const resourceAppKey = getCurrentResourceAppKey();

  return useMutation({
    mutationFn: async (draft: GapRequestDraft) => {
      const { data, error } = await supabase.functions.invoke("send-gap-request", {
        body: { ...draft, resourceAppKey },
      });
      if (error) throw new Error(await functionErrorMessage(error, "Couldn't send the gap request"));
      return data as { gapRequestId: string; notified: number; pushSent: number };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gap-requests"] });
    },
  });
}

export interface GapActionResult {
  status?: GapRequestStatus;
  response?: GapResponse;
  volunteerName?: string;
  teamName?: string | null;
  slottedDates?: string[];
  /** Set when approval succeeded but the volunteer couldn't be added to the roster. */
  scheduleError?: string | null;
}

export function useRespondToGapRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      gapRequestId,
      action,
      userId,
    }: {
      gapRequestId: string;
      action: "yes" | "no" | "confirm" | "cancel";
      userId?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke("respond-gap-request", {
        body: { gapRequestId, action, userId },
      });
      if (error) throw new Error(await functionErrorMessage(error, "Couldn't update the gap request"));
      return data as GapActionResult;
    },
    onSettled: (data) => {
      queryClient.invalidateQueries({ queryKey: ["gap-requests"] });
      if (data?.slottedDates?.length) {
        queryClient.invalidateQueries({ queryKey: ["team-member-date-overrides"] });
        queryClient.invalidateQueries({ queryKey: ["team-roster-for-date"] });
        queryClient.invalidateQueries({ queryKey: ["my-team-date-overrides"] });
        queryClient.invalidateQueries({ queryKey: ["my-scheduled-dates"] });
      }
    },
  });
}
