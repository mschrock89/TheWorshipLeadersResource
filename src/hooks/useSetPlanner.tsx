import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSongsWithStats, SongWithStats } from "./useSongs";
import { useMemo } from "react";
import { useToast } from "./use-toast";
import { format, addMonths } from "date-fns";

export interface SongAvailability {
  song: SongWithStats;
  status: 'available' | 'new-song-ok' | 'too-recent' | 'upcoming';
  weeksUntilAvailable: number | null;
  lastUsedDate: string | null;
  totalUses: number;
  isNewSong: boolean;
  isGloballyNew: boolean; // Never scheduled by ANY campus/ministry
  isDeepCut: boolean;
  isInRegularRotation: boolean;
  usesInPastYear: number;
  scheduledDates: string[];
  suggestedKey: string | null;
}

export interface DraftSet {
  id: string;
  campus_id: string;
  custom_service_id?: string | null;
  plan_date: string;
  ministry_type: string;
  created_by: string;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface DraftSetSong {
  id: string;
  draft_set_id: string;
  song_id: string;
  sequence_order: number;
  song_key: string | null;
  created_at: string;
  song?: SongWithStats;
}

// Calculate weeks between two dates
function weeksBetween(date1: Date, date2: Date): number {
  const diffMs = Math.abs(date2.getTime() - date1.getTime());
  return Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
}

// Get the Sunday of the week for a given date
function getSunday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function useSongAvailability(
  campusId: string | null,
  ministryType: string,
  targetDate: Date
) {
  const { data: songs, isLoading } = useSongsWithStats();

  const availability = useMemo(() => {
    if (!songs || !campusId) return [];

    const targetSunday = getSunday(targetDate);
    const todayStr = new Date().toISOString().split('T')[0];

    // Calculate one year ago for deep cuts
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const oneYearAgoStr = oneYearAgo.toISOString().split('T')[0];

    return songs
      .map((song): SongAvailability | null => {
       // Filter usages by campus and ministry
       const relevantUsages = (song.usages || []).filter(u => {
         // Only count usages for this specific campus
         const matchesCampus = u.campus_id === campusId;

         const serviceName = (u.service_type_name || '').toLowerCase();
         const matchesMinistry = (() => {
           if (ministryType === 'all') return true;
           if (ministryType === 'encounter') return serviceName.includes('encounter');
           if (ministryType === 'eon') return serviceName.includes('eon');
           if (ministryType === 'evident') return serviceName.includes('evident');

           // "Weekend" = main services (exclude specialty service types)
           if (ministryType === 'weekend') {
             return (
               !serviceName.includes('encounter') &&
               !serviceName.includes('eon') &&
               !serviceName.includes('evident') &&
               !serviceName.includes('worship night') &&
               !serviceName.includes('prayer') &&
               !serviceName.includes('practice') &&
               !serviceName.includes('kids camp')
             );
           }

           // Fallback: substring match
           return serviceName.includes(ministryType.toLowerCase());
         })();

         return matchesCampus && matchesMinistry;
       });

       // Include ALL songs - songs with no usage history are brand new and available

      // Split into past and upcoming (for this campus/ministry)
      const pastUsages = relevantUsages.filter(u => u.plan_date < todayStr);
      const upcomingUsages = relevantUsages.filter(u => u.plan_date >= todayStr);
      
      const totalUses = relevantUsages.length;
      const hasRecentSchedule = relevantUsages.some(u => u.plan_date >= oneYearAgoStr);
      // A song is "new" for this campus/ministry if scheduled in the last year and still under 4 total schedules.
      const isNewSong = hasRecentSchedule && totalUses < 4;

      // Calculate uses in past year for deep cut detection
      const usesInPastYear = pastUsages.filter(u => u.plan_date >= oneYearAgoStr).length;
      const isDeepCut = usesInPastYear <= 1;
      const isInRegularRotation = usesInPastYear >= 2;

      // Find last used date and most recently used key
      const sortedPastUsages = [...pastUsages].sort((a, b) => 
        new Date(b.plan_date).getTime() - new Date(a.plan_date).getTime()
      );
      const lastUsedDate = sortedPastUsages[0]?.plan_date || null;
      
      // Get the most recently used key from PCO data
      const suggestedKey = sortedPastUsages.find(u => u.song_key)?.song_key || null;

      // Get scheduled upcoming dates
      const scheduledDates = upcomingUsages.map(u => u.plan_date).sort();

      // Calculate availability
      let status: SongAvailability['status'] = 'available';
      let weeksUntilAvailable: number | null = null;

      // Deep cuts and never-played songs are always available
      if (!lastUsedDate || isDeepCut) {
        status = 'available';
      } else if (lastUsedDate) {
        const lastUsedSunday = getSunday(new Date(lastUsedDate));
        const weeksSinceLastUse = weeksBetween(lastUsedSunday, targetSunday);

        if (isNewSong && weeksSinceLastUse < 4) {
          weeksUntilAvailable = 4 - weeksSinceLastUse;
          status = 'too-recent';
        } else if (!isNewSong && weeksSinceLastUse < 8) {
          weeksUntilAvailable = 8 - weeksSinceLastUse;
          status = 'too-recent';
        } else if (isNewSong && weeksSinceLastUse >= 4) {
          status = 'new-song-ok';
        }
      }

      // Check if already scheduled for target date
      const targetDateStr = targetDate.toISOString().split('T')[0];
      if (scheduledDates.includes(targetDateStr)) {
        status = 'upcoming';
        weeksUntilAvailable = null;
      }

      return {
        song,
        status,
        weeksUntilAvailable,
        lastUsedDate,
        totalUses,
        isNewSong,
        isGloballyNew,
        isDeepCut,
        isInRegularRotation,
        usesInPastYear,
        scheduledDates,
        suggestedKey,
      };
    })
    .filter((item): item is SongAvailability => item !== null);
  }, [songs, campusId, ministryType, targetDate]);

  return { availability, isLoading };
}

export function useDraftSets(campusId: string | null) {
  return useQuery({
    queryKey: ['draft-sets', campusId],
    queryFn: async () => {
      if (!campusId) return [];
      
      const { data, error } = await supabase
        .from('draft_sets')
        .select('*')
        .eq('campus_id', campusId)
        .order('plan_date', { ascending: true });

      if (error) throw error;
      return data as DraftSet[];
    },
    enabled: !!campusId,
  });
}

// Fetch existing draft/published set for a specific date, campus, and ministry
export function useExistingSet(
  campusId: string | null,
  ministryType: string,
  planDate: string,
  customServiceId?: string | null
) {
  return useQuery({
    queryKey: ['existing-set', campusId, ministryType, planDate, customServiceId || null],
    queryFn: async () => {
      if (!campusId || !planDate) return null;

      const baseSelect = `
        *,
        draft_set_songs(
          id,
          song_id,
          sequence_order,
          song_key,
          vocalist_id
        )
      `;

      const runLookup = async (options: { includeMinistry: boolean }) => {
        let query = supabase
          .from('draft_sets')
          .select(baseSelect)
          .eq('campus_id', campusId)
          .eq('plan_date', planDate);

        if (options.includeMinistry) {
          query = query.eq('ministry_type', ministryType);
        }

        if (customServiceId) {
          query = query.eq('custom_service_id', customServiceId);
        } else {
          query = query.is('custom_service_id', null);
        }

        const { data, error } = await query
          .order('published_at', { ascending: false })
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) throw error;
        return data;
      };

      // Primary lookup: strict ministry match.
      let data = await runLookup({ includeMinistry: true });

      // Fallback for legacy custom-service sets (e.g. old Prayer Night saved as weekend).
      if (!data && customServiceId) {
        data = await runLookup({ includeMinistry: false });
      }

      if (!data) return null;

      // Fetch vocalist IDs from junction table for all draft_set_songs
      const draftSetSongIds = (data.draft_set_songs || []).map((s: any) => s.id);
      
      if (draftSetSongIds.length > 0) {
        const { data: vocalistData, error: vocalistError } = await supabase
          .from('draft_set_song_vocalists')
          .select('draft_set_song_id, vocalist_id')
          .in('draft_set_song_id', draftSetSongIds);

        if (vocalistError) throw vocalistError;

        // Group vocalist IDs by draft_set_song_id
        const vocalistMap = new Map<string, string[]>();
        for (const v of vocalistData || []) {
          const existing = vocalistMap.get(v.draft_set_song_id) || [];
          existing.push(v.vocalist_id);
          vocalistMap.set(v.draft_set_song_id, existing);
        }

        // Attach vocalist_ids to each song
        data.draft_set_songs = data.draft_set_songs.map((s: any) => ({
          ...s,
          vocalist_ids: vocalistMap.get(s.id) || (s.vocalist_id ? [s.vocalist_id] : []),
        }));
      }

      return data;
    },
    enabled: !!campusId && !!planDate,
  });
}

