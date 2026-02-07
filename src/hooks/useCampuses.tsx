import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface Campus {
  id: string;
  name: string;
  created_at: string;
  has_saturday_service: boolean;
  has_sunday_service: boolean;
  saturday_service_time: string[] | null;
  sunday_service_time: string[] | null;
}

export interface UserCampus {
  id: string;
  user_id: string;
  campus_id: string;
  created_at: string;
}

export function useCampuses() {
  return useQuery({
    queryKey: ["campuses"],
    staleTime: 10 * 60 * 1000, // 10 minutes - campuses rarely change
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campuses")
        .select("*")
        .order("name", { ascending: true });
      
      if (error) throw error;
      return data as Campus[];
    },
  });
}

interface CampusServiceConfigUpdate {
  id: string;
  has_saturday_service: boolean;
  has_sunday_service: boolean;
  saturday_service_time: string[];
  sunday_service_time: string[];
}

export function useUpdateCampusServiceConfig() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (configs: CampusServiceConfigUpdate[]) => {
      // Update each campus
      for (const config of configs) {
        const { error } = await supabase
          .from("campuses")
          .update({
            has_saturday_service: config.has_saturday_service,
            has_sunday_service: config.has_sunday_service,
            saturday_service_time: config.has_saturday_service && config.saturday_service_time.length > 0 
              ? config.saturday_service_time 
              : null,
            sunday_service_time: config.has_sunday_service && config.sunday_service_time.length > 0 
              ? config.sunday_service_time 
              : null,
          })
          .eq("id", config.id);
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campuses"] });
      toast({ title: "Service schedule updated" });
    },
    onError: (error) => {
      toast({ 
        title: "Error updating service schedule", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });
}

export function useUserCampuses(userId: string | undefined) {
  return useQuery({
    queryKey: ["user-campuses", userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("user_campuses")
        .select("*, campuses(*)")
        .eq("user_id", userId);
      
      if (error) throw error;
      return data as (UserCampus & { campuses: Campus })[];
    },
    enabled: !!userId,
  });
}

export function useUpdateUserCampuses() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ userId, campusIds }: { userId: string; campusIds: string[] }) => {
      // Delete existing assignments
      const { error: deleteError } = await supabase
        .from("user_campuses")
        .delete()
        .eq("user_id", userId);
      
      if (deleteError) throw deleteError;

      // Insert new assignments
      if (campusIds.length > 0) {
        const { error: insertError } = await supabase
          .from("user_campuses")
          .insert(campusIds.map(campusId => ({
            user_id: userId,
            campus_id: campusId,
          })));
        
        if (insertError) throw insertError;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["user-campuses", variables.userId] });
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
      toast({ title: "Campus assignments updated" });
    },
    onError: (error) => {
      toast({ 
        title: "Error", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });
}

// Get campuses with their assigned user IDs (for filtering)
export function useProfilesWithCampuses() {
  return useQuery({
    queryKey: ["profiles-campuses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_campuses")
        .select("user_id, campus_id, campuses(name)");
      
      if (error) throw error;
      
      // Create a map of user_id -> { names: string[], ids: string[] }
      const userCampusMap: Record<string, { names: string[]; ids: string[] }> = {};
      data.forEach((uc: { user_id: string; campus_id: string; campuses: { name: string } | null }) => {
        if (!userCampusMap[uc.user_id]) {
          userCampusMap[uc.user_id] = { names: [], ids: [] };
        }
        userCampusMap[uc.user_id].ids.push(uc.campus_id);
        if (uc.campuses?.name) {
          userCampusMap[uc.user_id].names.push(uc.campuses.name);
        }
      });
      
      return userCampusMap;
    },
  });
}
