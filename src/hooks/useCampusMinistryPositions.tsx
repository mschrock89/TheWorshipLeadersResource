import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CampusMinistryPosition {
  id: string;
  user_id: string;
  campus_id: string;
  ministry_type: string;
  position: string;
  created_at: string;
}

// Fetch all positions for a user grouped by campus and ministry
export function useUserCampusMinistryPositions(userId: string | undefined) {
  return useQuery({
    queryKey: ["user-campus-ministry-positions", userId],
    queryFn: async () => {
      if (!userId) return [];
      
      const { data, error } = await supabase
        .from("user_campus_ministry_positions")
        .select("*")
        .eq("user_id", userId);
      
      if (error) throw error;
      return data as CampusMinistryPosition[];
    },
    enabled: !!userId,
  });
}

// Toggle a single position for a specific campus+ministry combination
export function useToggleCampusMinistryPosition() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({
      userId,
      campusId,
      ministryType,
      position,
      isActive,
    }: {
      userId: string;
      campusId: string;
      ministryType: string;
      position: string;
      isActive: boolean;
    }) => {
      if (isActive) {
        // Remove the position
        const { error } = await supabase
          .from("user_campus_ministry_positions")
          .delete()
          .eq("user_id", userId)
          .eq("campus_id", campusId)
          .eq("ministry_type", ministryType)
          .eq("position", position);
        
        if (error) throw error;
      } else {
        // Add the position
        const { error } = await supabase
          .from("user_campus_ministry_positions")
          .insert({
            user_id: userId,
            campus_id: campusId,
            ministry_type: ministryType,
            position: position,
          });
        
        if (error) throw error;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: ["user-campus-ministry-positions", variables.userId] 
      });
      queryClient.invalidateQueries({ 
        queryKey: ["available-members"] 
      });
      queryClient.invalidateQueries({ 
        queryKey: ["available-members-campus-ministry"] 
      });
    },
  });
}

// Get positions for a specific user+campus+ministry combination
export function usePositionsForCampusMinistry(
  userId: string | undefined,
  campusId: string | undefined,
  ministryType: string | undefined
) {
  const { data: allPositions = [] } = useUserCampusMinistryPositions(userId);
  
  return allPositions
    .filter(p => p.campus_id === campusId && p.ministry_type === ministryType)
    .map(p => p.position);
}

// Get grouped positions structure for UI
export function useGroupedCampusMinistryPositions(userId: string | undefined) {
  const { data: positions = [], isLoading } = useUserCampusMinistryPositions(userId);
  
  // Group by campus_id -> ministry_type -> positions[]
  const grouped: Record<string, Record<string, string[]>> = {};
  
  positions.forEach(p => {
    if (!grouped[p.campus_id]) {
      grouped[p.campus_id] = {};
    }
    if (!grouped[p.campus_id][p.ministry_type]) {
      grouped[p.campus_id][p.ministry_type] = [];
    }
    if (!grouped[p.campus_id][p.ministry_type].includes(p.position)) {
      grouped[p.campus_id][p.ministry_type].push(p.position);
    }
  });
  
  return { grouped, isLoading };
}

// Fetch available members for a campus+ministry with their positions
export function useAvailableMembersWithPositions(
  campusId: string | undefined,
  ministryType: string | undefined
) {
  return useQuery({
    queryKey: ["available-members-with-positions", campusId, ministryType],
    queryFn: async () => {
      if (!campusId) return [];
      
      // Query users who have positions for this campus+ministry combination
      let query = supabase
        .from("user_campus_ministry_positions")
        .select(`
          user_id,
          position,
          campus_id,
          ministry_type,
          profiles!inner (
            id,
            full_name,
            avatar_url
          )
        `)
        .eq("campus_id", campusId);
      
      if (ministryType && ministryType !== "all") {
        query = query.eq("ministry_type", ministryType);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      
      // Group by user_id to combine positions
      const userMap = new Map<string, {
        id: string;
        full_name: string;
        avatar_url: string | null;
        positions: string[];
        ministry_types: string[];
      }>();
      
      (data || []).forEach((item: any) => {
        const userId = item.user_id;
        
        if (!userMap.has(userId)) {
          userMap.set(userId, {
            id: item.profiles.id,
            full_name: item.profiles.full_name || "Unknown",
            avatar_url: item.profiles.avatar_url,
            positions: [],
            ministry_types: [],
          });
        }
        
        const user = userMap.get(userId)!;
        
        if (!user.positions.includes(item.position)) {
          user.positions.push(item.position);
        }
        
        if (!user.ministry_types.includes(item.ministry_type)) {
          user.ministry_types.push(item.ministry_type);
        }
      });
      
      return Array.from(userMap.values());
    },
    enabled: !!campusId,
  });
}
