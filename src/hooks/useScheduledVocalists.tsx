import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { getWeekendPairDate, isWeekend } from "@/lib/utils";

export interface ScheduledVocalist {
  userId: string;
  name: string;
  avatarUrl: string | null;
  /** The vocal slot/position they are serving in (e.g. lead_vocals). */
  position: string;
  /** True if they are covering a swapped slot (i.e., swapped in). */
  isSwappedIn?: boolean;
}

const isVocalPosition = (pos: string) => {
  const lower = pos.toLowerCase();
  return lower.includes("vocal") || lower === "vocals";
};

export function useScheduledVocalists(
  targetDate: Date | null,
  ministryType: string,
  campusId: string | null
) {
  const dateStr = targetDate ? format(targetDate, "yyyy-MM-dd") : null;

  return useQuery({
    queryKey: ["scheduled-vocalists", dateStr, ministryType, campusId, "v2"],
    queryFn: async (): Promise<ScheduledVocalist[]> => {
      if (!dateStr || !campusId) return [];

      // Rotation period(s) for this campus covering this date
      const { data: rotationPeriods, error: rotationError } = await supabase
        .from("rotation_periods")
        .select("id")
        .eq("campus_id", campusId)
        .lte("start_date", dateStr)
        .gte("end_date", dateStr);

      if (rotationError) throw rotationError;

      const rotationPeriodIds = (rotationPeriods || []).map((rp) => rp.id);
      if (rotationPeriodIds.length === 0) return [];

      // Scheduled team for the date - prioritize campus-specific, fall back to shared template
      // First try to find a campus-specific schedule entry
      const { data: campusSpecificSchedule, error: campusScheduleError } = await supabase
        .from("team_schedule")
        .select("team_id")
        .eq("schedule_date", dateStr)
        .eq("campus_id", campusId)
        .maybeSingle();

      if (campusScheduleError) throw campusScheduleError;

      let teamId = campusSpecificSchedule?.team_id;

      // If no campus-specific entry, fall back to shared template (null campus_id)
      if (!teamId) {
        const { data: sharedSchedule, error: sharedScheduleError } = await supabase
          .from("team_schedule")
          .select("team_id")
          .eq("schedule_date", dateStr)
          .is("campus_id", null)
          .maybeSingle();

        if (sharedScheduleError) throw sharedScheduleError;
        teamId = sharedSchedule?.team_id;
      }

      if (!teamId) return [];

      // Fetch team members for the rotation period + ministry (matches the roster above)
      const { data: members, error: membersError } = await supabase
        .from("team_members")
        .select("id, member_name, position, user_id, rotation_period_id, ministry_types")
        .eq("team_id", teamId)
        .order("display_order");

      if (membersError) throw membersError;

      const filteredMembers = (members || []).filter((m) => {
        if (!m.rotation_period_id) return false;
        if (!rotationPeriodIds.includes(m.rotation_period_id)) return false;

        if (ministryType && m.ministry_types && m.ministry_types.length > 0) {
          return m.ministry_types.includes(ministryType);
        }

        return true;
      });

      // Build the list of dates to check for swaps.
      // For weekend services, swaps are treated as covering the full weekend.
      const datesToCheck = [dateStr];
      if (isWeekend(dateStr)) {
        const pairDate = getWeekendPairDate(dateStr);
        if (pairDate) datesToCheck.push(pairDate);
      }

      // Accepted swaps where someone is covering FOR this date (original_date matches)
      const { data: swapsForDate, error: swapsForDateError } = await supabase
        .from("swap_requests")
        .select(
          `
          requester_id,
          accepted_by_id,
          position,
          request_type,
          accepted_by:profiles!swap_requests_accepted_by_id_fkey(id, full_name, avatar_url)
        `
        )
        .in("original_date", datesToCheck)
        .eq("team_id", teamId)
        .eq("status", "accepted");

      if (swapsForDateError) throw swapsForDateError;

      // Accepted swaps where this date is the swap_date (requester covers accepter on swap_date)
      const { data: swapsOnDate, error: swapsOnDateError } = await supabase
        .from("swap_requests")
        .select(
          `
          requester_id,
          accepted_by_id,
          position,
          requester:profiles!swap_requests_requester_id_fkey(id, full_name, avatar_url)
        `
        )
        .in("swap_date", datesToCheck)
        .eq("status", "accepted")
        .not("swap_date", "is", null);

      if (swapsOnDateError) throw swapsOnDateError;

      // Filter swap_date swaps to only those where the accepter is on this team's roster
      const teamMemberUserIds = new Set(
        filteredMembers.map((m) => m.user_id).filter(Boolean) as string[]
      );
      const filteredSwapsOnDate = (swapsOnDate || []).filter(
        (swap) => swap.accepted_by_id && teamMemberUserIds.has(swap.accepted_by_id)
      );

      // Build swap maps keyed by "userId|position" for position-specific matching
      // For fill_in (cover) requests, we also track that the requester is OUT for ALL positions
      const swapMap = new Map<
        string,
        {
          acceptedById: string;
          acceptedByName: string;
          acceptedByAvatar: string | null;
          isCover: boolean;
        }
      >();
      const acceptersPositionSet = new Set<string>(); // "userId|position"
      // Track users who are completely covered (fill_in requests cover ALL their positions)
      const coveredUserIds = new Set<string>();
      // Map covered user -> accepter info (for fill_in requests)
      const coverMap = new Map<string, { acceptedById: string; acceptedByName: string; acceptedByAvatar: string | null }>();

      for (const swap of swapsForDate || []) {
        if (swap.requester_id && swap.accepted_by_id) {
          // If swap_date exists, treat as direct swap even if request_type is stale.
          const isDirectSwap = Boolean(swap.swap_date) || (swap as any).request_type === "swap";
          const isCover = !isDirectSwap;
          
          if (isCover) {
            // Cover request: requester is OUT for ALL their positions
            coveredUserIds.add(swap.requester_id);
            coverMap.set(swap.requester_id, {
              acceptedById: swap.accepted_by_id,
              acceptedByName: (swap.accepted_by as any)?.full_name || "Unknown",
              acceptedByAvatar: (swap.accepted_by as any)?.avatar_url || null,
            });
          }
          
          const key = `${swap.requester_id}|${swap.position}`;
          swapMap.set(key, {
            acceptedById: swap.accepted_by_id,
            acceptedByName: (swap.accepted_by as any)?.full_name || "Unknown",
            acceptedByAvatar: (swap.accepted_by as any)?.avatar_url || null,
            isCover,
          });
          acceptersPositionSet.add(`${swap.accepted_by_id}|${swap.position}`);
        }
      }

      const reverseSwapMap = new Map<
        string,
        {
          requesterId: string;
          requesterName: string;
          requesterAvatar: string | null;
        }
      >();
      const requestersCoveringPositionSet = new Set<string>(); // "userId|position"

      for (const swap of filteredSwapsOnDate) {
        if (swap.requester_id && swap.accepted_by_id) {
          const key = `${swap.accepted_by_id}|${swap.position}`;
          reverseSwapMap.set(key, {
            requesterId: swap.requester_id,
            requesterName: (swap.requester as any)?.full_name || "Unknown",
            requesterAvatar: (swap.requester as any)?.avatar_url || null,
          });
          requestersCoveringPositionSet.add(`${swap.requester_id}|${swap.position}`);
        }
      }

      const swappedOutPositions = new Set<string>(swapMap.keys()); // "userId|position"
      const coveredByRequesterPositions = new Set<string>(reverseSwapMap.keys()); // "userId|position"
      const addedViaSwap = new Set<string>(); // "userId|position"

      const rosterEntries: Array<{
        userId: string;
        name: string;
        avatarUrl: string | null;
        position: string;
        isSwappedIn: boolean;
      }> = [];

      for (const member of filteredMembers) {
        if (!member.user_id) continue;

        const memberPositionKey = `${member.user_id}|${member.position}`;
        const swap = swapMap.get(memberPositionKey);
        const reverseSwap = reverseSwapMap.get(memberPositionKey);
        
        // Check if this member is completely covered (fill_in request covers ALL their positions)
        const isCoveredUser = coveredUserIds.has(member.user_id);
        const coverInfo = coverMap.get(member.user_id);

        if (isCoveredUser && coverInfo) {
          // This member is covered by a fill_in request - show the accepter for ALL their positions
          const swapKey = `${coverInfo.acceptedById}|${member.position}`;
          if (!addedViaSwap.has(swapKey)) {
            rosterEntries.push({
              userId: coverInfo.acceptedById,
              name: coverInfo.acceptedByName,
              avatarUrl: coverInfo.acceptedByAvatar,
              position: member.position,
              isSwappedIn: true,
            });
            addedViaSwap.add(swapKey);
          }
        } else if (swap && !swap.isCover) {
          // requester is OUT for this position via position-specific swap (not cover); accepter is IN
          const swapKey = `${swap.acceptedById}|${member.position}`;
          if (!addedViaSwap.has(swapKey)) {
            rosterEntries.push({
              userId: swap.acceptedById,
              name: swap.acceptedByName,
              avatarUrl: swap.acceptedByAvatar,
              position: member.position,
              isSwappedIn: true,
            });
            addedViaSwap.add(swapKey);
          }
        } else if (reverseSwap) {
          // accepter is OUT on swap_date for this position; requester is IN
          const swapKey = `${reverseSwap.requesterId}|${member.position}`;
          if (!addedViaSwap.has(swapKey)) {
            rosterEntries.push({
              userId: reverseSwap.requesterId,
              name: reverseSwap.requesterName,
              avatarUrl: reverseSwap.requesterAvatar,
              position: member.position,
              isSwappedIn: true,
            });
            addedViaSwap.add(swapKey);
          }
        } else if (acceptersPositionSet.has(memberPositionKey)) {
          // Accepted a swap for this position — skip their own slot
          continue;
        } else if (requestersCoveringPositionSet.has(memberPositionKey)) {
          // Covering someone else on swap_date for this position — skip their slot
          continue;
        } else if (swappedOutPositions.has(memberPositionKey)) {
          // Swapped out for this position — skip this slot
          continue;
        } else if (coveredByRequesterPositions.has(memberPositionKey)) {
          continue;
        } else {
          rosterEntries.push({
            userId: member.user_id,
            name: member.member_name,
            avatarUrl: null,
            position: member.position,
            isSwappedIn: false,
          });
        }
      }

      // Fetch profiles to replace member_name with full_name + get avatars (for everyone in rosterEntries)
      const userIds = [...new Set(rosterEntries.map((r) => r.userId))];
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", userIds.length > 0 ? userIds : ["00000000-0000-0000-0000-000000000000"]);

      if (profilesError) throw profilesError;

      const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

      // Keep only vocal slots; de-dupe by userId
      const vocalistsMap = new Map<string, ScheduledVocalist>();
      for (const entry of rosterEntries) {
        if (!isVocalPosition(entry.position)) continue;

        const p = profileMap.get(entry.userId);
        if (!vocalistsMap.has(entry.userId)) {
          vocalistsMap.set(entry.userId, {
            userId: entry.userId,
            name: p?.full_name || entry.name,
            avatarUrl: p?.avatar_url || entry.avatarUrl,
            position: entry.position,
            isSwappedIn: entry.isSwappedIn,
          });
        }
      }

      return Array.from(vocalistsMap.values());
    },
    enabled: !!dateStr && !!campusId,
  });
}
