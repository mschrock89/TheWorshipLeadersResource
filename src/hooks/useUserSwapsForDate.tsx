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

interface UserSwapStatus {
  /** User has swapped OUT of this date (they are not playing) */
  swappedOut: boolean;
  /** User has swapped IN to this date (they are covering for someone) */
  swappedIn: boolean;
  /** Details of the swap if swapped in */
  swapInDetails: SwapInfo | null;
}

/**
 * Check if the current user has any accepted swaps affecting a specific date.
 * This handles both:
 * - User swapping OUT (they created a swap request that was accepted)
 * - User swapping IN (they accepted someone else's swap request)
 */
export function useUserSwapsForDate(date: Date | null) {
  const { user } = useAuth();
  
  const dateStr = date
    ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
    : null;

  return useQuery({
    queryKey: ["user-swaps-for-date", user?.id, dateStr],
    queryFn: async (): Promise<UserSwapStatus> => {
      if (!user?.id || !dateStr) {
        return { swappedOut: false, swappedIn: false, swapInDetails: null };
      }

      // Get weekend pair date for checking swaps that cover the whole weekend
      const weekendDates = [dateStr];
      const pairDate = getWeekendPairDate(dateStr);
      if (pairDate) weekendDates.push(pairDate);

      // Check if user has SWAPPED OUT (they are requester of an accepted swap for this date or weekend)
      const { data: swapsOut, error: outError } = await supabase
        .from("swap_requests")
        .select("id, original_date, swap_date, requester_id, accepted_by_id, position, team_id")
        .eq("requester_id", user.id)
        .eq("status", "accepted")
        .in("original_date", weekendDates);

      if (outError) throw outError;

      // Check if user has SWAPPED IN (they accepted someone else's swap for this date or weekend)
      const { data: swapsIn, error: inError } = await supabase
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
        .eq("status", "accepted")
        .in("original_date", weekendDates);

      if (inError) throw inError;

      const swappedOut = (swapsOut || []).length > 0;
      const swappedIn = (swapsIn || []).length > 0;
      const swapInDetails = swapsIn?.[0] as SwapInfo | null;

      return {
        swappedOut,
        swappedIn,
        swapInDetails,
      };
    },
    enabled: !!user?.id && !!dateStr,
  });
}
