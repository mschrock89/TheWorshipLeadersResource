import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { getWeekendPairDate } from "@/lib/utils";

interface SwapInfo {
  id: string;
  original_date: string;
  swap_date: string | null;
  requester_id: string;
  accepted_by_id: string | null;
  position: string;
  team_id: string;
  worship_teams: {
    id: string;
    name: string;
    color: string;
    icon: string;
  } | null;
}

interface UserSwapsData {
  /** Dates the user has swapped OUT of (they are not playing) */
  swappedOutDates: Set<string>;
  /** Dates the user has swapped IN to (they are covering for someone), with details */
  swappedInDates: Map<string, SwapInfo>;
}

/**
 * Fetch all accepted swaps for the current user.
 * Returns sets of dates they've swapped out of and into.
 */
export function useUserSwaps() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["user-swaps-all", user?.id],
    queryFn: async (): Promise<UserSwapsData> => {
      if (!user?.id) {
        return { swappedOutDates: new Set(), swappedInDates: new Map() };
      }

      // Fetch all accepted swaps where user is the requester (swapped OUT of original_date, swapped IN to swap_date)
      const { data: swapsAsRequester, error: requesterError } = await supabase
        .from("swap_requests")
        .select(`
          id, 
          original_date, 
          swap_date, 
          requester_id, 
          accepted_by_id, 
          position, 
          team_id,
          worship_teams(id, name, color, icon)
        `)
        .eq("requester_id", user.id)
        .eq("status", "accepted");

      if (requesterError) throw requesterError;

      // Fetch all accepted swaps where user is the accepter (swapped IN to original_date)
      const { data: swapsAsAccepter, error: accepterError } = await supabase
        .from("swap_requests")
        .select(`
          id, 
          original_date, 
          swap_date, 
          requester_id, 
          accepted_by_id, 
          position, 
          team_id,
          worship_teams(id, name, color, icon)
        `)
        .eq("accepted_by_id", user.id)
        .eq("status", "accepted");

      if (accepterError) throw accepterError;

      // Build set of dates user has swapped OUT of (including weekend pair dates)
      const swappedOutDates = new Set<string>();
      for (const swap of swapsAsRequester || []) {
        swappedOutDates.add(swap.original_date);
        // Also add the weekend pair date
        const pairDate = getWeekendPairDate(swap.original_date);
        if (pairDate) swappedOutDates.add(pairDate);
      }

      // Build map of dates user has swapped IN to (including weekend pair dates)
      const swappedInDates = new Map<string, SwapInfo>();
      
      // As requester: if there's a swap_date, user is swapped IN to that date
      for (const swap of swapsAsRequester || []) {
        if (swap.swap_date) {
          const swapInfo = swap as SwapInfo;
          swappedInDates.set(swap.swap_date, swapInfo);
          const pairDate = getWeekendPairDate(swap.swap_date);
          if (pairDate) swappedInDates.set(pairDate, swapInfo);
        }
      }
      
      // As accepter: user is swapped IN to the original_date
      for (const swap of swapsAsAccepter || []) {
        const swapInfo = swap as SwapInfo;
        swappedInDates.set(swap.original_date, swapInfo);
        // Also add the weekend pair date
        const pairDate = getWeekendPairDate(swap.original_date);
        if (pairDate) swappedInDates.set(pairDate, swapInfo);
      }

      return {
        swappedOutDates,
        swappedInDates,
      };
    },
    enabled: !!user?.id,
  });
}

/**
 * Check swap status for a specific date using the cached swaps data.
 */
export function getSwapStatusForDate(
  dateStr: string,
  swapsData: UserSwapsData | undefined
): { swappedOut: boolean; swappedIn: boolean; swapInDetails: SwapInfo | null } {
  if (!swapsData) {
    return { swappedOut: false, swappedIn: false, swapInDetails: null };
  }

  const swappedOut = swapsData.swappedOutDates.has(dateStr);
  const swapInDetails = swapsData.swappedInDates.get(dateStr) || null;
  const swappedIn = !!swapInDetails;

  return { swappedOut, swappedIn, swapInDetails };
}
