import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { isStudentChatMinistryType } from "@/lib/chat";

const WEEKEND_MINISTRY_ALIASES = ["weekend", "weekend_team", "sunday_am", "speaker"] as const;
const CREATIVE_MINISTRY_ALIASES = ["creative", "photo_team"] as const;

function getNormalizedMinistryType(ministryType: string) {
  if (CREATIVE_MINISTRY_ALIASES.includes(ministryType as typeof CREATIVE_MINISTRY_ALIASES[number])) {
    return "creative";
  }

  return WEEKEND_MINISTRY_ALIASES.includes(ministryType as typeof WEEKEND_MINISTRY_ALIASES[number])
    ? "weekend_team"
    : ministryType;
}

function getEquivalentMinistryTypes(ministryType: string) {
  if (CREATIVE_MINISTRY_ALIASES.includes(ministryType as typeof CREATIVE_MINISTRY_ALIASES[number])) {
    return [...CREATIVE_MINISTRY_ALIASES];
  }

  return WEEKEND_MINISTRY_ALIASES.includes(ministryType as typeof WEEKEND_MINISTRY_ALIASES[number])
    ? [...WEEKEND_MINISTRY_ALIASES]
    : [ministryType];
}

export interface MinistryAssignment {
  id: string;
  user_id: string;
  campus_id: string;
  ministry_type: string;
  created_at: string;
}

export function useUserMinistryAssignments(userId: string | undefined) {
  return useQuery({
    queryKey: ["user-ministry-assignments", userId],
    queryFn: async () => {
      if (!userId) return [];
      
      const { data, error } = await supabase
        .from("user_ministry_campuses")
        .select("*")
        .eq("user_id", userId);
      
      if (error) throw error;
      return data as MinistryAssignment[];
    },
    enabled: !!userId,
  });
}

export function useToggleMinistryAssignment() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({
      userId,
      campusId,
      ministryType,
      isActive,
    }: {
      userId: string;
      campusId: string;
      ministryType: string;
      isActive: boolean;
    }) => {
      const equivalentMinistryTypes = getEquivalentMinistryTypes(ministryType);
      const normalizedMinistryType = getNormalizedMinistryType(ministryType);

      if (isActive) {
        // Remove the assignment
        const { error } = await supabase
          .from("user_ministry_campuses")
          .delete()
          .eq("user_id", userId)
          .eq("campus_id", campusId)
          .in("ministry_type", equivalentMinistryTypes);
        
        if (error) throw error;

        const { error: positionError } = await supabase
          .from("user_campus_ministry_positions")
          .delete()
          .eq("user_id", userId)
          .eq("campus_id", campusId)
          .in("ministry_type", equivalentMinistryTypes);

        if (positionError) throw positionError;
      } else {
        const { error: cleanupError } = await supabase
          .from("user_ministry_campuses")
          .delete()
          .eq("user_id", userId)
          .eq("campus_id", campusId)
          .in("ministry_type", equivalentMinistryTypes);

        if (cleanupError) throw cleanupError;

        const { error: positionCleanupError } = await supabase
          .from("user_campus_ministry_positions")
          .delete()
          .eq("user_id", userId)
          .eq("campus_id", campusId)
          .in("ministry_type", equivalentMinistryTypes);

        if (positionCleanupError) throw positionCleanupError;

        // Add the assignment
        const { error } = await supabase
          .from("user_ministry_campuses")
          .insert({
            user_id: userId,
            campus_id: campusId,
            ministry_type: normalizedMinistryType,
          });
        
        if (error) throw error;

        if (isStudentChatMinistryType(normalizedMinistryType)) {
          const { error: positionError } = await supabase
            .from("user_campus_ministry_positions")
            .insert({
              user_id: userId,
              campus_id: campusId,
              ministry_type: normalizedMinistryType,
              position: "chat_member",
            });

          if (positionError) throw positionError;
        }
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: ["user-ministry-assignments", variables.userId] 
      });
      queryClient.invalidateQueries({
        queryKey: ["user-campus-ministry-positions", variables.userId]
      });
      queryClient.invalidateQueries({
        queryKey: ["all-campus-ministry-positions"]
      });
      queryClient.invalidateQueries({
        queryKey: ["available-members"]
      });
    },
  });
}