export function useDraftSetSongs(draftSetId: string | null) {
  const { data: songs } = useSongsWithStats();

  return useQuery({
    queryKey: ['draft-set-songs', draftSetId],
    queryFn: async () => {
      if (!draftSetId) return [];
      
      const { data, error } = await supabase
        .from('draft_set_songs')
        .select('*')
        .eq('draft_set_id', draftSetId)
        .order('sequence_order', { ascending: true });

      if (error) throw error;
      
      // Attach song data
      return (data || []).map(dss => ({
        ...dss,
        song: songs?.find(s => s.id === dss.song_id),
      })) as DraftSetSong[];
    },
    enabled: !!draftSetId && !!songs,
  });
}

export function useSaveDraftSet() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      draftSet,
      songs,
    }: {
      draftSet: Omit<DraftSet, 'id' | 'created_at' | 'updated_at'> & { id?: string };
      songs: { song_id: string; sequence_order: number; song_key?: string; vocalist_id?: string; vocalist_ids?: string[] }[];
    }) => {
      let setId = draftSet.id;

      // Before saving, check for existing published sets to copy vocalist assignments
      // This preserves vocalist assignments when the user hasn't explicitly set them
      let existingVocalistMap = new Map<string, string[]>();
      
      if (draftSet.campus_id && draftSet.plan_date && draftSet.ministry_type) {
        // Find any published set for the same date/campus/ministry
        const { data: existingSets } = await supabase
          .from('draft_sets')
          .select('id')
          .eq('campus_id', draftSet.campus_id)
          .eq('ministry_type', draftSet.ministry_type)
          .eq('plan_date', draftSet.plan_date)
          .eq('status', 'published')
          .neq('id', setId || '') // Exclude current set if updating
          .order('published_at', { ascending: false })
          .limit(1);

        if (existingSets && existingSets.length > 0) {
          // Get draft_set_songs first
          const { data: existingSongs } = await supabase
            .from('draft_set_songs')
            .select('id, song_id, vocalist_id')
            .eq('draft_set_id', existingSets[0].id);

          if (existingSongs && existingSongs.length > 0) {
            // Get vocalists from junction table
            const songIds = existingSongs.map(s => s.id);
            const { data: vocalistData } = await supabase
              .from('draft_set_song_vocalists')
              .select('draft_set_song_id, vocalist_id')
              .in('draft_set_song_id', songIds);

            // Build vocalist map
            for (const song of existingSongs) {
              const vocalistIds = (vocalistData || [])
                .filter(v => v.draft_set_song_id === song.id)
                .map(v => v.vocalist_id);
              
              // Fall back to legacy vocalist_id if no junction table entries
              if (vocalistIds.length === 0 && song.vocalist_id) {
                vocalistIds.push(song.vocalist_id);
              }
              
              if (vocalistIds.length > 0) {
                existingVocalistMap.set(song.song_id, vocalistIds);
              }
            }
          }
        }
      }

      // Apply existing vocalist assignments to songs that don't have one
      const songsWithVocalists = songs.map(s => {
        const vocalistIds = s.vocalist_ids && s.vocalist_ids.length > 0 
          ? s.vocalist_ids 
          : existingVocalistMap.get(s.song_id) || [];
        return {
          ...s,
          vocalist_id: vocalistIds[0] || null,
          vocalist_ids: vocalistIds,
        };
      });

      if (setId) {
        // Update existing
        const { error } = await supabase
          .from('draft_sets')
          .update({
            plan_date: draftSet.plan_date,
            ministry_type: draftSet.ministry_type,
            notes: draftSet.notes,
            status: draftSet.status,
            custom_service_id: draftSet.custom_service_id || null,
          })
          .eq('id', setId);

        if (error) throw error;

        // Delete existing songs (cascade will delete junction table entries)
        await supabase.from('draft_set_songs').delete().eq('draft_set_id', setId);
      } else {
        // Create new
        const { data, error } = await supabase
          .from('draft_sets')
          .insert({
            campus_id: draftSet.campus_id,
            plan_date: draftSet.plan_date,
            ministry_type: draftSet.ministry_type,
            custom_service_id: draftSet.custom_service_id || null,
            created_by: draftSet.created_by,
            notes: draftSet.notes,
            status: draftSet.status,
          })
          .select()
          .single();

        if (error) throw error;
        setId = data.id;
      }

      // Insert songs with preserved vocalist assignments
      if (songsWithVocalists.length > 0) {
        const { data: insertedSongs, error: songsError } = await supabase
          .from('draft_set_songs')
          .insert(
            songsWithVocalists.map(s => ({
              draft_set_id: setId,
              song_id: s.song_id,
              sequence_order: s.sequence_order,
              song_key: s.song_key || null,
              vocalist_id: s.vocalist_id || null,
            }))
          )
          .select('id, song_id');

        if (songsError) throw songsError;

        // Insert vocalist assignments into junction table
        const vocalistInserts: { draft_set_song_id: string; vocalist_id: string }[] = [];
        
        for (const insertedSong of insertedSongs || []) {
          const songData = songsWithVocalists.find(s => s.song_id === insertedSong.song_id);
          if (songData?.vocalist_ids && songData.vocalist_ids.length > 0) {
            for (const vocalistId of songData.vocalist_ids) {
              vocalistInserts.push({
                draft_set_song_id: insertedSong.id,
                vocalist_id: vocalistId,
              });
            }
          }
        }

        if (vocalistInserts.length > 0) {
          const { error: vocalistError } = await supabase
            .from('draft_set_song_vocalists')
            .insert(vocalistInserts);

          if (vocalistError) throw vocalistError;
        }
      }

      return setId;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['draft-sets'] });
      queryClient.invalidateQueries({ queryKey: ['draft-set-songs'] });
      queryClient.invalidateQueries({ queryKey: ['existing-set', variables.draftSet.campus_id, variables.draftSet.ministry_type, variables.draftSet.plan_date, variables.draftSet.custom_service_id || null] });
      toast({
        title: variables.draftSet.id ? 'Set updated' : 'Set saved',
        description: 'Your set has been saved successfully.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error saving set',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useDeleteDraftSet() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (draftSetId: string) => {
      const { error } = await supabase
        .from('draft_sets')
        .delete()
        .eq('id', draftSetId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['draft-sets'] });
      toast({
        title: 'Set deleted',
        description: 'The draft set has been removed.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error deleting set',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Fetch song IDs from published setlists AND scheduled service plans for a specific campus and ministry
// These should be filtered out of suggestion cards
export function usePublishedSetlistSongs(campusId: string | null, ministryType: string) {
  return useQuery({
    queryKey: ['published-setlist-songs', campusId, ministryType],
    queryFn: async () => {
      if (!campusId) return new Set<string>();

      // Get from today onwards (we want to filter out songs scheduled for future dates)
      const today = format(new Date(), 'yyyy-MM-dd');
      const threeMonthsAgo = format(addMonths(new Date(), -3), 'yyyy-MM-dd');

      const songIds = new Set<string>();

      // 1. Get songs from published draft_sets (past 3 months + future)
      const { data: publishedSets, error: draftError } = await supabase
        .from('draft_sets')
        .select('id')
        .eq('campus_id', campusId)
        .eq('ministry_type', ministryType)
        .eq('status', 'published')
        .gte('plan_date', threeMonthsAgo);

      if (draftError) throw draftError;

      if (publishedSets && publishedSets.length > 0) {
        const setIds = publishedSets.map(s => s.id);
        const { data: draftSongs, error: draftSongsError } = await supabase
          .from('draft_set_songs')
          .select('song_id')
          .in('draft_set_id', setIds);

        if (draftSongsError) throw draftSongsError;
        draftSongs?.forEach(s => songIds.add(s.song_id));
      }

      // 2. Get songs from service_plans (PCO synced data) for upcoming dates
      // This catches songs scheduled in PCO that don't have a corresponding published draft_set
      const { data: servicePlans, error: plansError } = await supabase
        .from('service_plans')
        .select('id, service_type_name')
        .eq('campus_id', campusId)
        .gte('plan_date', today);

      if (plansError) throw plansError;

      if (servicePlans && servicePlans.length > 0) {
        // Filter by ministry type based on service_type_name
        const filteredPlans = servicePlans.filter(sp => {
          const serviceName = (sp.service_type_name || '').toLowerCase();
          if (ministryType === 'all') return true;
          if (ministryType === 'encounter') return serviceName.includes('encounter');
          if (ministryType === 'eon') return serviceName.includes('eon');
          if (ministryType === 'evident') return serviceName.includes('evident');
          if (ministryType === 'weekend') {
            return (
              !serviceName.includes('encounter') &&
              !serviceName.includes('eon') &&
              !serviceName.includes('evident') &&
              !serviceName.includes('worship night') &&
              !serviceName.includes('prayer') &&
              !serviceName.includes('practice') &&
              !serviceName.includes('kids camp')
            );
          }
          return serviceName.includes(ministryType.toLowerCase());
        });

        if (filteredPlans.length > 0) {
          const planIds = filteredPlans.map(p => p.id);
          const { data: planSongs, error: planSongsError } = await supabase
            .from('plan_songs')
            .select('song_id')
            .in('plan_id', planIds);

          if (planSongsError) throw planSongsError;
          planSongs?.forEach(s => songIds.add(s.song_id));
        }
      }

      return songIds;
    },
    enabled: !!campusId,
    staleTime: 0, // Always refetch to ensure we have the latest data
    refetchOnMount: true,
  });
}
