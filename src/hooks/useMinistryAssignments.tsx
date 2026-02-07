import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

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

export function useUpdateMinistryAssignments() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({
      userId,
      campusId,
      ministryTypes,
    }: {
      userId: string;
      campusId: string;
      ministryTypes: string[];
    }) => {
      // First, delete existing assignments for this user+campus combo
      const { error: deleteError } = await supabase
        .from("user_ministry_campuses")
        .delete()
        .eq("user_id", userId)
        .eq("campus_id", campusId);
      
      if (deleteError) throw deleteError;
      
      // Then insert the new assignments
      if (ministryTypes.length > 0) {
        const newAssignments = ministryTypes.map(mt => ({
          user_id: userId,
          campus_id: campusId,
          ministry_type: mt,
        }));
        
        const { error: insertError } = await supabase
          .from("user_ministry_campuses")
          .insert(newAssignments);
        
        if (insertError) throw insertError;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: ["user-ministry-assignments", variables.userId] 
      });
    },
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
      if (isActive) {
        // Remove the assignment
        const { error } = await supabase
          .from("user_ministry_campuses")
          .delete()
          .eq("user_id", userId)
          .eq("campus_id", campusId)
          .eq("ministry_type", ministryType);
        
        if (error) throw error;
      } else {
        // Add the assignment
        const { error } = await supabase
          .from("user_ministry_campuses")
          .insert({
            user_id: userId,
            campus_id: campusId,
            ministry_type: ministryType,
          });
        
        if (error) throw error;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: ["user-ministry-assignments", variables.userId] 
      });
    },
  });
}

// Helper hook to get ministry types for a specific campus
export function useMinistryTypesForCampus(
  userId: string | undefined, 
  campusId: string | undefined
) {
  const { data: assignments = [] } = useUserMinistryAssignments(userId);
  
  return assignments
    .filter(a => a.campus_id === campusId)
    .map(a => a.ministry_type);
}

// Get all available members for a specific campus and ministry type
// This uses the new user_campus_ministry_positions table for accurate filtering
export function useAvailableMembersForCampusMinistry(
  campusId: string | undefined,
  ministryType: string | undefined
) {
  return useQuery({
    queryKey: ["available-members-campus-ministry", campusId, ministryType],
    queryFn: async () => {
      if (!campusId) return [];
      
      // Query users who have positions for this campus+ministry combination
      let query = supabase
        .from("user_campus_ministry_positions")
        .select(`
          user_id,
          ministry_type,
          position,
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
      
      // Deduplicate by user_id and aggregate positions and ministry_types
      const uniqueUsers = new Map();
      data?.forEach((item: any) => {
        if (!uniqueUsers.has(item.user_id)) {
          uniqueUsers.set(item.user_id, {
            id: item.profiles.id,
            full_name: item.profiles.full_name || "Unknown",
            avatar_url: item.profiles.avatar_url,
            positions: [item.position],
            ministry_types: [item.ministry_type],
          });
        } else {
          const existing = uniqueUsers.get(item.user_id);
          if (!existing.positions.includes(item.position)) {
            existing.positions.push(item.position);
          }
          if (!existing.ministry_types.includes(item.ministry_type)) {
            existing.ministry_types.push(item.ministry_type);
          }
        }
      });
      
      return Array.from(uniqueUsers.values());
    },
    enabled: !!campusId,
  });
}
