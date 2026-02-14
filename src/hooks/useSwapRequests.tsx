import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { parseLocalDate, getWeekendPairDate } from "@/lib/utils";

export type SwapRequestType = "swap" | "fill_in";

export interface SwapRequest {
  id: string;
  requester_id: string;
  original_date: string;
  swap_date: string | null;
  target_user_id: string | null;
  position: string;
  team_id: string;
  status: "pending" | "accepted" | "declined" | "cancelled";
  accepted_by_id: string | null;
  message: string | null;
  created_at: string;
  resolved_at: string | null;
  request_type: SwapRequestType;
  requester?: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  };
  target_user?: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
  accepted_by?: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
  worship_teams?: {
    id: string;
    name: string;
    color: string;
    icon: string;
  };
}

export function useSwapRequests() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["swap-requests", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("swap_requests")
        .select(`
          *,
          requester:profiles!swap_requests_requester_id_fkey(id, full_name, avatar_url),
          target_user:profiles!swap_requests_target_user_id_fkey(id, full_name, avatar_url),
          accepted_by:profiles!swap_requests_accepted_by_id_fkey(id, full_name, avatar_url),
          worship_teams(id, name, color, icon)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as SwapRequest[];
    },
    enabled: !!user,
  });

  // Track if initial load is complete to avoid toasts on first load
  const initialLoadComplete = useRef(false);

  useEffect(() => {
    if (query.isSuccess && !initialLoadComplete.current) {
      initialLoadComplete.current = true;
    }
  }, [query.isSuccess]);

  // Real-time subscription with notifications
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("swap-requests-changes")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "swap_requests",
        },
        async (payload) => {
          queryClient.invalidateQueries({ queryKey: ["swap-requests"] });
          queryClient.invalidateQueries({ queryKey: ["swap-requests-count"] });
          
          // Only show toast if not from current user and after initial load
          if (initialLoadComplete.current && payload.new.requester_id !== user.id) {
            const isTargetedAtMe = payload.new.target_user_id === user.id;
            
            // Check if it's an open request for my position
            if (isTargetedAtMe || !payload.new.target_user_id) {
              // Fetch requester name
              const { data: requester } = await supabase
                .from("profiles")
                .select("full_name")
                .eq("id", payload.new.requester_id)
                .single();
              
              const name = requester?.full_name || "Someone";
              toast.info(`${name} requested a swap`, {
                description: isTargetedAtMe 
                  ? "They want to swap dates with you" 
                  : `Looking for coverage on ${parseLocalDate(payload.new.original_date).toLocaleDateString()}`,
              });
            }
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "swap_requests",
        },
        async (payload) => {
          queryClient.invalidateQueries({ queryKey: ["swap-requests"] });
          queryClient.invalidateQueries({ queryKey: ["swap-requests-count"] });
          
          // Only notify requester about status changes
          if (initialLoadComplete.current && payload.new.requester_id === user.id) {
            const newStatus = payload.new.status;
            const oldStatus = payload.old?.status;
            
            if (newStatus !== oldStatus && newStatus !== "pending") {
              // Fetch accepter name if accepted
              let accepterName = "Someone";
              if (newStatus === "accepted" && payload.new.accepted_by_id) {
                const { data: accepter } = await supabase
                  .from("profiles")
                  .select("full_name")
                  .eq("id", payload.new.accepted_by_id)
                  .single();
                accepterName = accepter?.full_name || "Someone";
              }
              
              if (newStatus === "accepted") {
                toast.success("Swap request accepted!", {
                  description: `${accepterName} will cover your date`,
                });
              } else if (newStatus === "declined") {
                toast.error("Swap request declined", {
                  description: "Your swap request was not accepted",
                });
              }
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  return query;
}

export function usePendingSwapRequestsCount() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["swap-requests-count", user?.id],
    queryFn: async () => {
      // Get user's positions from team_members
      const { data: memberData } = await supabase
        .from("team_members")
        .select("position")
        .eq("user_id", user!.id);

      const positions = memberData?.map((m) => m.position) || [];

      const { count, error } = await supabase
        .from("swap_requests")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending")
        .neq("requester_id", user!.id)
        .or(`target_user_id.eq.${user!.id},and(target_user_id.is.null,position.in.(${positions.map(p => `"${p}"`).join(",")}))`);

      if (error) throw error;
      return count || 0;
    },
    enabled: !!user,
  });
}

export function useCreateSwapRequest() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (request: {
      original_date: string;
      swap_date?: string | null;
      target_user_id?: string | null;
      position: string;
      team_id: string;
      message?: string | null;
      request_type?: SwapRequestType;
    }) => {
      const { data, error } = await supabase
        .from("swap_requests")
        .insert({
          requester_id: user!.id,
          original_date: request.original_date,
          swap_date: request.swap_date || null,
          target_user_id: request.target_user_id || null,
          position: request.position,
          team_id: request.team_id,
          message: request.message || null,
          request_type: request.request_type || "swap",
        })
        .select()
        .single();

      if (error) throw error;

      // Send push notification to relevant team members
      try {
        await supabase.functions.invoke("notify-swap-request-created", {
          body: { swapRequestId: data.id },
        });
      } catch (notifyError) {
        console.error("Failed to send swap request notification:", notifyError);
        // Don't throw - the swap was created successfully
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["swap-requests"] });
    },
  });
}

export function useRespondToSwapRequest() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      requestId,
      action,
    }: {
      requestId: string;
      action: "accept" | "decline" | "cancel";
    }) => {
      const updateData: Record<string, unknown> = {
        resolved_at: new Date().toISOString(),
      };

      if (action === "accept") {
        updateData.status = "accepted";
        updateData.accepted_by_id = user!.id;
      } else if (action === "decline") {
        updateData.status = "declined";
      } else if (action === "cancel") {
        updateData.status = "cancelled";
      }

      const { data, error } = await supabase
        .from("swap_requests")
        .update(updateData)
        .eq("id", requestId)
        .select()
        .single();

      if (error) throw error;

      // If accepted, send notification to campus pastors/leaders
      if (action === "accept") {
        try {
          await supabase.functions.invoke("notify-swap-confirmed", {
            body: { swapRequestId: requestId },
          });
        } catch (notifyError) {
          console.error("Failed to send swap notification:", notifyError);
          // Don't throw - the swap was successful, notification is secondary
        }
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["swap-requests"] });
      queryClient.invalidateQueries({ queryKey: ["swap-requests-count"] });
    },
  });
}

export function useDeleteSwapRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase
        .from("swap_requests")
        .delete()
        .eq("id", requestId);

      if (error) throw error;
    },
    onSuccess: () => {
      // Invalidate swap request queries
      queryClient.invalidateQueries({ queryKey: ["swap-requests"] });
      queryClient.invalidateQueries({ queryKey: ["swap-requests-count"] });
      // Invalidate team roster queries so schedule reverts to original
      queryClient.invalidateQueries({ queryKey: ["team-roster"] });
      queryClient.invalidateQueries({ queryKey: ["scheduled-team"] });
      queryClient.invalidateQueries({ queryKey: ["my-team-assignments"] });
      toast.success("Swap request deleted and schedule reverted");
    },
    onError: (error) => {
      console.error("Failed to delete swap request:", error);
      toast.error("Failed to delete swap request");
    },
  });
}

export function useDismissedSwapRequests() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["swap-request-dismissals", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("swap_request_dismissals")
        .select("swap_request_id")
        .eq("user_id", user!.id);

      if (error) throw error;
      return new Set(data?.map((d) => d.swap_request_id) || []);
    },
    enabled: !!user,
  });
}

export function useDismissSwapRequest() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase
        .from("swap_request_dismissals")
        .insert({
          swap_request_id: requestId,
          user_id: user!.id,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["swap-request-dismissals"] });
      queryClient.invalidateQueries({ queryKey: ["swap-requests-count"] });
      toast.success("Request dismissed");
    },
    onError: (error) => {
      console.error("Failed to dismiss swap request:", error);
      toast.error("Failed to dismiss request");
    },
  });
}

export interface PositionMember {
  id: string;
  user_id: string | null;
  member_name: string;
  position: string;
  team_id: string;
  worship_teams: { id: string; name: string } | null;
  isOnBreak?: boolean;
  gender?: string | null;
}

// Define vocalist positions for gender-based swap filtering
const VOCALIST_POSITIONS = ['vocalist', 'lead_vocals', 'harmony_vocals', 'background_vocals'];
const WEEKEND_MINISTRY_ALIASES = new Set(["weekend", "sunday_am", "weekend_team"]);

function ministriesMatchForSwap(memberMinistry: string, targetMinistry: string): boolean {
  if (!memberMinistry || !targetMinistry) return false;
  if (memberMinistry === targetMinistry) return true;
  if (WEEKEND_MINISTRY_ALIASES.has(memberMinistry) && WEEKEND_MINISTRY_ALIASES.has(targetMinistry)) {
    return true;
  }
  return false;
}

export function usePositionMembers(
  position: string,
  excludeUserId?: string,
  campusId?: string,
  rotationPeriodId?: string,
  ministryType?: string,
  requesterGender?: string | null,
  teamId?: string
) {
  // Check if this is a vocalist position - vocalists can swap across teams
  const isVocalist = VOCALIST_POSITIONS.includes(position);

  return useQuery({
    queryKey: [
      "position-members",
      position,
      excludeUserId,
      campusId,
      rotationPeriodId,
      ministryType,
      requesterGender,
      teamId,
    ],
    queryFn: async (): Promise<PositionMember[]> => {
      let query = supabase
        .from("team_members")
        .select(
          `
          id,
          user_id,
          member_name,
          position,
          team_id,
          rotation_period_id,
          ministry_types,
          worship_teams(id, name)
        `
        )
        .eq("position", position);

      if (excludeUserId) {
        query = query.neq("user_id", excludeUserId);
      }

      // Filter by team ONLY for non-vocalist positions
      // Vocalists can swap across teams within the same ministry/rotation
      if (teamId && !isVocalist) {
        query = query.eq("team_id", teamId);
      }

      // Filter by rotation period if provided
      if (rotationPeriodId) {
        query = query.eq("rotation_period_id", rotationPeriodId);
      }

      const { data: members, error } = await query;
      if (error) throw error;

      return await hydrateAndFilterMembers({
        members: (members as any[]) || [],
        campusId,
        rotationPeriodId,
        ministryType,
        requesterGender,
        position,
      });
    },
    enabled: !!position,
  });
}

/**
 * Returns members for a position that are eligible to swap for a specific date.
 *
 * Logic:
 * 1) Find teams scheduled on the requested date (and weekend pair) for the given ministry
 * 2) Return members in those teams with the given position
 * 3) Apply campus/rotation/ministry/gender/break filters
 */
export function usePositionMembersForDate(
  position: string,
  scheduledDate?: string,
  excludeUserId?: string,
  campusId?: string,
  rotationPeriodId?: string,
  ministryType?: string,
  requesterGender?: string | null
) {
  return useQuery({
    queryKey: [
      "position-members-for-date",
      position,
      scheduledDate,
      excludeUserId,
      campusId,
      rotationPeriodId,
      ministryType,
      requesterGender,
    ],
    queryFn: async (): Promise<PositionMember[]> => {
      if (!scheduledDate) return [];

      const dates = [scheduledDate];
      const pair = getWeekendPairDate(scheduledDate);
      if (pair) dates.push(pair);

      let scheduleQuery = supabase
        .from("team_schedule")
        .select("team_id, schedule_date, ministry_type")
        .in("schedule_date", dates);

      if (ministryType) {
        scheduleQuery = scheduleQuery.eq("ministry_type", ministryType);
      }

      const { data: scheduledTeams, error: scheduleError } = await scheduleQuery;
      if (scheduleError) throw scheduleError;

      const teamIds = Array.from(
        new Set((scheduledTeams || []).map((s: any) => s.team_id).filter(Boolean))
      );

      if (teamIds.length === 0) return [];

      let membersQuery = supabase
        .from("team_members")
        .select(
          `
          id,
          user_id,
          member_name,
          position,
          team_id,
          rotation_period_id,
          ministry_types,
          worship_teams(id, name)
        `
        )
        .eq("position", position)
        .in("team_id", teamIds);

      if (excludeUserId) {
        membersQuery = membersQuery.neq("user_id", excludeUserId);
      }

      if (rotationPeriodId) {
        membersQuery = membersQuery.eq("rotation_period_id", rotationPeriodId);
      }

      const { data: members, error: membersError } = await membersQuery;
      if (membersError) throw membersError;

      return await hydrateAndFilterMembers({
        members: (members as any[]) || [],
        campusId,
        rotationPeriodId,
        ministryType,
        requesterGender,
        position,
      });
    },
    enabled: !!position && !!scheduledDate,
  });
}

async function hydrateAndFilterMembers(args: {
  members: any[];
  campusId?: string;
  rotationPeriodId?: string;
  ministryType?: string;
  requesterGender?: string | null;
  position: string;
}): Promise<PositionMember[]> {
  const { members, campusId, rotationPeriodId, ministryType, requesterGender, position } = args;

  if (!members || members.length === 0) return [];

  // Get users who belong to this campus (if campusId provided)
  let filteredMembers = members;
  if (campusId) {
    const { data: campusUsers, error: campusError } = await supabase
      .from("user_campuses")
      .select("user_id")
      .eq("campus_id", campusId);

    if (campusError) throw campusError;

    const campusUserIds = new Set(campusUsers?.map((cu: any) => cu.user_id) || []);
    filteredMembers = members.filter((m) => m.user_id && campusUserIds.has(m.user_id));
  }

  // Filter by ministry type if provided
  if (ministryType) {
    filteredMembers = filteredMembers.filter((m) => {
      const memberMinistryTypes = (m as any).ministry_types || [];
      // Include if member has no ministry types set (legacy data) or matches
      return (
        memberMinistryTypes.length === 0 ||
        memberMinistryTypes.some((memberMinistry: string) =>
          ministriesMatchForSwap(memberMinistry, ministryType)
        )
      );
    });
  }

  // Get current active rotation period for the campus (for break checking)
  let activeRotationId = rotationPeriodId;
  if (!activeRotationId && campusId) {
    const { data: activeRotation } = await supabase
      .from("rotation_periods")
      .select("id")
      .eq("is_active", true)
      .eq("campus_id", campusId)
      .maybeSingle();
    activeRotationId = (activeRotation as any)?.id;
  }

  // Get approved break requests for the rotation period
  const userIds = filteredMembers.map((m) => m.user_id).filter(Boolean) as string[];

  let usersOnBreak = new Set<string>();
  if (activeRotationId && userIds.length > 0) {
    const { data: breakRequests } = await supabase
      .from("break_requests")
      .select("user_id")
      .eq("rotation_period_id", activeRotationId)
      .eq("status", "approved")
      .in("user_id", userIds);

    usersOnBreak = new Set((breakRequests || []).map((br: any) => br.user_id) || []);
  }

  // Get gender info for vocalist positions if requesterGender is provided
  let genderMap: Record<string, string | null> = {};
  const isVocalistPosition = VOCALIST_POSITIONS.includes(position);

  if (isVocalistPosition && userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, gender")
      .in("id", userIds);

    genderMap = (profiles || []).reduce((acc: Record<string, string | null>, p: any) => {
      acc[p.id] = (p as any).gender || null;
      return acc;
    }, {} as Record<string, string | null>);
  }

  // Add isOnBreak and gender flags, then filter by gender for vocalists
  let result: PositionMember[] = filteredMembers.map((m: any) => ({
    ...m,
    isOnBreak: m.user_id ? usersOnBreak.has(m.user_id) : false,
    gender: m.user_id ? genderMap[m.user_id] : null,
  }));

  // Filter by same gender for vocalist positions
  if (isVocalistPosition && requesterGender) {
    result = result.filter((m) => {
      // Include if same gender OR if gender not set (so they can still be shown with warning)
      return m.gender === requesterGender || !m.gender;
    });
  }

  return result;
}

/**
 * Returns members for a position that are eligible for fill-in/cover requests.
 * This is for direct cover requests where no swap date is needed.
 * Filters by campus to ensure only same-campus members are shown.
 */
export function usePositionMembersForCover(
  position: string,
  excludeUserId?: string,
  campusId?: string,
  rotationPeriodId?: string,
  ministryType?: string,
  requesterGender?: string | null
) {
  const isVocalistPosition = VOCALIST_POSITIONS.includes(position);
  const isWeekendLikeMinistry = !!ministryType && WEEKEND_MINISTRY_ALIASES.has(ministryType);

  return useQuery({
    queryKey: [
      "position-members-for-cover",
      position,
      excludeUserId,
      campusId,
      rotationPeriodId,
      ministryType,
      requesterGender,
    ],
    queryFn: async (): Promise<PositionMember[]> => {
      // For cover requests, we get all members with the same position
      // and then filter by campus/ministry/etc.
      let query = supabase
        .from("team_members")
        .select(
          `
          id,
          user_id,
          member_name,
          position,
          team_id,
          rotation_period_id,
          ministry_types,
          worship_teams(id, name)
        `
        )
        .eq("position", position);

      if (excludeUserId) {
        query = query.neq("user_id", excludeUserId);
      }

      // For vocalist cover requests on weekend ministries, allow candidates
      // across rotation periods within the campus/ministry (queue-wide visibility).
      if (rotationPeriodId && !(isVocalistPosition && isWeekendLikeMinistry)) {
        query = query.eq("rotation_period_id", rotationPeriodId);
      }

      const { data: members, error } = await query;
      if (error) throw error;

      return await hydrateAndFilterMembers({
        members: (members as any[]) || [],
        campusId,
        rotationPeriodId,
        ministryType,
        requesterGender,
        position,
      });
    },
    enabled: !!position,
  });
}

export function useUserScheduledDates(userId: string | undefined, teamId?: string) {
  return useQuery({
    // cache-bust key to ensure date parsing updates reflect immediately
    queryKey: ["user-scheduled-dates", "local-date-v1", userId, teamId],
    queryFn: async () => {
      // Get all teams the user is a member of
      const { data: memberData } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("user_id", userId!);

      const teamIds = memberData?.map((m) => m.team_id) || [];

      let query = supabase
        .from("team_schedule")
        .select("schedule_date, team_id, worship_teams(id, name)")
        .in("team_id", teamIds)
        .gte("schedule_date", new Date().toISOString().split("T")[0])
        .order("schedule_date", { ascending: true });

      if (teamId) {
        query = query.eq("team_id", teamId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });
}

/**
 * Fetch eligible recipients for an open swap request.
 * Returns members with the same position who share a campus with the requester.
 */
export function useOpenRequestRecipients(
  position: string | undefined,
  requesterId: string | undefined,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: ["open-request-recipients", position, requesterId],
    queryFn: async () => {
      if (!position || !requesterId) return [];

      // Get requester's campuses
      const { data: requesterCampuses, error: campusError } = await supabase
        .from("user_campuses")
        .select("campus_id")
        .eq("user_id", requesterId);

      if (campusError) throw campusError;

      const campusIds = requesterCampuses?.map((c) => c.campus_id) || [];
      if (campusIds.length === 0) return [];

      // Get users who share a campus with the requester
      const { data: sameCampusUsers, error: sameCampusError } = await supabase
        .from("user_campuses")
        .select("user_id")
        .in("campus_id", campusIds)
        .neq("user_id", requesterId);

      if (sameCampusError) throw sameCampusError;

      const sameCampusUserIds = [...new Set(sameCampusUsers?.map((u) => u.user_id) || [])];
      if (sameCampusUserIds.length === 0) return [];

      // Get team members with the same position who are in the same campus
      const { data: teamMembers, error: membersError } = await supabase
        .from("team_members")
        .select("user_id, member_name")
        .eq("position", position)
        .not("user_id", "is", null)
        .in("user_id", sameCampusUserIds);

      if (membersError) throw membersError;

      // Get unique user IDs
      const uniqueUserIds = [...new Set(teamMembers?.map((m) => m.user_id!).filter(Boolean) || [])];
      if (uniqueUserIds.length === 0) return [];

      // Fetch profiles for these users
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", uniqueUserIds);

      if (profilesError) throw profilesError;

      return profiles || [];
    },
    enabled: enabled && !!position && !!requesterId,
  });
}
