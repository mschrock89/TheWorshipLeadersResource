import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { resolveLiveAudience, type LiveModeAudience } from "@/lib/liveMode";

type LiveModeAccess = {
  canOpen: boolean;
  audience: LiveModeAudience | null;
  isLoading: boolean;
};

function onCampus(campusId: string | null | undefined, rowCampusId: string | null | undefined) {
  if (campusId === undefined) return true;
  if (!campusId || campusId === "network-wide") return false;
  return rowCampusId === campusId;
}

export function useLiveModeAccess(campusId?: string | null): LiveModeAccess {
  const { user, isAdmin, isProductionManager, isVideoDirector } = useAuth();
  const productionRole = isProductionManager;
  const videoRole = isVideoDirector && !isAdmin && !isProductionManager;
  const assignments = useQuery({
    queryKey: ["live-mode-access", user?.id],
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const [ministries, positions] = await Promise.all([
        supabase
          .from("user_ministry_campuses")
          .select("campus_id, ministry_type")
          .eq("user_id", user!.id),
        supabase
          .from("user_campus_ministry_positions")
          .select("campus_id, ministry_type, position")
          .eq("user_id", user!.id),
      ]);
      if (ministries.error) throw ministries.error;
      if (positions.error) throw positions.error;
      return [...(ministries.data || []), ...(positions.data || [])];
    },
  });

  const rows = (assignments.data || []).filter((row) => onCampus(campusId, row.campus_id));
  const audience: LiveModeAudience | null = assignments.isLoading && !productionRole && !videoRole
    ? null
    : resolveLiveAudience({
        isAdmin,
        isProductionManager: productionRole,
        isVideoDirector: videoRole,
        rows,
      });
  const waitingForAssignment = !!user?.id && !productionRole && !videoRole && assignments.isLoading;

  return {
    canOpen: audience !== null,
    audience,
    isLoading: waitingForAssignment,
  };
}

export function useCanOpenLiveMode(campusId?: string | null) {
  return useLiveModeAccess(campusId).canOpen;
}
