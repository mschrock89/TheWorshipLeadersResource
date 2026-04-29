import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSongsWithStats, SongWithStats } from "./useSongs";
import { useMemo } from "react";
import { useToast } from "./use-toast";
import { format } from "date-fns";
import { isMissingYoutubeUrlColumnError, normalizeYouTubeUrl } from "@/lib/youtube";

export interface SongAvailability {
  song: SongWithStats;
  status: 'available' | 'new-song-ok' | 'warning' | 'too-recent' | 'upcoming';
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
  youtube_url?: string | null;
  created_at: string;
  song?: SongWithStats;
}

const NEW_SONG_MIN_WEEKS = 3;
const REGULAR_ROTATION_MIN_WEEKS = 5;
const REGULAR_ROTATION_RECOMMENDED_WEEKS = 8;
const NEW_SONG_MAX_USES = 3;
const REGULAR_ROTATION_MIN_USES = 4;

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
    const targetDateStr = format(targetDate, "yyyy-MM-dd");

    // Calculate one year ago for deep cuts
    const oneYearAgo = new Date(targetDate);
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const oneYearAgoStr = format(oneYearAgo, "yyyy-MM-dd");

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
           if (ministryType === 'kids_camp') return serviceName.includes('kids camp');

           // "Weekend" = main services (exclude specialty service types)
           if (ministryType === 'weekend') {
             return (
               !serviceName.includes('encounter') &&
               !serviceName.includes('eon') &&
               !serviceName.includes('evident') &&
               !serviceName.includes('audition') &&
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

      // Split usage by the date being planned (not today's date).
      const pastUsages = relevantUsages.filter(u => u.plan_date < targetDateStr);
      const upcomingUsages = relevantUsages.filter(u => u.plan_date >= targetDateStr);
      
      // Calculate uses in past year for deep cut detection
      const usesInPastYear = pastUsages.filter(u => u.plan_date >= oneYearAgoStr).length;
      const totalUses = pastUsages.length;
      const isGloballyNew = (song.usages?.length || 0) === 0;
      // Classification rules:
      // - Deep Cut: 1 or less uses in past 12 months
      // - Regular Rotation: 3 or more uses in past 12 months OR 4+ total historical uses
      // - New Song: fewer than 4 total historical uses, unless it has already moved to regular rotation
      const isInRegularRotation = usesInPastYear >= 3 || totalUses >= REGULAR_ROTATION_MIN_USES;
      const isDeepCut = usesInPastYear <= 1;
      const isNewSong = totalUses > 0 && totalUses < REGULAR_ROTATION_MIN_USES && !isInRegularRotation;

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

      // Enforce recency windows first; deep cuts should not bypass timing locks.
      if (!lastUsedDate) {
        status = 'available';
      } else {
        const lastUsedSunday = getSunday(new Date(lastUsedDate));
        const weeksSinceLastUse = weeksBetween(lastUsedSunday, targetSunday);

        if (isNewSong && weeksSinceLastUse < NEW_SONG_MIN_WEEKS) {
          weeksUntilAvailable = NEW_SONG_MIN_WEEKS - weeksSinceLastUse;
          status = 'too-recent';
        } else if (!isNewSong && weeksSinceLastUse < REGULAR_ROTATION_MIN_WEEKS) {
          weeksUntilAvailable = REGULAR_ROTATION_MIN_WEEKS - weeksSinceLastUse;
          status = 'too-recent';
        } else if (!isNewSong && weeksSinceLastUse < REGULAR_ROTATION_RECOMMENDED_WEEKS) {
          weeksUntilAvailable = REGULAR_ROTATION_RECOMMENDED_WEEKS - weeksSinceLastUse;
          status = 'warning';
        } else if (isNewSong) {
          status = 'new-song-ok';
        } else {
          status = 'available';
        }
      }

      // Check if already scheduled for target date
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

      const weekendAliases = ["weekend", "sunday_am", "weekend_team"];
      const lookupDates = [planDate];
      const planDateValue = new Date(`${planDate}T00:00:00`);
      const dayOfWeek = planDateValue.getDay();
      const isSaturday = dayOfWeek === 6;
      const isSunday = dayOfWeek === 0;

      if (isSaturday) {
        const sunday = new Date(planDateValue);
        sunday.setDate(sunday.getDate() + 1);
        lookupDates.push(sunday.toISOString().split("T")[0]);
      } else if (isSunday) {
        const saturday = new Date(planDateValue);
        saturday.setDate(saturday.getDate() - 1);
        lookupDates.push(saturday.toISOString().split("T")[0]);
      }

      const ministryLookupValues = weekendAliases.includes(ministryType)
        ? weekendAliases
        : [ministryType];

      const baseSelect = `
        *,
        draft_set_songs(
          id,
          song_id,
          sequence_order,
          song_key,
          youtube_url,
          vocalist_id,
          songs(
            title,
            author,
            bpm
          )
        )
      `;
      const legacyBaseSelect = `
        *,
        draft_set_songs(
          id,
          song_id,
          sequence_order,
          song_key,
          vocalist_id,
          songs(
            title,
            author,
            bpm
          )
        )
      `;

      const runLookup = async (options: { includeMinistry: boolean; includeYoutubeUrl: boolean }) => {
        let query = supabase
          .from('draft_sets')
          .select(options.includeYoutubeUrl ? baseSelect : legacyBaseSelect)
          .eq('campus_id', campusId)
          .in('plan_date', lookupDates);

        if (options.includeMinistry) {
          query = query.in('ministry_type', ministryLookupValues);
        }

        if (customServiceId) {
          query = query.eq('custom_service_id', customServiceId);
        } else {
          query = query.is('custom_service_id', null);
        }

        const { data, error } = await query
          .order('published_at', { ascending: false })
          .order('updated_at', { ascending: false });

        if (error) throw error;

        const statusPriority: Record<string, number> = {
          published: 0,
          pending_approval: 1,
          draft: 2,
        };

        const rankedRows = [...(data || [])].sort((a: any, b: any) => {
          const aStatus = statusPriority[a.status] ?? 99;
          const bStatus = statusPriority[b.status] ?? 99;
          if (aStatus !== bStatus) return aStatus - bStatus;

          const aDateScore = a.plan_date === planDate ? 0 : 1;
          const bDateScore = b.plan_date === planDate ? 0 : 1;
          if (aDateScore !== bDateScore) return aDateScore - bDateScore;

          const aMinistryScore = a.ministry_type === ministryType ? 0 : 1;
          const bMinistryScore = b.ministry_type === ministryType ? 0 : 1;
          if (aMinistryScore !== bMinistryScore) return aMinistryScore - bMinistryScore;

          const aSongCount = (a.draft_set_songs || []).length;
          const bSongCount = (b.draft_set_songs || []).length;
          if (aSongCount !== bSongCount) return bSongCount - aSongCount;

          const aPublishedAt = a.published_at ? new Date(a.published_at).getTime() : 0;
          const bPublishedAt = b.published_at ? new Date(b.published_at).getTime() : 0;
          if (aPublishedAt !== bPublishedAt) return bPublishedAt - aPublishedAt;

          const aUpdatedAt = a.updated_at ? new Date(a.updated_at).getTime() : 0;
          const bUpdatedAt = b.updated_at ? new Date(b.updated_at).getTime() : 0;
          return bUpdatedAt - aUpdatedAt;
        });

        return rankedRows[0] ?? null;
      };

      // Primary lookup: strict ministry match.
      let data = null;
      try {
        data = await runLookup({ includeMinistry: true, includeYoutubeUrl: true });
      } catch (error) {
        if (!isMissingYoutubeUrlColumnError(error)) throw error;
        data = await runLookup({ includeMinistry: true, includeYoutubeUrl: false });
      }

      // Fallback for legacy custom-service sets (e.g. old Prayer Night saved as weekend).
      if (!data && customServiceId) {
        try {
          data = await runLookup({ includeMinistry: false, includeYoutubeUrl: true });
        } catch (error) {
          if (!isMissingYoutubeUrlColumnError(error)) throw error;
          data = await runLookup({ includeMinistry: false, includeYoutubeUrl: false });
        }
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
      songs: { song_id: string; sequence_order: number; song_key?: string; youtube_url?: string | null; vocalist_id?: string; vocalist_ids?: string[] }[];
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
        const normalizedYouTubeUrl = s.youtube_url?.trim()
          ? normalizeYouTubeUrl(s.youtube_url)
          : null;

        if (s.youtube_url?.trim() && !normalizedYouTubeUrl) {
          throw new Error("Use full youtube.com or youtu.be links for setlist songs.");
        }

        const vocalistIds = s.vocalist_ids && s.vocalist_ids.length > 0 
          ? s.vocalist_ids 
          : existingVocalistMap.get(s.song_id) || [];
        return {
          ...s,
          vocalist_id: vocalistIds[0] || null,
          vocalist_ids: vocalistIds,
          youtube_url: normalizedYouTubeUrl,
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
        const buildSongRows = (includeYoutubeUrl: boolean) =>
          songsWithVocalists.map(s => ({
            draft_set_id: setId,
            song_id: s.song_id,
            sequence_order: s.sequence_order,
            song_key: s.song_key || null,
            ...(includeYoutubeUrl ? { youtube_url: s.youtube_url || null } : {}),
            vocalist_id: s.vocalist_id || null,
          }));

        let insertedSongs: { id: string; song_id: string }[] | null = null;
        let songsError: Error | null = null;

        const primaryInsert = await supabase
          .from('draft_set_songs')
          .insert(buildSongRows(true))
          .select('id, song_id');

        insertedSongs = primaryInsert.data;
        songsError = primaryInsert.error;

        if (songsError && isMissingYoutubeUrlColumnError(songsError)) {
          const legacyInsert = await supabase
            .from('draft_set_songs')
            .insert(buildSongRows(false))
            .select('id, song_id');
          insertedSongs = legacyInsert.data;
          songsError = legacyInsert.error;
        }

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
      queryClient.invalidateQueries({ queryKey: ['published-setlists'] });
      queryClient.invalidateQueries({ queryKey: ['approver-published-setlists'] });
      queryClient.invalidateQueries({ queryKey: ['audition-assigned-setlists'] });
      toast({
        title: variables.draftSet.status === 'published'
          ? 'Published set updated'
          : variables.draftSet.id
            ? 'Set updated'
            : 'Set saved',
        description: variables.draftSet.status === 'published'
          ? 'Your published set changes are live.'
          : 'Your set has been saved successfully.',
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

      // Only consider this app's published draft sets from today onward.
      const today = format(new Date(), 'yyyy-MM-dd');
      const songIds = new Set<string>();
      const weekendAliases = ['weekend', 'weekend_team', 'sunday_am'];

      // Weekend planning should only consider weekend worship setlists.
      let setQuery = supabase
        .from('draft_sets')
        .select('id')
        .eq('campus_id', campusId)
        .eq('status', 'published')
        .gte('plan_date', today);

      if (weekendAliases.includes(ministryType)) {
        setQuery = setQuery.in('ministry_type', weekendAliases);
      } else {
        setQuery = setQuery.eq('ministry_type', ministryType);
      }

      const { data: publishedSets, error: draftError } = await setQuery;

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

      return songIds;
    },
    enabled: !!campusId,
    staleTime: 0, // Always refetch to ensure we have the latest data
    refetchOnMount: true,
  });
}
