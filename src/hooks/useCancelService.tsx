import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "./use-toast";

export interface ServiceToCancel {
  date: string;
  campusId: string;
  campusName: string;
  ministryType: string;
  // Data to be cleaned up
  draftSets: { id: string; status: string; songCount: number }[];
  servicePlans: { id: string; serviceTypeName: string; songCount: number }[];
  totalSongs: number;
}

export function useServicesToCancelOnDate(date: string | null, campusId: string | null) {
  return useQuery({
    queryKey: ['services-to-cancel', date, campusId],
    queryFn: async (): Promise<ServiceToCancel | null> => {
      if (!date || !campusId) return null;

      // Get campus name
      const { data: campus } = await supabase
        .from('campuses')
        .select('name')
        .eq('id', campusId)
        .single();

      // Get draft_sets for this date/campus
      const { data: draftSets } = await supabase
        .from('draft_sets')
        .select('id, status, ministry_type')
        .eq('plan_date', date)
        .eq('campus_id', campusId);

      // Get song counts for draft sets
      const draftSetIds = (draftSets || []).map(ds => ds.id);
      let draftSongCounts = new Map<string, number>();
      
      if (draftSetIds.length > 0) {
        const { data: draftSongs } = await supabase
          .from('draft_set_songs')
          .select('draft_set_id')
          .in('draft_set_id', draftSetIds);
        
        for (const song of draftSongs || []) {
          draftSongCounts.set(song.draft_set_id, (draftSongCounts.get(song.draft_set_id) || 0) + 1);
        }
      }

      // Get service_plans (PCO synced) for this date/campus
      const { data: servicePlans } = await supabase
        .from('service_plans')
        .select('id, service_type_name')
        .eq('plan_date', date)
        .eq('campus_id', campusId);

      // Get song counts for service plans
      const servicePlanIds = (servicePlans || []).map(sp => sp.id);
      let planSongCounts = new Map<string, number>();
      
      if (servicePlanIds.length > 0) {
        const { data: planSongs } = await supabase
          .from('plan_songs')
          .select('plan_id')
          .in('plan_id', servicePlanIds);
        
        for (const song of planSongs || []) {
          planSongCounts.set(song.plan_id, (planSongCounts.get(song.plan_id) || 0) + 1);
        }
      }

      const draftSetData = (draftSets || []).map(ds => ({
        id: ds.id,
        status: ds.status,
        songCount: draftSongCounts.get(ds.id) || 0,
      }));

      const servicePlanData = (servicePlans || []).map(sp => ({
        id: sp.id,
        serviceTypeName: sp.service_type_name,
        songCount: planSongCounts.get(sp.id) || 0,
      }));

      const totalDraftSongs = draftSetData.reduce((sum, ds) => sum + ds.songCount, 0);
      const totalPlanSongs = servicePlanData.reduce((sum, sp) => sum + sp.songCount, 0);

      return {
        date,
        campusId,
        campusName: campus?.name || 'Unknown Campus',
        ministryType: 'all', // We're canceling all services for this date/campus
        draftSets: draftSetData,
        servicePlans: servicePlanData,
        totalSongs: totalDraftSongs + totalPlanSongs,
      };
    },
    enabled: !!date && !!campusId,
  });
}

export function useCancelService() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ 
      draftSetIds, 
      servicePlanIds 
    }: { 
      draftSetIds: string[]; 
      servicePlanIds: string[];
    }) => {
      let deletedDraftSets = 0;
      let deletedServicePlans = 0;
      let deletedSongs = 0;

      // Delete draft_set_songs first (due to foreign key), then draft_sets
      if (draftSetIds.length > 0) {
        const { data: draftSongs } = await supabase
          .from('draft_set_songs')
          .select('id')
          .in('draft_set_id', draftSetIds);
        
        deletedSongs += draftSongs?.length || 0;

        await supabase
          .from('draft_set_songs')
          .delete()
          .in('draft_set_id', draftSetIds);

        const { error: draftError } = await supabase
          .from('draft_sets')
          .delete()
          .in('id', draftSetIds);

        if (draftError) throw draftError;
        deletedDraftSets = draftSetIds.length;
      }

      // Delete plan_songs first (due to foreign key), then service_plans
      if (servicePlanIds.length > 0) {
        const { data: planSongs } = await supabase
          .from('plan_songs')
          .select('id')
          .in('plan_id', servicePlanIds);
        
        deletedSongs += planSongs?.length || 0;

        await supabase
          .from('plan_songs')
          .delete()
          .in('plan_id', servicePlanIds);

        const { error: planError } = await supabase
          .from('service_plans')
          .delete()
          .in('id', servicePlanIds);

        if (planError) throw planError;
        deletedServicePlans = servicePlanIds.length;
      }

      return { deletedDraftSets, deletedServicePlans, deletedSongs };
    },
    onSuccess: ({ deletedDraftSets, deletedServicePlans, deletedSongs }) => {
      // Invalidate all relevant queries
      queryClient.invalidateQueries({ queryKey: ['all-draft-sets'] });
      queryClient.invalidateQueries({ queryKey: ['draft-sets'] });
      queryClient.invalidateQueries({ queryKey: ['draft-set-songs'] });
      queryClient.invalidateQueries({ queryKey: ['existing-set'] });
      queryClient.invalidateQueries({ queryKey: ['published-setlists'] });
      queryClient.invalidateQueries({ queryKey: ['published-setlist-songs'] });
      queryClient.invalidateQueries({ queryKey: ['songs-with-stats'] });
      queryClient.invalidateQueries({ queryKey: ['services-to-cancel'] });

      toast({
        title: 'Service canceled',
        description: `Removed ${deletedDraftSets + deletedServicePlans} service(s) and freed ${deletedSongs} song(s) for scheduling.`,
      });
    },
    onError: (error) => {
      toast({
        title: 'Error canceling service',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
