import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { hasProductionLiveAssignment } from "@/lib/liveMode";

export function useCanOpenLiveMode() {
  const { user, isProductionManager } = useAuth();
  const assignments = useQuery({
    queryKey: ["live-mode-access", user?.id],
    enabled: !!user?.id && !isProductionManager,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const [ministries, positions] = await Promise.all([
        supabase
          .from("user_ministry_campuses")
          .select("ministry_type")
          .eq("user_id", user!.id),
        supabase
          .from("user_campus_ministry_positions")
          .select("ministry_type, position")
          .eq("user_id", user!.id),
      ]);
      if (ministries.error) throw ministries.error;
      if (positions.error) throw positions.error;
      return hasProductionLiveAssignment([...(ministries.data || []), ...(positions.data || [])]);
    },
  });

  return isProductionManager || assignments.data === true;
}
