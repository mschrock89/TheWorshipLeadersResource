import { useQuery, useMutation, useQueryClient, QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";

export interface Song {
  id: string;
  pco_song_id: string | null;
  title: string;
  author: string | null;
  ccli_number: string | null;
  bpm: number | null;
  created_at: string;
  updated_at: string;
}

export interface ServicePlan {
  id: string;
  pco_plan_id: string;
  campus_id: string | null;
  service_type_name: string;
  plan_date: string;
  plan_title: string | null;
  synced_at: string;
  created_at: string;
}

export interface PlanSong {
  id: string;
  plan_id: string;
  song_id: string;
  sequence_order: number;
  song_key: string | null;
  created_at: string;
  song?: Song;
}

export interface SongUsageData {
  plan_date: string;
  campus_id: string | null;
  service_type_name: string;
  song_key: string | null;
}

export interface SongWithStats extends Song {
  usage_count: number;
  first_used: string | null;
  last_used: string | null;
  upcoming_uses: number;
  usages: SongUsageData[];
  bpm: number | null;
}

export interface SyncProgress {
  id: string;
  user_id: string;
  sync_type: string;
  start_year: number | null;
  end_year: number | null;
  status: string;
  current_service_type_index: number;
  current_plan_index: number;
  total_service_types: number | null;
  total_plans_processed: number;
  total_songs_processed: number;
  error_message: string | null;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
}

export function useSongs() {
  return useQuery({
    queryKey: ["songs"],
    staleTime: 5 * 60 * 1000, // 5 minutes - songs library doesn't change often
    queryFn: async () => {
      const { data, error } = await supabase
        .from("songs")
        .select("*")
        .order("title");

      if (error) throw error;
      return data as Song[];
    },
  });
}

export function useSongsWithStats() {
  return useQuery({
    queryKey: ["songs-with-stats"],
    staleTime: 5 * 60 * 1000, // 5 minutes - song stats don't change often
    queryFn: async () => {
      // Use the database function for efficient server-side calculation
      const { data, error } = await supabase.rpc("get_songs_with_stats");

      if (error) throw error;

      // Transform the response to match the expected SongWithStats interface
      const songsWithStats: SongWithStats[] = (data || []).map((row: any) => ({
        id: row.id,
        pco_song_id: row.pco_song_id,
        title: row.title,
        author: row.author,
        ccli_number: row.ccli_number,
        bpm: row.bpm ? Number(row.bpm) : null,
        created_at: row.created_at,
        updated_at: row.updated_at,
        usage_count: Number(row.usage_count),
        first_used: row.first_used,
        last_used: row.last_used,
        upcoming_uses: Number(row.upcoming_uses),
        usages: (row.usages || []).map((u: any) => ({
          plan_date: u.plan_date,
          campus_id: u.campus_id,
          service_type_name: u.service_type_name || '',
          song_key: u.song_key || null,
        })),
      }));

      // Merge in app-native published setlist usage (draft_sets + draft_set_songs),
      // since get_songs_with_stats() only includes PCO service_plans/plan_songs.
      const { data: publishedDraftSongRows, error: publishedDraftSongsError } = await supabase
        .from("draft_set_songs")
        .select(`
          song_id,
          song_key,
          draft_set:draft_sets!inner(
            plan_date,
            campus_id,
            ministry_type,
            status
          )
        `)
        .eq("draft_set.status", "published");

      if (publishedDraftSongsError) throw publishedDraftSongsError;

      const ministryToServiceTypeName = (ministryType: string | null | undefined) => {
        switch (ministryType) {
          case "weekend":
            return "Weekend Worship";
          case "prayer_night":
            return "Prayer Night";
          case "encounter":
            return "Encounter";
          case "eon":
            return "EON";
          case "eon_weekend":
            return "EON Weekend";
          case "evident":
            return "Evident";
          case "er":
            return "ER";
          case "audition":
            return "Audition";
          case "production":
            return "Production";
          case "video":
            return "Video";
          default:
            return ministryType || "";
        }
      };

      const todayStr = new Date().toISOString().split("T")[0];
      const bySongId = new Map<string, SongWithStats>();
      songsWithStats.forEach((song) => bySongId.set(song.id, song));

      for (const row of publishedDraftSongRows || []) {
        const songId = (row as any).song_id as string | null;
        const ds = (row as any).draft_set as {
          plan_date?: string;
          campus_id?: string | null;
          ministry_type?: string | null;
          status?: string | null;
        } | null;
        if (!songId || !ds?.plan_date || ds?.status !== "published") continue;

        const targetSong = bySongId.get(songId);
        if (!targetSong) continue;

        targetSong.usages.push({
          plan_date: ds.plan_date,
          campus_id: ds.campus_id || null,
          service_type_name: ministryToServiceTypeName(ds.ministry_type),
          song_key: ((row as any).song_key as string | null) || null,
        });
      }

      // Recompute usage_count / last_used / upcoming_uses from merged usages.
      for (const song of songsWithStats) {
        const pastUsages = song.usages.filter((u) => u.plan_date < todayStr);
        const upcomingUsages = song.usages.filter((u) => u.plan_date >= todayStr);
        const sortedPastDates = pastUsages
          .map((u) => u.plan_date)
          .sort((a, b) => a.localeCompare(b));

        song.usage_count = pastUsages.length;
        song.upcoming_uses = upcomingUsages.length;
        song.first_used = sortedPastDates[0] || null;
        song.last_used = sortedPastDates.length ? sortedPastDates[sortedPastDates.length - 1] : null;
      }

      return songsWithStats;
    },
  });
}

export function useServicePlans(options?: { upcoming?: boolean; past?: boolean; all?: boolean }) {
  const today = new Date().toISOString().split('T')[0];
  
  return useQuery({
    queryKey: ["service-plans", options],
    queryFn: async () => {
      const mapMinistryTypeToServiceTypeName = (ministryType: string | null | undefined) => {
        switch (ministryType) {
          case "weekend":
            return "Weekend Worship";
          case "prayer_night":
            return "Prayer Night";
          case "encounter":
            return "Encounter";
          case "eon":
            return "EON";
          case "eon_weekend":
            return "EON Weekend";
          case "evident":
            return "Evident";
          case "er":
            return "ER";
          case "audition":
            return "Audition";
          case "production":
            return "Production";
          case "video":
            return "Video";
          default:
            return ministryType || "";
        }
      };

      // Upcoming plans should come from in-app set planning (draft_sets), not PCO.
      if (options?.upcoming) {
        const { data, error } = await supabase
          .from("draft_sets")
          .select(`
            id,
            plan_date,
            campus_id,
            ministry_type,
            notes,
            status,
            published_at,
            created_at
          `)
          .gte("plan_date", today)
          .in("status", ["draft", "pending_approval", "published"])
          .order("plan_date", { ascending: true })
          .limit(10000);

        if (error) throw error;

        return ((data || []) as any[]).map((ds) => ({
          id: ds.id,
          pco_plan_id: `draft-${ds.id}`,
          campus_id: ds.campus_id,
          service_type_name: mapMinistryTypeToServiceTypeName(ds.ministry_type),
          plan_date: ds.plan_date,
          plan_title: ds.notes || null,
          synced_at: ds.published_at || ds.created_at || ds.plan_date,
          created_at: ds.created_at || ds.published_at || ds.plan_date,
        })) as ServicePlan[];
      }

      // For "all" option, we want descending order (newest first) since we fetch all
      // For "upcoming" we want ascending (soonest first)
      // For "past" we want descending (most recent first)
      const ascending = options?.upcoming === true;
      
      let query = supabase
        .from("service_plans")
        .select("*")
        .order("plan_date", { ascending });

      // If "all" is specified, don't filter by date at all
      if (!options?.all) {
        if (options?.upcoming) {
          query = query.gte("plan_date", today);
        } else if (options?.past) {
          query = query.lt("plan_date", today);
        }
      }

      // Fetch all plans - override default 1000 limit
      // We need all plans for the Plan History pagination to work correctly
      const { data, error } = await query.limit(10000);
      if (error) throw error;
      return data as ServicePlan[];
    },
  });
}

export type ServicePlansPagedOptions = {
  page: number;
  pageSize: number;
  sortOrder: "newest" | "oldest";
  campusId?: string; // omit for all campuses
  ministry?: "all" | "weekend" | "encounter" | "eon" | "evident";
};

// Cutoff date: after this date, plan history comes from draft_sets (this app)
// On or before this date, plan history comes from service_plans (PCO)
const PCO_CUTOFF_DATE = "2026-01-17";

// Helper to map ministry_type from draft_sets to filter categories
function draftSetMinistryMatchesFilter(ministryType: string, filter: string): boolean {
  if (filter === "all") return true;
  if (filter === "weekend") return ministryType === "weekend";
  if (filter === "encounter") return ministryType === "encounter";
  if (filter === "eon") return ministryType === "eon";
  if (filter === "evident") return ministryType === "evident" || ministryType === "er";
  return false;
}

// Extracted query function for reuse in prefetching
async function fetchServicePlansPaged(options: ServicePlansPagedOptions) {
  const ascending = options.sortOrder === "oldest";
  const ministry = options.ministry ?? "all";

  // Ministry filtering for PCO service_plans
  const studentServiceTypes = [
    "EON Boro",
    "EON",
    "EON Tullahoma",
    "EON Shelbyville",
    "Encounter (Boro)",
    "Encounter",
    "Encounter (CC)",
    "Encounter (Tullahoma)",
    "Evident",
    "ER",
  ];

  // ----- Fetch PCO plans (on or before cutoff date) -----
  let pcoQuery = supabase
    .from("service_plans")
    .select("*", { count: "exact" })
    .lte("plan_date", PCO_CUTOFF_DATE);

  if (options.campusId) {
    pcoQuery = pcoQuery.eq("campus_id", options.campusId);
  }

  if (ministry === "weekend") {
    const list = `(${studentServiceTypes.map((v) => `"${v.replace(/\"/g, "\\\"")}"`)
      .join(",")})`;
    pcoQuery = pcoQuery.not("service_type_name", "in", list);
  } else if (ministry === "encounter") {
    pcoQuery = pcoQuery.in("service_type_name", [
      "Encounter (Boro)",
      "Encounter (CC)",
      "Encounter (Tullahoma)",
      "Encounter",
    ]);
  } else if (ministry === "eon") {
    pcoQuery = pcoQuery.in("service_type_name", ["EON Boro", "EON Tullahoma", "EON Shelbyville", "EON"]);
  } else if (ministry === "evident") {
    pcoQuery = pcoQuery.in("service_type_name", ["Evident", "ER"]);
  }

  pcoQuery = pcoQuery.not("service_type_name", "ilike", "%practice song%");

  // ----- Fetch draft_sets (after cutoff date, published status) -----
  let draftQuery = supabase
    .from("draft_sets")
    .select(`
      id,
      plan_date,
      campus_id,
      ministry_type,
      notes,
      status,
      published_at,
      campuses(name)
    `, { count: "exact" })
    .gt("plan_date", PCO_CUTOFF_DATE)
    .eq("status", "published");

  if (options.campusId) {
    draftQuery = draftQuery.eq("campus_id", options.campusId);
  }

  // Execute both queries in parallel
  const [pcoResult, draftResult] = await Promise.all([
    pcoQuery,
    draftQuery,
  ]);

  if (pcoResult.error) throw pcoResult.error;
  if (draftResult.error) throw draftResult.error;

  // Transform draft_sets to ServicePlan-like format and filter by ministry
  const draftPlans: ServicePlan[] = ((draftResult.data || []) as any[])
    .filter((ds) => draftSetMinistryMatchesFilter(ds.ministry_type, ministry))
    .map((ds) => ({
      id: ds.id,
      pco_plan_id: `draft-${ds.id}`, // Marker to distinguish from PCO plans
      campus_id: ds.campus_id,
      service_type_name: ds.ministry_type.charAt(0).toUpperCase() + ds.ministry_type.slice(1),
      plan_date: ds.plan_date,
      plan_title: ds.notes || null,
      synced_at: ds.published_at || ds.plan_date,
      created_at: ds.published_at || ds.plan_date,
    }));

  // Combine both arrays
  const allPlans: ServicePlan[] = [
    ...((pcoResult.data || []) as ServicePlan[]),
    ...draftPlans,
  ];

  // Sort combined array
  allPlans.sort((a, b) => {
    const dateA = new Date(a.plan_date).getTime();
    const dateB = new Date(b.plan_date).getTime();
    return ascending ? dateA - dateB : dateB - dateA;
  });

  // Apply pagination to the combined result
  const from = Math.max(0, (options.page - 1) * options.pageSize);
  const to = from + options.pageSize;
  const paginatedPlans = allPlans.slice(from, to);

  return {
    plans: paginatedPlans,
    total: allPlans.length,
  };
}

// Service Plans paged query - combines PCO plans (≤ cutoff) with draft_sets (> cutoff)
export function useServicePlansPaged(options: ServicePlansPagedOptions) {
  const queryClient = useQueryClient();
  
  const query = useQuery({
    queryKey: ["service-plans-paged", options],
    queryFn: () => fetchServicePlansPaged(options),
    staleTime: 2 * 60 * 1000, // 2 minutes - plans don't change often
  });

  // Prefetch adjacent pages when current page loads successfully
  useEffect(() => {
    if (!query.data) return;
    
    const totalPages = Math.ceil(query.data.total / options.pageSize);
    
    // Prefetch next page if it exists
    if (options.page < totalPages) {
      const nextOptions = { ...options, page: options.page + 1 };
      queryClient.prefetchQuery({
        queryKey: ["service-plans-paged", nextOptions],
        queryFn: () => fetchServicePlansPaged(nextOptions),
        staleTime: 2 * 60 * 1000,
      });
    }
    
    // Prefetch previous page if it exists
    if (options.page > 1) {
      const prevOptions = { ...options, page: options.page - 1 };
      queryClient.prefetchQuery({
        queryKey: ["service-plans-paged", prevOptions],
        queryFn: () => fetchServicePlansPaged(prevOptions),
        staleTime: 2 * 60 * 1000,
      });
    }
  }, [query.data, options, queryClient]);

  return query;
}

export function usePlanSongs(planId: string | null, pcoPlanId?: string) {
  // Determine if this is a draft_set (from app) vs a PCO service_plan
  const isDraftSet = pcoPlanId?.startsWith("draft-");
  
  return useQuery({
    queryKey: ["plan-songs", planId, isDraftSet],
    enabled: !!planId,
    queryFn: async () => {
      if (isDraftSet) {
        // Fetch from draft_set_songs for plans created in this app
        const { data, error } = await supabase
          .from("draft_set_songs")
          .select(`
            id,
            draft_set_id,
            song_id,
            sequence_order,
            song_key,
            created_at,
            songs (*)
          `)
          .eq("draft_set_id", planId!)
          .order("sequence_order");

        if (error) throw error;
        
        // Transform to match the expected PlanSong format
        return (data || []).map((item: any) => ({
          id: item.id,
          plan_id: item.draft_set_id,
          song_id: item.song_id,
          sequence_order: item.sequence_order,
          song_key: item.song_key,
          created_at: item.created_at,
          song: item.songs as Song,
        })) as (PlanSong & { song: Song })[];
      } else {
        // Fetch from plan_songs for PCO-synced plans
        const { data, error } = await supabase
          .from("plan_songs")
          .select(`
            *,
            song:songs(*)
          `)
          .eq("plan_id", planId!)
          .order("sequence_order");

        if (error) throw error;
        return data as (PlanSong & { song: Song })[];
      }
    },
  });
}

// Helper function to determine ministry type from service type name
function getMinistryTypeFromServiceName(serviceTypeName: string): string {
  const lowerName = serviceTypeName.toLowerCase();
  
  if (lowerName.includes('eon')) return 'eon';
  if (lowerName.includes('encounter')) return 'encounter';
  if (lowerName.includes('evident')) return 'evident';
  if (lowerName.includes(' er ') || lowerName.endsWith(' er') || lowerName.startsWith('er ')) return 'er';
  
  // Default to weekend for regular worship services
  return 'weekend';
}

// Expand song IDs to include equivalent songs (same/similar title, e.g. merged duplicates).
// Returns { expandedIds: Set<string>, alternateToCanonical: Map<string, string> }
async function getEquivalentSongIds(
  songIdsWithTitles: { id: string; title: string }[]
): Promise<{ expandedIds: string[]; alternateToCanonical: Map<string, string> }> {
  const expandedIds = new Set<string>(songIdsWithTitles.map((s) => s.id));
  const alternateToCanonical = new Map<string, string>();
  for (const s of songIdsWithTitles) {
    alternateToCanonical.set(s.id, s.id);
  }

  if (songIdsWithTitles.length === 0) return { expandedIds: [], alternateToCanonical };

  // Fetch all songs that share the same root title (exact match or one is prefix of the other)
  const titles = songIdsWithTitles.map((s) => (s.title || "").trim()).filter(Boolean);
  if (titles.length === 0) return { expandedIds: [...expandedIds], alternateToCanonical };

  const { data: allSongs } = await supabase
    .from("songs")
    .select("id, title");

  for (const row of allSongs || []) {
    if (!row?.title) continue;
    const dbTitle = (row.title as string).trim().toLowerCase();
    for (const { id, title } of songIdsWithTitles) {
      const t = (title || "").trim().toLowerCase();
      if (!t) continue;
      // Match: exact same, or one title is a prefix of the other (handles "Forever YHWH" vs "Forever YHWH / Worthy of it All")
      const matches =
        dbTitle === t ||
        (dbTitle.length > t.length && (dbTitle.startsWith(t + " ") || dbTitle.startsWith(t + "/"))) ||
        (t.length > dbTitle.length && (t.startsWith(dbTitle + " ") || t.startsWith(dbTitle + "/")));
      if (matches) {
        expandedIds.add(row.id);
        alternateToCanonical.set(row.id, id);
        break;
      }
    }
  }

  return { expandedIds: [...expandedIds], alternateToCanonical };
}

// Collapse prior uses map so alternate song IDs map to canonical (setlist) song IDs
function collapsePriorUsesToCanonical(
  priorUsesMap: Map<string, number>,
  alternateToCanonical: Map<string, string>
): Map<string, number> {
  const collapsed = new Map<string, number>();
  for (const [songId, count] of priorUsesMap) {
    const canonical = alternateToCanonical.get(songId) ?? songId;
    collapsed.set(canonical, (collapsed.get(canonical) ?? 0) + count);
  }
  return collapsed;
}

// Client-side fallback when RPC fails - query by song_id (small list, no URI limit)
async function getPriorUsesClientFallback(
  songIds: string[],
  beforeDate: string
): Promise<Map<string, number>> {
  const priorUsesMap = new Map<string, number>();
  if (songIds.length === 0) return priorUsesMap;

  try {
    // Draft sets: song_id filter is small, no URI limit
    const { data: draftSongs } = await supabase
      .from("draft_set_songs")
      .select("song_id, draft_set:draft_sets!inner(plan_date, status)")
      .in("song_id", songIds);
    for (const row of draftSongs || []) {
      const ds = row.draft_set as { plan_date?: string; status?: string } | null;
      if (ds?.status === "published" && ds?.plan_date && ds.plan_date < beforeDate) {
        priorUsesMap.set(row.song_id, (priorUsesMap.get(row.song_id) || 0) + 1);
      }
    }
    // PCO plans if table exists
    try {
      const { data: planSongs } = await supabase
        .from("plan_songs")
        .select("song_id, plan:service_plans!inner(plan_date)")
        .in("song_id", songIds);
      for (const row of planSongs || []) {
        const plan = row.plan as { plan_date?: string } | null;
        if (plan?.plan_date && plan.plan_date < beforeDate) {
          priorUsesMap.set(row.song_id, (priorUsesMap.get(row.song_id) || 0) + 1);
        }
      }
    } catch {
      // service_plans/plan_songs may not exist
    }
  } catch {
    // Fallback failed
  }
  return priorUsesMap;
}

// Helper to get prior usage counts - try RPC first, fall back to client queries
async function getPriorUses(
  songIds: string[],
  beforeDate: string,
  campusIds: string[] | null,
  ministryTypes: string[] | null
): Promise<Map<string, number>> {
  if (songIds.length === 0) return new Map();

  try {
    const { data, error } = await supabase.rpc("get_prior_song_uses", {
      _song_ids: songIds,
      _before_date: beforeDate,
      _campus_ids: campusIds,
      _ministry_types: ministryTypes,
    });

    if (!error && data && data.length > 0) {
      const map = new Map<string, number>();
      for (const row of data) {
        map.set(row.song_id, Number(row.usage_count ?? 0));
      }
      return map;
    }
  } catch {
    // RPC not available
  }

  // Fallback: client-side query (global only - no campus/ministry filter)
  return getPriorUsesClientFallback(songIds, beforeDate);
}

/** Exported for setlists/other views: compute prior use counts for songs (canonical id -> count). */
export async function getPriorUseCountsForSongs(
  songIdsWithTitles: { id: string; title: string }[],
  beforeDate: string,
  campusIds: string[] | null,
  ministryTypes: string[] | null
): Promise<Map<string, number>> {
  if (songIdsWithTitles.length === 0) return new Map();
  const { expandedIds, alternateToCanonical } = await getEquivalentSongIds(songIdsWithTitles);
  const [campusMap, globalMap] = await Promise.all([
    getPriorUses(expandedIds, beforeDate, campusIds, ministryTypes),
    getPriorUses(expandedIds, beforeDate, null, null),
  ]);
  const merged = new Map<string, number>();
  for (const id of expandedIds) {
    const c = campusMap.get(id) ?? 0;
    const g = globalMap.get(id) ?? 0;
    if (c > 0 || g > 0) merged.set(id, Math.max(c, g));
  }
  return collapsePriorUsesToCanonical(merged, alternateToCanonical);
}

export function useSongsForDate(date: string | null, campusId?: string, ministryFilter?: string) {
  return useQuery({
    queryKey: ["songs-for-date", date, campusId, ministryFilter],
    enabled: !!date,
    queryFn: async () => {
      // First get the user's assigned campuses and ministry types
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      // Fetch user's campus assignments and profile (ministry types) in parallel
      const [campusResult, profileResult] = await Promise.all([
        supabase
          .from("user_campuses")
          .select("campus_id")
          .eq("user_id", user.id),
        supabase
          .from("profiles")
          .select("ministry_types")
          .eq("id", user.id)
          .single()
      ]);

      if (campusResult.error) throw campusResult.error;
      
      const userCampusIds = (campusResult.data || []).map(uc => uc.campus_id);
      const userMinistryTypes = profileResult.data?.ministry_types || ['weekend'];
      
      // If ministryFilter is specified (and not "all"), use only that ministry type
      // Otherwise, use the user's profile ministry types
      // Special handling for "weekend_team" - expands to weekend, production, video
      let effectiveMinistryTypes: string[];
      if (ministryFilter && ministryFilter !== "all") {
        if (ministryFilter === "weekend_team") {
          effectiveMinistryTypes = ["weekend", "production", "video"];
        } else {
          effectiveMinistryTypes = [ministryFilter];
        }
      } else {
        effectiveMinistryTypes = userMinistryTypes;
      }

      // Determine which campus IDs to filter by
      // If a specific campusId is passed and user has access, use only that campus
      // Otherwise, use all user campuses
      let filterCampusIds: string[] = [];
      if (campusId && userCampusIds.includes(campusId)) {
        filterCampusIds = [campusId];
      } else if (campusId && !userCampusIds.includes(campusId)) {
        // If campus filter doesn't match user's campuses, return empty (no access)
        return [];
      } else {
        filterCampusIds = userCampusIds;
      }

      // Get plans from service_plans (PCO synced) for this date - skip if table doesn't exist
      let filteredPlans: { id: string; service_type_name: string; plan_title: string | null; campus_id: string | null }[] = [];
      try {
        let query = supabase
          .from("service_plans")
          .select("id, service_type_name, plan_title, campus_id")
          .eq("plan_date", date!);

        if (filterCampusIds.length > 0) {
          query = query.in("campus_id", filterCampusIds);
        }

        const { data: plans, error: plansError } = await query;
        if (plansError) throw plansError;

        filteredPlans = (plans || []).filter(plan => {
          const planMinistryType = getMinistryTypeFromServiceName(plan.service_type_name);
          return effectiveMinistryTypes.includes(planMinistryType);
        });
      } catch (e) {
        // service_plans may not exist if PCO sync isn't set up - continue with draft sets only
        filteredPlans = [];
      }

      // For weekend services (Saturday/Sunday), check both days for published sets
      // A setlist published for Saturday should also show on Sunday and vice versa
      const dateObj = new Date(date! + "T00:00:00");
      const dayOfWeek = dateObj.getDay(); // 0 = Sunday, 6 = Saturday
      const isSaturday = dayOfWeek === 6;
      const isSunday = dayOfWeek === 0;
      
      // Build array of dates to check for draft sets
      const datesToCheck = [date!];
      if (isSaturday) {
        // Also check Sunday (next day)
        const sunday = new Date(dateObj);
        sunday.setDate(sunday.getDate() + 1);
        datesToCheck.push(sunday.toISOString().split("T")[0]);
      } else if (isSunday) {
        // Also check Saturday (previous day)
        const saturday = new Date(dateObj);
        saturday.setDate(saturday.getDate() - 1);
        datesToCheck.push(saturday.toISOString().split("T")[0]);
      }

      // Also get published sets from draft_sets (manually built sets)
      // Order by published_at desc to get the most recent published set first
      // Check both days of the weekend if applicable
      let draftQuery = supabase
        .from("draft_sets")
        .select("id, ministry_type, campus_id, published_at, plan_date")
        .in("plan_date", datesToCheck)
        .eq("status", "published")
        .order("published_at", { ascending: false });

      if (filterCampusIds.length > 0) {
        draftQuery = draftQuery.in("campus_id", filterCampusIds);
      }

      const { data: draftSets, error: draftError } = await draftQuery;
      if (draftError) throw draftError;

      // Filter draft sets by effective ministry types AND deduplicate by campus+ministry
      // Keep only the most recently published set per campus+ministry combination
      const seenCampusMinistry = new Set<string>();
      const filteredDraftSets = (draftSets || []).filter(ds => {
        if (!effectiveMinistryTypes.includes(ds.ministry_type)) return false;
        const key = `${ds.campus_id}-${ds.ministry_type}`;
        if (seenCampusMinistry.has(key)) return false;
        seenCampusMinistry.add(key);
        return true;
      });

      // Collect all songs from both sources
      const result: { id: string; service_type_name: string; plan_title: string | null; campus_id: string | null; songs: any[] }[] = [];

      // Fetch all basic profiles upfront using SECURITY DEFINER function
      // This allows all users (including volunteers) to see vocalist names
      const { data: allBasicProfiles } = await supabase.rpc("get_basic_profiles");
      const profilesMap = new Map((allBasicProfiles || []).map(p => [p.id, p]));

      // First, fetch draft_set songs to get vocalist assignments (we'll use these to enrich PCO songs too)
      let vocalistBySongId = new Map<string, { id: string; name: string; avatarUrl: string | null }>();
      
      if (filteredDraftSets.length > 0) {
        const draftSetIds = filteredDraftSets.map(ds => ds.id);
        const { data: draftSongs, error: draftSongsError } = await supabase
          .from("draft_set_songs")
          .select(`
            *,
            song:songs(*),
            vocalist_id,
            draft_set:draft_sets!inner(campus_id, ministry_type)
          `)
          .in("draft_set_id", draftSetIds)
          .order("sequence_order");

        if (draftSongsError) throw draftSongsError;

        // Enrich draft songs with vocalist data from the profiles map
        const enrichedDraftSongs = (draftSongs || []).map(dss => ({
          ...dss,
          vocalist: dss.vocalist_id ? profilesMap.get(dss.vocalist_id) || null : null
        }));

        // Build a map of song_id -> vocalist for each campus/ministry combo
        // This allows us to enrich PCO songs with vocalist data from published draft sets
        for (const dss of enrichedDraftSongs) {
          if (dss.vocalist) {
            // Use song_id + campus_id as key to handle same song at different campuses
            const key = `${dss.song_id}-${dss.draft_set?.campus_id}`;
            vocalistBySongId.set(key, {
              id: dss.vocalist.id,
              name: dss.vocalist.full_name,
              avatarUrl: dss.vocalist.avatar_url
            });
          }
        }

        // Store enriched draft songs for later use
        (globalThis as any).__draftSongs = enrichedDraftSongs;
        (globalThis as any).__draftSetIds = draftSetIds;
      }

      // Get songs from service_plans (PCO)
      if (filteredPlans.length > 0) {
        const planIds = filteredPlans.map(p => p.id);
        const { data: planSongs, error: songsError } = await supabase
          .from("plan_songs")
          .select(`
            *,
            song:songs(*)
          `)
          .in("plan_id", planIds)
          .order("sequence_order");

        if (songsError) throw songsError;

        // Get prior uses - include equivalent songs (merged/alternate titles)
        const songIdsWithTitles = [...new Map((planSongs || []).map((ps) => [ps.song_id, { id: ps.song_id, title: ps.song?.title ?? "" }])).values()];
        const { expandedIds, alternateToCanonical } = await getEquivalentSongIds(songIdsWithTitles);
        const [campusScopedMap, globalMap] = await Promise.all([
          getPriorUses(expandedIds, date!, filterCampusIds, effectiveMinistryTypes),
          getPriorUses(expandedIds, date!, null, null),
        ]);
        // Merge both: use max so we catch prior uses from plans with null campus_id or title variants
        const mergedRaw = new Map<string, number>();
        for (const id of expandedIds) {
          const campus = campusScopedMap.get(id) ?? 0;
          const global = globalMap.get(id) ?? 0;
          if (campus > 0 || global > 0) mergedRaw.set(id, Math.max(campus, global));
        }
        let priorUsesMap = collapsePriorUsesToCanonical(mergedRaw, alternateToCanonical);

        // Add service plans with their songs
        for (const plan of filteredPlans) {
          result.push({
            ...plan,
            songs: (planSongs || [])
              .filter(ps => ps.plan_id === plan.id)
              .map(ps => {
                const vocalistKey = `${ps.song_id}-${plan.campus_id}`;
                const vocalist = vocalistBySongId.get(vocalistKey);
                return { 
                  ...ps.song, 
                  key: ps.song_key, 
                  sequence: ps.sequence_order,
                  isFirstUse: (priorUsesMap.get(ps.song_id) || 0) === 0,
                  vocalist: vocalist || null,
                };
              }),
          });
        }
      }

      // Get songs from draft_sets (manually built sets) - only if not already covered by PCO
      if (filteredDraftSets.length > 0) {
        const draftSongs = (globalThis as any).__draftSongs || [];
        
        // Get ministry type labels for display
        const ministryLabels: Record<string, string> = {
          weekend: "Weekend Worship",
          encounter: "Encounter",
          eon: "EON",
          eon_weekend: "EON Weekend",
          sunday_am: "Sunday AM"
        };

        // Add draft sets with their songs (only if we don't have PCO songs for same ministry)
        for (const ds of filteredDraftSets) {
          // Check if we already have a plan for this ministry type (avoid duplicates)
          const existingPlan = result.find(r => 
            getMinistryTypeFromServiceName(r.service_type_name) === ds.ministry_type &&
            r.campus_id === ds.campus_id
          );
          
          if (!existingPlan) {
            const dsSongsWithTitles = (draftSongs || [])
              .filter((dss: any) => dss.draft_set_id === ds.id && dss.song?.id)
              .map((dss: any) => ({ id: dss.song.id, title: dss.song?.title ?? "" }));
            const dsSongIdsWithTitles = [...new Map(dsSongsWithTitles.map((s) => [s.id, s])).values()];
            const { expandedIds: dsExpandedIds, alternateToCanonical: dsAlternateToCanonical } = await getEquivalentSongIds(dsSongIdsWithTitles);
            const [dsCampusMap, dsGlobalMap] = await Promise.all([
              getPriorUses(dsExpandedIds, date!, [ds.campus_id], [ds.ministry_type]),
              getPriorUses(dsExpandedIds, date!, null, null),
            ]);
            const dsMergedRaw = new Map<string, number>();
            for (const id of dsExpandedIds) {
              const campus = dsCampusMap.get(id) ?? 0;
              const global = dsGlobalMap.get(id) ?? 0;
              if (campus > 0 || global > 0) dsMergedRaw.set(id, Math.max(campus, global));
            }
            const priorUsesMap = collapsePriorUsesToCanonical(dsMergedRaw, dsAlternateToCanonical);
            result.push({
              id: ds.id,
              service_type_name: ministryLabels[ds.ministry_type] || ds.ministry_type,
              plan_title: null,
              campus_id: ds.campus_id,
              songs: (draftSongs || [])
                .filter((dss: any) => dss.draft_set_id === ds.id)
                .map((dss: any) => ({
                  ...dss.song,
                  key: dss.song_key,
                  sequence: dss.sequence_order,
                  isFirstUse: (priorUsesMap.get(dss.song?.id) || 0) === 0,
                  vocalist: dss.vocalist ? {
                    id: dss.vocalist.id,
                    name: dss.vocalist.full_name,
                    avatarUrl: dss.vocalist.avatar_url
                  } : null,
                })),
            });
          }
        }
        
        // Clean up
        delete (globalThis as any).__draftSongs;
        delete (globalThis as any).__draftSetIds;
      }

      return result;
    },
  });
}

export function useSyncProgress(startYear?: number, endYear?: number) {
  return useQuery({
    queryKey: ["sync-progress", startYear, endYear],
    enabled: startYear !== undefined && endYear !== undefined,
    refetchInterval: 2000, // Poll every 2 seconds while syncing
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from("sync_progress")
        .select("*")
        .eq("user_id", user.id)
        .eq("start_year", startYear!)
        .eq("end_year", endYear!)
        .maybeSingle();

      if (error) throw error;
      return data as SyncProgress | null;
    },
  });
}

export function useAllSyncProgress() {
  return useQuery({
    queryKey: ["all-sync-progress"],
    refetchInterval: 5000, // Poll every 5 seconds
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from("sync_progress")
        .select("*")
        .eq("user_id", user.id)
        .order("start_year", { ascending: true });

      if (error) throw error;
      return data as SyncProgress[];
    },
  });
}

export function useSyncPlans() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("pco-sync-plans");
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["songs"] });
      queryClient.invalidateQueries({ queryKey: ["songs-with-stats"] });
      queryClient.invalidateQueries({ queryKey: ["service-plans"] });
      queryClient.invalidateQueries({ queryKey: ["plan-songs"] });
      queryClient.invalidateQueries({ queryKey: ["songs-for-date"] });

      const results = data.results;
      toast({
        title: "Plans Synced",
        description: `${results.plans_synced} plans, ${results.songs_synced} songs synced`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Sync Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useForceFullSync() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("pco-sync-plans", {
        body: { force_full_sync: true },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["songs"] });
      queryClient.invalidateQueries({ queryKey: ["songs-with-stats"] });
      queryClient.invalidateQueries({ queryKey: ["service-plans"] });
      queryClient.invalidateQueries({ queryKey: ["plan-songs"] });
      queryClient.invalidateQueries({ queryKey: ["songs-for-date"] });

      const results = data.results;
      toast({
        title: "Full Sync Complete",
        description: `${results.plans_synced} plans, ${results.songs_synced} songs synced`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Full Sync Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useHistoricalSync() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: async ({ startYear, endYear, resume = false }: { startYear: number; endYear: number; resume?: boolean }) => {
      const { data, error } = await supabase.functions.invoke("pco-sync-plans", {
        body: { sync_start_year: startYear, sync_end_year: endYear, resume },
      });
      if (error) throw error;
      return { data, startYear, endYear };
    },
    onSuccess: ({ data, startYear, endYear }) => {
      queryClient.invalidateQueries({ queryKey: ["songs"] });
      queryClient.invalidateQueries({ queryKey: ["songs-with-stats"] });
      queryClient.invalidateQueries({ queryKey: ["service-plans"] });
      queryClient.invalidateQueries({ queryKey: ["plan-songs"] });
      queryClient.invalidateQueries({ queryKey: ["songs-for-date"] });
      queryClient.invalidateQueries({ queryKey: ["sync-progress"] });
      queryClient.invalidateQueries({ queryKey: ["all-sync-progress"] });

      const results = data.results;
      
      if (results.timed_out) {
        toast({
          title: `Sync Paused (${startYear})`,
          description: `${results.plans_synced} plans synced. Auto-resuming in 3s...`,
        });
        
        // Auto-resume after 3 seconds
        setTimeout(() => {
          mutation.mutate({ startYear, endYear, resume: true });
        }, 3000);
      } else {
        toast({
          title: `Historical Sync Complete (${startYear})`,
          description: `${results.plans_synced} plans, ${results.songs_synced} songs synced`,
        });
      }
    },
    onError: (error: Error) => {
      queryClient.invalidateQueries({ queryKey: ["sync-progress"] });
      queryClient.invalidateQueries({ queryKey: ["all-sync-progress"] });
      toast({
        title: "Historical Sync Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return mutation;
}

export function useCreateSong() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ title, author, bpm }: { title: string; author: string | null; bpm: number | null }) => {
      const { data, error } = await supabase
        .from("songs")
        .insert({ title, author, bpm })
        .select()
        .single();
      if (error) throw error;
      return data as Song;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["songs"] });
      queryClient.invalidateQueries({ queryKey: ["songs-with-stats"] });
      toast({
        title: "Song added",
        description: `"${data.title}" has been added to your library.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error adding song",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useUpdateSongBpm() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ songId, bpm }: { songId: string; bpm: number | null }) => {
      const { data, error } = await supabase
        .from("songs")
        .update({ bpm, updated_at: new Date().toISOString() })
        .eq("id", songId)
        .select()
        .single();
      if (error) throw error;
      return data as Song;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["songs"] });
      queryClient.invalidateQueries({ queryKey: ["songs-with-stats"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error updating BPM",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useDeleteSong() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (songId: string) => {
      // Delete from plan_songs first (foreign key constraint)
      const { error: planSongsError } = await supabase
        .from("plan_songs")
        .delete()
        .eq("song_id", songId);
      if (planSongsError) throw planSongsError;

      // Delete from draft_set_songs
      const { error: draftSongsError } = await supabase
        .from("draft_set_songs")
        .delete()
        .eq("song_id", songId);
      if (draftSongsError) throw draftSongsError;

      // Delete the song itself
      const { error } = await supabase
        .from("songs")
        .delete()
        .eq("id", songId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["songs"] });
      queryClient.invalidateQueries({ queryKey: ["songs-with-stats"] });
      toast({
        title: "Song deleted",
        description: "The song has been removed from your library.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error deleting song",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useMergeSongs() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ sourceSongId, targetSongId }: { sourceSongId: string; targetSongId: string }) => {
      if (sourceSongId === targetSongId) throw new Error("Cannot merge a song into itself");

      // 1. Update plan_songs
      const { error: planError } = await supabase
        .from("plan_songs")
        .update({ song_id: targetSongId })
        .eq("song_id", sourceSongId);
      if (planError) throw planError;

      // 2. Update draft_set_songs - delete source rows where target already exists in same draft
      const { data: sourceDrafts } = await supabase
        .from("draft_set_songs")
        .select("id, draft_set_id")
        .eq("song_id", sourceSongId);
      const { data: targetDrafts } = await supabase
        .from("draft_set_songs")
        .select("draft_set_id")
        .eq("song_id", targetSongId);
      const targetDraftIds = new Set((targetDrafts || []).map((r) => r.draft_set_id));
      for (const row of sourceDrafts || []) {
        if (targetDraftIds.has(row.draft_set_id)) {
          const { error: delErr } = await supabase.from("draft_set_songs").delete().eq("id", row.id);
          if (delErr) throw delErr;
        }
      }
      const { error: draftError } = await supabase
        .from("draft_set_songs")
        .update({ song_id: targetSongId })
        .eq("song_id", sourceSongId);
      if (draftError) throw draftError;

      // 3. Update service_flow_items
      const { error: flowError } = await supabase
        .from("service_flow_items")
        .update({ song_id: targetSongId })
        .eq("song_id", sourceSongId);
      if (flowError) throw flowError;

      // 4. Update album_tracks (optional - table may not exist in all projects)
      const { data: albumSource, error: albumSelectErr } = await supabase
        .from("album_tracks")
        .select("id, album_id")
        .eq("song_id", sourceSongId);
      if (!albumSelectErr && albumSource?.length) {
        const { data: albumTarget } = await supabase
          .from("album_tracks")
          .select("album_id")
          .eq("song_id", targetSongId);
        const targetAlbumIds = new Set((albumTarget || []).map((r) => r.album_id));
        for (const row of albumSource) {
          if (targetAlbumIds.has(row.album_id)) {
            await supabase.from("album_tracks").delete().eq("id", row.id);
          }
        }
        await supabase
          .from("album_tracks")
          .update({ song_id: targetSongId })
          .eq("song_id", sourceSongId);
      }

      // 5. Delete the source song
      const { error: deleteError } = await supabase.from("songs").delete().eq("id", sourceSongId);
      if (deleteError) throw deleteError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["songs"] });
      queryClient.invalidateQueries({ queryKey: ["songs-with-stats"] });
      toast({
        title: "Songs merged",
        description: "The songs have been merged. Play counts and plans are now combined.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error merging songs",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
