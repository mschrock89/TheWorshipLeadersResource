import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserCampuses } from "@/hooks/useCampuses";
import { isWeekend, getWeekendPairDate, sortPositionsByPriority } from "@/lib/utils";
export interface RosterMember {
  id: string;
  memberName: string;
  positions: string[];
  positionSlots: string[]; // eg_1, eg_2, ag_1, etc. for proper display labels
  userId: string | null;
  avatarUrl: string | null;
  isSwapped: boolean;
  hasPendingSwap: boolean;
  originalMemberName?: string;
  ministryTypes: string[];
  serviceDay: string | null;
}

export function useTeamRosterForDate(date: Date | null, teamId?: string, ministryType?: string, campusId?: string) {
  const { user } = useAuth();
  const { data: userCampuses = [] } = useUserCampuses(user?.id);
  
  // If campusId is provided, we use it for filtering rotation periods
  // However, if we have a specific teamId, we should be more permissive and use all user campuses
  // to ensure we can see the full roster even if campus filter is set differently
  const userCampusIds = userCampuses.map(uc => uc.campus_id);
  
  // For rotation period filtering, use campusId if provided, otherwise all user campuses
  const rotationCampusIds = campusId ? [campusId] : userCampusIds;
  
  const dateStr = date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}` : null;

  return useQuery({
    queryKey: ["team-roster-for-date", dateStr, teamId, campusId || userCampusIds, ministryType, "v7"],
    queryFn: async () => {
      if (!dateStr || !teamId) return [];

      // If no campuses to filter by, return empty
      if (userCampusIds.length === 0) return [];

      // First, find the rotation period that covers this date
      // Use rotationCampusIds (filtered by campusId if provided, otherwise all user campuses)
      const campusIdsToFilter = campusId ? [campusId] : userCampusIds;
      
      const { data: rotationPeriods, error: rotationError } = await supabase
        .from("rotation_periods")
        .select("id, campus_id")
        .lte("start_date", dateStr)
        .gte("end_date", dateStr)
        .in("campus_id", campusIdsToFilter);

      if (rotationError) throw rotationError;

      // Get rotation period IDs that apply (only from the filtered campus)
      const rotationPeriodIds = (rotationPeriods || []).map(rp => rp.id);
      
      // Create a set of valid rotation period IDs for quick lookup
      const validRotationPeriodIdSet = new Set(rotationPeriodIds);

      // Fetch team members for this team
      const { data: members, error: membersError } = await supabase
        .from("team_members")
        .select("id, member_name, position, position_slot, user_id, rotation_period_id, ministry_types, service_day")
        .eq("team_id", teamId)
        .order("display_order");

      if (membersError) throw membersError;

      // Filter members by rotation period (must be in the campus-filtered rotation periods)
      // and optionally by ministry type
      const filteredMembers = (members || []).filter(m => {
        // Must have a rotation period that matches our campus-filtered periods
        if (!m.rotation_period_id) return false;
        if (!validRotationPeriodIdSet.has(m.rotation_period_id)) return false;
        
        // If ministryType is specified, filter by ministry_types array
        if (ministryType && m.ministry_types) {
          // Special handling for "weekend_team" - includes weekend, production, and video
          if (ministryType === 'weekend_team') {
            const weekendTeamMinistries = ['weekend', 'production', 'video'];
            return m.ministry_types.some(mt => weekendTeamMinistries.includes(mt));
          }
          return m.ministry_types.includes(ministryType);
        }
        
        return true;
      });

      // Get user IDs to fetch their profiles
      const userIds = filteredMembers.filter(m => m.user_id).map(m => m.user_id!);
      
      // Fetch profiles for avatars
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, avatar_url")
        .in("id", userIds.length > 0 ? userIds : ['00000000-0000-0000-0000-000000000000']);

      const profileMap = new Map((profiles || []).map(p => [p.id, p.avatar_url]));

      // Build the list of dates to check for swaps
      // For weekends, check both Saturday and Sunday since a swap covers the full weekend
      const datesToCheck = [dateStr];
      if (isWeekend(dateStr)) {
        const pairDate = getWeekendPairDate(dateStr);
        if (pairDate) {
          datesToCheck.push(pairDate);
        }
      }

      // Fetch accepted swaps where someone is covering FOR this date (original_date matches)
      const { data: swapsForDate, error: swapsForDateError } = await supabase
        .from("swap_requests")
        .select(`
          id,
          requester_id,
          accepted_by_id,
          position,
          swap_date,
          request_type,
          requester:profiles!swap_requests_requester_id_fkey(full_name, avatar_url),
          accepted_by:profiles!swap_requests_accepted_by_id_fkey(full_name, avatar_url)
        `)
        .in("original_date", datesToCheck)
        .eq("team_id", teamId)
        .eq("status", "accepted");

      if (swapsForDateError) throw swapsForDateError;

      // Fetch accepted swaps where someone is covering ON this date via swap_date (direct swaps)
      // This handles the case where requester covers accepter's slot on swap_date
      // Don't filter by team_id here - we need to find swaps where the accepter is a member of this team
      // We'll filter by accepter's user_id being in this team's roster
      const { data: swapsOnDate, error: swapsOnDateError } = await supabase
        .from("swap_requests")
        .select(`
          id,
          requester_id,
          accepted_by_id,
          position,
          original_date,
          requester:profiles!swap_requests_requester_id_fkey(full_name, avatar_url),
          accepted_by:profiles!swap_requests_accepted_by_id_fkey(full_name, avatar_url)
        `)
        .in("swap_date", datesToCheck)
        .eq("status", "accepted");

      if (swapsOnDateError) throw swapsOnDateError;

      // Filter swapsOnDate to only those where the accepter is on this team
      const teamMemberUserIds = new Set(filteredMembers.map(m => m.user_id).filter(Boolean));
      const filteredSwapsOnDate = (swapsOnDate || []).filter(swap => 
        swap.accepted_by_id && teamMemberUserIds.has(swap.accepted_by_id)
      );

      const swaps = swapsForDate || [];
      const directSwapsOnThisDate = filteredSwapsOnDate;

      // Fetch pending swaps for this date (or weekend pair)
      const { data: pendingSwaps, error: pendingSwapsError } = await supabase
        .from("swap_requests")
        .select("requester_id")
        .in("original_date", datesToCheck)
        .eq("team_id", teamId)
        .eq("status", "pending");

      if (pendingSwapsError) throw pendingSwapsError;

      // Build set of users with pending swap requests
      const pendingSwapUsers = new Set<string>(
        (pendingSwaps || []).map(s => s.requester_id).filter(Boolean)
      );

      // Build swap map: "requester_id|position" -> accepted_by info (for original_date swaps)
      // This means: requester is OUT for this specific position, accepter is IN
      // Key by user_id + position to correctly handle multiple positions per user
      // For fill_in (cover) requests, we'll also track that the requester is OUT for ALL positions
      const swapMap = new Map<string, { acceptedById: string; acceptedByName: string; acceptedByAvatar: string | null; position: string; isCover: boolean }>();
      // Track which users have accepted swaps for which positions
      const acceptersPositionSet = new Set<string>(); // "userId|position"
      // Track users who are completely covered (fill_in requests cover ALL their positions)
      const coveredUserIds = new Set<string>();
      // Map covered user -> accepter info (for fill_in requests)
      const coverMap = new Map<string, { acceptedById: string; acceptedByName: string; acceptedByAvatar: string | null }>();
      
      for (const swap of swaps) {
        if (swap.requester_id && swap.accepted_by_id) {
          // Type assertion for request_type since it's included in the select
          const swapWithType = swap as typeof swap & { request_type?: string };
          // If swap_date exists, this is a direct swap even if legacy data marked request_type incorrectly.
          const isDirectSwap = Boolean(swap.swap_date) || swapWithType.request_type === "swap";
          const isCover = !isDirectSwap;

          if (isCover) {
            // Cover request: requester is OUT for ALL their positions, accepter takes over ALL
            coveredUserIds.add(swap.requester_id);
            coverMap.set(swap.requester_id, {
              acceptedById: swap.accepted_by_id,
              acceptedByName: swap.accepted_by?.full_name || "Unknown",
              acceptedByAvatar: swap.accepted_by?.avatar_url || null,
            });
          }
          
          // Still add to swapMap for position-specific tracking
          const key = `${swap.requester_id}|${swap.position}`;
          swapMap.set(key, {
            acceptedById: swap.accepted_by_id,
            acceptedByName: swap.accepted_by?.full_name || "Unknown",
            acceptedByAvatar: swap.accepted_by?.avatar_url || null,
            position: swap.position,
            isCover,
          });
          acceptersPositionSet.add(`${swap.accepted_by_id}|${swap.position}`);
        }
      }

      // Build reverse swap map for direct swaps where this date is the swap_date
      // Key by "accepter_id|position" - accepter is OUT on swap_date, requester covers their position
      const reverseSwapMap = new Map<string, { requesterId: string; requesterName: string; requesterAvatar: string | null; position: string }>();
      const requestersCoveringPositionSet = new Set<string>(); // "userId|position"
      
      for (const swap of directSwapsOnThisDate) {
        if (swap.requester_id && swap.accepted_by_id) {
          const key = `${swap.accepted_by_id}|${swap.position}`;
          reverseSwapMap.set(key, {
            requesterId: swap.requester_id,
            requesterName: swap.requester?.full_name || "Unknown",
            requesterAvatar: swap.requester?.avatar_url || null,
            position: swap.position,
          });
          requestersCoveringPositionSet.add(`${swap.requester_id}|${swap.position}`);
        }
      }

      // Build a map from member id to ministry types for lookup
      const memberMinistryMap = new Map<string, string[]>();
      for (const m of filteredMembers) {
        memberMinistryMap.set(m.id, m.ministry_types || []);
      }

      // Build intermediate roster with swap replacements
      // Exclude the accepter's own slot since they're covering someone else's slot
      const intermediateRoster: Array<{
        id: string;
        memberName: string;
        position: string;
        positionSlot: string | null;
        userId: string | null;
        avatarUrl: string | null;
        isSwapped: boolean;
        hasPendingSwap: boolean;
        originalMemberName?: string;
        ministryTypes: string[];
        serviceDay: string | null;
      }> = [];

      // Track users+positions who have been added via swap replacement to avoid duplicates
      const addedViaSwap = new Set<string>(); // "userId|position|ministryType" - now includes ministry for proper grouping
      // Track requesters+positions who have been swapped out (they shouldn't appear in those slots)
      const swappedOutPositions = new Set<string>(swapMap.keys()); // "userId|position"
      // Track accepters+positions being covered on swap_date
      const coveredByRequesterPositions = new Set<string>(reverseSwapMap.keys()); // "userId|position"
      
      // For "All Ministries" mode, collect all ministry types for each covered user+position
      // This ensures the cover appears in all ministry groupings the original member had
      const coveredPositionMinistries = new Map<string, Set<string>>(); // "userId|position" -> Set of ministry types
      if (!ministryType) {
        for (const member of filteredMembers) {
          if (member.user_id && coveredUserIds.has(member.user_id)) {
            const posKey = `${member.user_id}|${member.position}`;
            if (!coveredPositionMinistries.has(posKey)) {
              coveredPositionMinistries.set(posKey, new Set());
            }
            for (const mt of (member.ministry_types || [])) {
              coveredPositionMinistries.get(posKey)!.add(mt);
            }
          }
        }
      }

      for (const member of filteredMembers) {
        const memberPositionKey = member.user_id ? `${member.user_id}|${member.position}` : null;
        const swap = memberPositionKey ? swapMap.get(memberPositionKey) : null;
        const reverseSwap = memberPositionKey ? reverseSwapMap.get(memberPositionKey) : null;
        
        // Check if this member is completely covered (fill_in request covers ALL their positions)
        const isCoveredUser = member.user_id && coveredUserIds.has(member.user_id);
        const coverInfo = member.user_id ? coverMap.get(member.user_id) : null;
        
        if (isCoveredUser && coverInfo) {
          // This member is covered by a fill_in request - show the accepter for ALL their positions
          // IMPORTANT: Use the ORIGINAL member's ministry context so the replacement appears
          // in the same ministry filter (e.g., if filtering by "weekend", the cover shows there)
          const posKey = `${member.user_id}|${member.position}`;
          
          if (ministryType) {
            // Specific ministry filter - add one entry with that ministry type
            const swapKey = `${coverInfo.acceptedById}|${member.position}|${ministryType}`;
            if (!addedViaSwap.has(swapKey)) {
              intermediateRoster.push({
                id: member.id,
                memberName: coverInfo.acceptedByName,
                position: member.position,
                positionSlot: member.position_slot || null,
                userId: coverInfo.acceptedById,
                avatarUrl: coverInfo.acceptedByAvatar,
                isSwapped: true,
                hasPendingSwap: false,
                originalMemberName: member.member_name,
                ministryTypes: [ministryType],
                serviceDay: member.service_day || null,
              });
              addedViaSwap.add(swapKey);
            }
          } else {
            // "All Ministries" mode - add entries for ALL ministry types the original member had
            const allMinistries = coveredPositionMinistries.get(posKey) || new Set(member.ministry_types || []);
            for (const mt of allMinistries) {
              const swapKey = `${coverInfo.acceptedById}|${member.position}|${mt}`;
              if (!addedViaSwap.has(swapKey)) {
                intermediateRoster.push({
                  id: member.id,
                  memberName: coverInfo.acceptedByName,
                  position: member.position,
                  positionSlot: member.position_slot || null,
                  userId: coverInfo.acceptedById,
                  avatarUrl: coverInfo.acceptedByAvatar,
                  isSwapped: true,
                  hasPendingSwap: false,
                  originalMemberName: member.member_name,
                  ministryTypes: [mt],
                  serviceDay: member.service_day || null,
                });
                addedViaSwap.add(swapKey);
              }
            }
          }
        } else if (swap && !swap.isCover) {
          // This member is swapped out via position-specific swap (not cover) - show the accepter instead
          const swapKey = `${swap.acceptedById}|${member.position}`;
          if (!addedViaSwap.has(swapKey)) {
            intermediateRoster.push({
              id: member.id,
              memberName: swap.acceptedByName,
              position: member.position,
              positionSlot: member.position_slot || null,
              userId: swap.acceptedById,
              avatarUrl: swap.acceptedByAvatar,
              isSwapped: true,
              hasPendingSwap: false,
              originalMemberName: member.member_name,
              ministryTypes: member.ministry_types || [],
              serviceDay: member.service_day || null,
            });
            addedViaSwap.add(swapKey);
          }
        } else if (reverseSwap) {
          // This member is being covered by requester on swap_date - show the requester instead
          const swapKey = `${reverseSwap.requesterId}|${member.position}`;
          if (!addedViaSwap.has(swapKey)) {
            intermediateRoster.push({
              id: member.id,
              memberName: reverseSwap.requesterName,
              position: member.position,
              positionSlot: member.position_slot || null,
              userId: reverseSwap.requesterId,
              avatarUrl: reverseSwap.requesterAvatar,
              isSwapped: true,
              hasPendingSwap: false,
              originalMemberName: member.member_name,
              ministryTypes: member.ministry_types || [],
              serviceDay: member.service_day || null,
            });
            addedViaSwap.add(swapKey);
          }
        } else if (memberPositionKey && acceptersPositionSet.has(memberPositionKey)) {
          // This member accepted a swap for this position - skip their own slot (they're covering someone else)
          continue;
        } else if (memberPositionKey && requestersCoveringPositionSet.has(memberPositionKey)) {
          // This member is covering someone else on swap_date for this position - skip their slot
          continue;
        } else if (memberPositionKey && swappedOutPositions.has(memberPositionKey)) {
          // This member+position was swapped out - skip this slot
          continue;
        } else if (memberPositionKey && coveredByRequesterPositions.has(memberPositionKey)) {
          // This member+position is being covered by requester - already handled above
          continue;
        } else {
          intermediateRoster.push({
            id: member.id,
            memberName: member.member_name,
            position: member.position,
            positionSlot: member.position_slot || null,
            userId: member.user_id,
            avatarUrl: member.user_id ? profileMap.get(member.user_id) || null : null,
            isSwapped: false,
            hasPendingSwap: member.user_id ? pendingSwapUsers.has(member.user_id) : false,
            originalMemberName: undefined,
            ministryTypes: member.ministry_types || [],
            serviceDay: member.service_day || null,
          });
        }
      }

      // Group by member name + userId AND ministry type to consolidate positions
      // We use the first ministry type from the entry as the grouping key
      // This ensures positions from different ministries are NOT merged together
      const memberMap = new Map<string, RosterMember>();
      
      for (const entry of intermediateRoster) {
        // Create a composite key: userId (or name) + primary ministry type
        // This ensures the same user with different ministry assignments is kept separate
        const primaryMinistry = entry.ministryTypes[0] || 'unknown';
        const baseKey = entry.userId || entry.memberName;
        const key = `${baseKey}__${primaryMinistry}`;
        
        const existing = memberMap.get(key);
        
        if (existing) {
          // Add position if not already included (case-insensitive check)
          // Only merge positions from the same ministry context
          const posLower = entry.position.toLowerCase();
          if (!existing.positions.some(p => p.toLowerCase() === posLower)) {
            existing.positions.push(entry.position);
          }
          // Add position slot if available and not already included
          if (entry.positionSlot && !existing.positionSlots.includes(entry.positionSlot)) {
            existing.positionSlots.push(entry.positionSlot);
          }
          // If any entry is swapped, mark as swapped
          if (entry.isSwapped) {
            existing.isSwapped = true;
            existing.originalMemberName = entry.originalMemberName;
          }
          // If any entry has pending swap, mark it
          if (entry.hasPendingSwap) {
            existing.hasPendingSwap = true;
          }
        } else {
          memberMap.set(key, {
            id: entry.id,
            memberName: entry.memberName,
            positions: [entry.position],
            positionSlots: entry.positionSlot ? [entry.positionSlot] : [],
            userId: entry.userId,
            avatarUrl: entry.avatarUrl,
            isSwapped: entry.isSwapped,
            hasPendingSwap: entry.hasPendingSwap,
            originalMemberName: entry.originalMemberName,
            ministryTypes: [...entry.ministryTypes],
            serviceDay: entry.serviceDay,
          });
        }
      }

      // Sort positions by priority (vocalist first) for each member
      const result = Array.from(memberMap.values()).map(member => ({
        ...member,
        positions: sortPositionsByPriority(member.positions),
      }));

      return result;
    },
    enabled: !!dateStr && !!teamId && userCampusIds.length > 0,
  });
}
