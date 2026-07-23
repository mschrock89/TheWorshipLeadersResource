import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  isKidsCampSetMinistryType,
  isNetworkWideMinistryType,
  isSessionSetMinistryType,
  normalizeSessionSetMinistryType,
} from "@/lib/constants";

const PRAYER_NIGHT_PATTERN = /\bprayer\s*night\b/i;
const KIDS_CAMP_PATTERN = /\bkids\s*camp\b/i;

function isMissingServiceFlowCustomServiceColumn(error: unknown): boolean {
  const message = (error as { message?: string } | null)?.message?.toLowerCase() || "";
  return (
    message.includes("custom_service_id") &&
    message.includes("service_flows") &&
    (message.includes("schema cache") || message.includes("column"))
  );
}

export interface ServiceFlow {
  id: string;
  draft_set_id: string | null;
  custom_service_id: string | null;
  campus_id: string;
  ministry_type: string;
  service_date: string;
  created_from_template_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServiceFlowItem {
  id: string;
  service_flow_id: string;
  item_type: "header" | "item" | "song";
  title: string;
  duration_seconds: number | null;
  sequence_order: number;
  song_id: string | null;
  song_key: string | null;
  vocalist_id: string | null;
  notes: string | null;
  created_at: string;
  // Joined data
  song?: {
    id: string;
    title: string;
    author: string | null;
    bpm: number | null;
  } | null;
  vocalist?: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
  vocalists?: Array<{
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  }>;
}

export function useServiceFlow(
  campusId: string | null,
  ministryType: string,
  serviceDate: string | null,
  draftSetId?: string | null,
  customServiceId?: string | null
) {
  return useQuery({
    queryKey: ["service-flow", campusId, ministryType, serviceDate, draftSetId || null, customServiceId || null],
    staleTime: 30_000,
    queryFn: async () => {
      if (!campusId || !serviceDate) return null;

      const fetchSingle = async (
        builder: ReturnType<typeof supabase.from<"service_flows", ServiceFlow>>
      ) => {
        const { data, error } = await builder
          .select("*")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        return (data as ServiceFlow | null) || null;
      };

      // 1) Prefer exact draft-set linkage when available.
      if (draftSetId) {
        const byDraftSet = await fetchSingle(
          supabase.from("service_flows").eq("draft_set_id", draftSetId)
        );
        if (byDraftSet) {
          // For custom-service contexts, guard against legacy/mismatched draft-set links
          // (e.g. Prayer Night custom service accidentally linked to a weekend flow).
          // Also reject cross-session matches (Morning draft set must not return an Evening flow).
          const byDraftSetCustomServiceId =
            (byDraftSet as { custom_service_id?: string | null }).custom_service_id ?? null;
          const byDraftSetMinistryType =
            (byDraftSet as { ministry_type?: string | null }).ministry_type ?? null;
          const ministryMatches =
            !byDraftSetMinistryType || byDraftSetMinistryType === ministryType;

          if (customServiceId) {
            const customServiceMatches = byDraftSetCustomServiceId === customServiceId;
            if (customServiceMatches && ministryMatches) {
              return byDraftSet;
            }
          } else if (ministryMatches) {
            return byDraftSet;
          }
        }
      }

      // 2) For custom services, try custom-service scoped flow.
      if (customServiceId) {
        try {
          const byCustomService = await fetchSingle(
            supabase
              .from("service_flows")
              .eq("campus_id", campusId)
              .eq("ministry_type", ministryType)
              .eq("service_date", serviceDate)
              .eq("custom_service_id", customServiceId)
          );
          if (byCustomService) return byCustomService;
        } catch (error) {
          if (!isMissingServiceFlowCustomServiceColumn(error)) {
            throw error;
          }
        }

        if (ministryType === "prayer_night" || ministryType === "kids_camp") {
          try {
            const legacySpecialtyCustom = await fetchSingle(
              supabase
                .from("service_flows")
                .eq("campus_id", campusId)
                .eq("ministry_type", "weekend")
                .eq("service_date", serviceDate)
                .eq("custom_service_id", customServiceId)
            );
            if (legacySpecialtyCustom) return legacySpecialtyCustom;
          } catch (error) {
            if (!isMissingServiceFlowCustomServiceColumn(error)) {
              throw error;
            }
          }
        }

        // Important: when a specific custom service is requested, do NOT fall back to
        // a generic campus/ministry/date flow, because multiple custom services can share
        // the same date/ministry (e.g. Prayer Night + Prayer Night Mayday).
        // Returning null here allows Live mode to generate/bind the correct scoped flow
        // from the selected custom service template/setlist context.
        return null;
      }

      // 3) Legacy fallback: older flows were only campus+ministry+date scoped.
      const legacy = await fetchSingle(
        supabase
          .from("service_flows")
          .eq("campus_id", campusId)
          .eq("ministry_type", ministryType)
          .eq("service_date", serviceDate)
      );
      if (legacy) return legacy;

      // 3b) Session ministries (Student Camp Morning/Evening): resolve via the published
      // draft set for this session. Flows are often opened from Calendar without draftSetId
      // in the query key, but the saved flow is still linked to that published set.
      if (isSessionSetMinistryType(ministryType) && !draftSetId) {
        let publishedSetQuery = supabase
          .from("draft_sets")
          .select("id")
          .eq("ministry_type", ministryType)
          .eq("plan_date", serviceDate)
          .eq("status", "published");

        publishedSetQuery = isNetworkWideMinistryType(ministryType)
          ? publishedSetQuery.is("campus_id", null)
          : publishedSetQuery.eq("campus_id", campusId);

        const { data: publishedSet } = await publishedSetQuery
          .order("published_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (publishedSet?.id) {
          const byPublishedSet = await fetchSingle(
            supabase.from("service_flows").eq("draft_set_id", publishedSet.id)
          );
          if (byPublishedSet) return byPublishedSet;
        }
      }

      // 4) Prayer Night migration fallback: older flows may still be stored as weekend.
      if (ministryType === "prayer_night") {
        if (customServiceId) {
          try {
            const legacyPrayerCustom = await fetchSingle(
              supabase
                .from("service_flows")
                .eq("campus_id", campusId)
                .eq("ministry_type", "weekend")
                .eq("service_date", serviceDate)
                .eq("custom_service_id", customServiceId)
            );
            if (legacyPrayerCustom) return legacyPrayerCustom;
          } catch (error) {
            if (!isMissingServiceFlowCustomServiceColumn(error)) {
              throw error;
            }
          }
        }

        const legacyPrayerGeneral = await fetchSingle(
          supabase
            .from("service_flows")
            .eq("campus_id", campusId)
            .eq("ministry_type", "weekend")
            .eq("service_date", serviceDate)
        );
        if (legacyPrayerGeneral) return legacyPrayerGeneral;
      }

      return null;
    },
    enabled: !!campusId && !!serviceDate,
  });
}

function mapServiceFlowItemsWithVocalists(
  items: any[],
  vocalistsByItemId: Map<string, Array<{ id: string; full_name: string | null; avatar_url: string | null }>>,
): ServiceFlowItem[] {
  return items.map((item) => {
    const linked = [...(vocalistsByItemId.get(item.id) || [])];
    if (item.vocalist && !linked.some((v) => v.id === item.vocalist.id)) {
      linked.unshift({
        id: item.vocalist.id,
        full_name: item.vocalist.full_name,
        avatar_url: item.vocalist.avatar_url,
      });
    }
    const { service_flow_item_vocalists: _junction, ...rest } = item;
    return {
      ...rest,
      vocalists: linked,
    } as ServiceFlowItem;
  });
}

export function useServiceFlowItems(serviceFlowId: string | null) {
  return useQuery({
    queryKey: ["service-flow-items", serviceFlowId],
    staleTime: 30_000,
    queryFn: async () => {
      if (!serviceFlowId) return [];
      
      // Prefer one round-trip; fall back if the nested embed is unavailable.
      const nested = await supabase
        .from("service_flow_items")
        .select(`
          *,
          song:songs(id, title, author, bpm),
          vocalist:profiles!service_flow_items_vocalist_id_fkey(id, full_name, avatar_url),
          service_flow_item_vocalists(
            vocalist:profiles(id, full_name, avatar_url)
          )
        `)
        .eq("service_flow_id", serviceFlowId)
        .order("sequence_order", { ascending: true });

      if (!nested.error) {
        const byItemId = new Map<string, Array<{ id: string; full_name: string | null; avatar_url: string | null }>>();
        for (const row of (nested.data || []) as any[]) {
          const linked: Array<{ id: string; full_name: string | null; avatar_url: string | null }> = [];
          for (const junction of row.service_flow_item_vocalists || []) {
            const vocalist = junction?.vocalist;
            if (!vocalist?.id) continue;
            if (!linked.some((entry) => entry.id === vocalist.id)) {
              linked.push({
                id: vocalist.id,
                full_name: vocalist.full_name,
                avatar_url: vocalist.avatar_url,
              });
            }
          }
          byItemId.set(row.id, linked);
        }
        return mapServiceFlowItemsWithVocalists(nested.data || [], byItemId);
      }

      const { data, error } = await supabase
        .from("service_flow_items")
        .select(`
          *,
          song:songs(id, title, author, bpm),
          vocalist:profiles!service_flow_items_vocalist_id_fkey(id, full_name, avatar_url)
        `)
        .eq("service_flow_id", serviceFlowId)
        .order("sequence_order", { ascending: true });

      if (error) throw error;
      const items = data || [];
      const itemIds = items.map((item: any) => item.id as string);
      if (itemIds.length === 0) return [];

      const { data: flowItemVocalists, error: flowItemVocalistsError } = await supabase
        .from("service_flow_item_vocalists")
        .select(`
          service_flow_item_id,
          vocalist:profiles(id, full_name, avatar_url)
        `)
        .in("service_flow_item_id", itemIds);

      if (flowItemVocalistsError) throw flowItemVocalistsError;

      const byItemId = new Map<string, Array<{ id: string; full_name: string | null; avatar_url: string | null }>>();
      for (const row of (flowItemVocalists || []) as any[]) {
        const vocalist = row.vocalist;
        if (!vocalist || !row.service_flow_item_id) continue;
        const existing = byItemId.get(row.service_flow_item_id) || [];
        existing.push({
          id: vocalist.id,
          full_name: vocalist.full_name,
          avatar_url: vocalist.avatar_url,
        });
        byItemId.set(row.service_flow_item_id, existing);
      }

      return mapServiceFlowItemsWithVocalists(items, byItemId);
    },
    enabled: !!serviceFlowId,
  });
}

export function useCreateServiceFlow() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: {
      campusId: string;
      ministryType: string;
      serviceDate: string;
      draftSetId?: string | null;
      customServiceId?: string | null;
      createdFromTemplateId?: string | null;
      createdBy: string;
    }) => {
      const insertWithCustom = await supabase
        .from("service_flows")
        .insert({
          campus_id: params.campusId,
          ministry_type: params.ministryType,
          service_date: params.serviceDate,
          draft_set_id: params.draftSetId || null,
          custom_service_id: params.customServiceId || null,
          created_from_template_id: params.createdFromTemplateId || null,
          created_by: params.createdBy,
        })
        .select()
        .single();
      if (!insertWithCustom.error) {
        return insertWithCustom.data as ServiceFlow;
      }
      if (!isMissingServiceFlowCustomServiceColumn(insertWithCustom.error)) {
        throw insertWithCustom.error;
      }

      const { data, error } = await supabase
        .from("service_flows")
        .insert({
          campus_id: params.campusId,
          ministry_type: params.ministryType,
          service_date: params.serviceDate,
          draft_set_id: params.draftSetId || null,
          created_from_template_id: params.createdFromTemplateId || null,
          created_by: params.createdBy,
        })
        .select()
        .single();
      if (error) throw error;
      return data as ServiceFlow;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["service-flow", variables.campusId, variables.ministryType, variables.serviceDate],
      });
    },
    onError: (error) => {
      toast({
        title: "Error creating service flow",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useSaveServiceFlowItem() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (item: {
      id?: string;
      service_flow_id: string;
      item_type: "header" | "item" | "song";
      title: string;
      duration_seconds?: number | null;
      sequence_order: number;
      song_id?: string | null;
      song_key?: string | null;
      vocalist_id?: string | null;
      notes?: string | null;
    }) => {
      if (item.id) {
        const { data, error } = await supabase
          .from("service_flow_items")
          .update({
            item_type: item.item_type,
            title: item.title,
            duration_seconds: item.duration_seconds,
            sequence_order: item.sequence_order,
            song_id: item.song_id,
            song_key: item.song_key,
            vocalist_id: item.vocalist_id,
            notes: item.notes,
          })
          .eq("id", item.id)
          .select()
          .single();

        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from("service_flow_items")
          .insert({
            service_flow_id: item.service_flow_id,
            item_type: item.item_type,
            title: item.title,
            duration_seconds: item.duration_seconds,
            sequence_order: item.sequence_order,
            song_id: item.song_id,
            song_key: item.song_key,
            vocalist_id: item.vocalist_id,
            notes: item.notes,
          })
          .select()
          .single();

        if (error) throw error;
        return data;
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ["service-flow-items", data.service_flow_id],
      });
    },
    onError: (error) => {
      toast({
        title: "Error saving item",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useDeleteServiceFlowItem() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: { id: string; serviceFlowId: string }) => {
      const { error } = await supabase
        .from("service_flow_items")
        .delete()
        .eq("id", params.id);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["service-flow-items", variables.serviceFlowId],
      });
    },
    onError: (error) => {
      toast({
        title: "Error deleting item",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useReorderServiceFlowItems() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: {
      serviceFlowId: string;
      items: { id: string; sequence_order: number }[];
    }) => {
      // Update each item's sequence_order
      const updates = params.items.map((item) =>
        supabase
          .from("service_flow_items")
          .update({ sequence_order: item.sequence_order })
          .eq("id", item.id)
      );

      const results = await Promise.all(updates);
      const errors = results.filter((r) => r.error);
      if (errors.length > 0) throw errors[0].error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["service-flow-items", variables.serviceFlowId],
      });
    },
    onError: (error) => {
      toast({
        title: "Error reordering items",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

// Helper to normalize song titles for matching (strip parentheticals, etc.)
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s*\(.*?\)\s*/g, "") // Remove parentheticals like (feat. X)
    .replace(/[^a-z0-9\s]/g, "") // Remove special chars
    .replace(/\s+/g, " ")
    .trim();
}

function isTemplateSongPlaceholder(templateItem: {
  item_type?: string | null;
  title?: string | null;
}): boolean {
  if (templateItem.item_type === "song_placeholder") return true;
  // Headers are never song placeholders.
  if (templateItem.item_type === "header") return false;
  // For "item" (or untyped) rows, a literal "Song 1" / "Song 2" label still counts as a
  // song placeholder. Renaming the row to anything else (e.g. "Morning Meeting") turns it
  // into a plain item, which is how a template author opts a row out of being a song slot.
  const title = (templateItem.title || "").trim();
  return /^song\s*\d+\b/i.test(title);
}

// Headers that mark the start of the afternoon portion of a full-day Kids Camp template.
const KIDS_CAMP_AFTERNOON_SECTION_PATTERN = /\b(afternoon|pm\b|lunch|evening|session\s*[2-9])\b/i;

type TemplatePlaceholderItem = {
  item_type?: string | null;
  title?: string | null;
  sequence_order: number;
};

// A combined Kids Camp flow spans both sessions, so its template's song placeholders
// must be split by section: placeholders under morning headers receive the Morning set's
// songs and placeholders under an afternoon header receive the Afternoon set's songs.
// This prevents the Morning set from spilling into afternoon slots (and vice versa) when
// the per-session song counts don't line up with raw placeholder order.
function buildKidsCampPlaceholderSongMap<TSong>(
  templateItems: TemplatePlaceholderItem[],
  morningSongs: TSong[],
  afternoonSongs: TSong[],
): { byOrder: Map<number, TSong>; assigned: Set<TSong> } {
  const morningPlaceholderOrders: number[] = [];
  const afternoonPlaceholderOrders: number[] = [];
  let inAfternoon = false;

  for (const item of templateItems) {
    if (item.item_type === "header") {
      if (KIDS_CAMP_AFTERNOON_SECTION_PATTERN.test(item.title || "")) {
        inAfternoon = true;
      }
      continue;
    }
    if (isTemplateSongPlaceholder(item)) {
      (inAfternoon ? afternoonPlaceholderOrders : morningPlaceholderOrders).push(item.sequence_order);
    }
  }

  const byOrder = new Map<number, TSong>();
  const assigned = new Set<TSong>();

  // No afternoon section detected: keep the legacy behavior of filling placeholders in
  // order with Morning songs first, then Afternoon songs.
  if (afternoonPlaceholderOrders.length === 0) {
    morningPlaceholderOrders.forEach((order, index) => {
      const song =
        index < morningSongs.length
          ? morningSongs[index]
          : afternoonSongs[index - morningSongs.length];
      if (song) {
        byOrder.set(order, song);
        assigned.add(song);
      }
    });
    return { byOrder, assigned };
  }

  morningPlaceholderOrders.forEach((order, index) => {
    const song = morningSongs[index];
    if (song) {
      byOrder.set(order, song);
      assigned.add(song);
    }
  });
  afternoonPlaceholderOrders.forEach((order, index) => {
    const song = afternoonSongs[index];
    if (song) {
      byOrder.set(order, song);
      assigned.add(song);
    }
  });

  return { byOrder, assigned };
}

// Helper to calculate song durations from reference track markers
type MarkerDurations = {
  byTitle: Map<string, number>;
  ordered: number[];
};

async function getSongDurationsFromMarkers(
  campusId: string,
  ministryType: string,
  serviceDate: string,
  draftSetId?: string | null
): Promise<MarkerDurations> {
  const durationMap = new Map<string, number>();
  const orderedDurations: number[] = [];

  // Get the playlist for this service.
  // Prefer exact draft_set_id linkage to avoid ministry/date ambiguity on custom services.
  let playlist: { id: string } | null = null;
  if (draftSetId) {
    const byDraftSet = await supabase
      .from("setlist_playlists")
      .select("id")
      .eq("draft_set_id", draftSetId)
      .maybeSingle();
    if (byDraftSet.error) throw byDraftSet.error;
    playlist = (byDraftSet.data as { id: string } | null) || null;
  }

  if (!playlist) {
    const byScope = await supabase
      .from("setlist_playlists")
      .select("id")
      .eq("campus_id", campusId)
      .eq("ministry_type", ministryType)
      .eq("service_date", serviceDate)
      .maybeSingle();
    if (byScope.error) throw byScope.error;
    playlist = (byScope.data as { id: string } | null) || null;
  }

  // Weekend-based fallback: use same-campus same-date weekend playlist markers.
  if (!playlist) {
    const weekendFallback = await supabase
      .from("setlist_playlists")
      .select("id")
      .eq("campus_id", campusId)
      .eq("service_date", serviceDate)
      .in("ministry_type", ["weekend", "weekend_team"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (weekendFallback.error) throw weekendFallback.error;
    playlist = (weekendFallback.data as { id: string } | null) || null;
  }

  if (!playlist) return { byTitle: durationMap, ordered: orderedDurations };

  // Get reference tracks and their markers (include duration_seconds for last song calc)
  const { data: refTracks } = await supabase
    .from("setlist_playlist_reference_tracks")
    .select(`
      id,
      duration_seconds,
      reference_track_markers (
        title,
        timestamp_seconds,
        sequence_order
      )
    `)
    .eq("playlist_id", playlist.id)
    .order("sequence_order", { ascending: true });

  if (!refTracks || refTracks.length === 0) return { byTitle: durationMap, ordered: orderedDurations };

  // Process each reference track's markers
  for (const track of refTracks) {
    const markers = (track.reference_track_markers || []).sort(
      (a: any, b: any) => a.sequence_order - b.sequence_order
    );
    const totalTrackDuration = (track as any).duration_seconds as number | null;

    for (let i = 0; i < markers.length; i++) {
      const marker = markers[i];
      const nextMarker = markers[i + 1];

      let duration: number | null = null;

      if (nextMarker) {
        // Duration = next marker timestamp - this marker timestamp
        duration = nextMarker.timestamp_seconds - marker.timestamp_seconds;
      } else if (totalTrackDuration) {
        // Last marker: duration = total track length - this marker timestamp
        duration = totalTrackDuration - marker.timestamp_seconds;
      }

      if (duration && duration > 0) {
        const normalizedTitle = normalizeTitle(marker.title);
        durationMap.set(normalizedTitle, duration);
        orderedDurations.push(duration);
      }
    }
  }

  return { byTitle: durationMap, ordered: orderedDurations };
}

// Helper to generate service flow from template when setlist is published
export async function generateServiceFlowFromTemplate(params: {
  campusId: string | null;
  ministryType: string;
  serviceDate: string;
  draftSetId?: string | null;
  customServiceId?: string | null;
  createdBy: string;
  forceTemplateResync?: boolean;
  songs: Array<{
    id: string;
    title: string;
    key?: string | null;
    vocalistId?: string | null;
    vocalistIds?: string[];
  }>;
}) {
  let serviceFlowCampusId = params.campusId;
  if (isNetworkWideMinistryType(params.ministryType)) {
    const { data: networkWideCampus, error: networkWideCampusError } = await supabase
      .from("campuses")
      .select("id")
      .eq("is_network_wide", true)
      .maybeSingle();
    if (networkWideCampusError) throw networkWideCampusError;
    serviceFlowCampusId = networkWideCampus?.id || serviceFlowCampusId;
  }
  if (!serviceFlowCampusId) {
    throw new Error("A campus is required to generate a service flow.");
  }

  const resolveTemplateForCandidate = async (campusId: string, candidateMinistry: string) => {
    const { data: candidateTemplates, error: templateError } = await supabase
      .from("service_flow_templates")
      .select("id, campus_id, ministry_type, name, updated_at")
      .eq("campus_id", campusId)
      .eq("ministry_type", candidateMinistry)
      .order("updated_at", { ascending: false });

    if (templateError) throw templateError;
    if (!candidateTemplates || candidateTemplates.length === 0) return null;

    for (const candidate of candidateTemplates) {
      const { data: existingItems, error: itemsError } = await supabase
        .from("service_flow_template_items")
        .select("id")
        .eq("template_id", candidate.id)
        .limit(1);
      if (itemsError) throw itemsError;
      if (existingItems && existingItems.length > 0) {
        return candidate as any;
      }
    }

    return candidateTemplates[0] as any;
  };

  // Detect whether this published set is tied to a specialty custom service.
  const { data: setContext } = params.draftSetId
    ? await supabase
      .from("draft_sets")
      .select("custom_service_id, custom_services(ministry_type, service_name)")
      .eq("id", params.draftSetId)
      .maybeSingle()
    : { data: null };

  const resolvedCustomServiceId = (setContext as any)?.custom_service_id || params.customServiceId || null;
  let customService = (setContext as any)?.custom_services;

  if (!customService && resolvedCustomServiceId) {
    const { data: fetchedCustomService } = await supabase
      .from("custom_services")
      .select("ministry_type, service_name")
      .eq("id", resolvedCustomServiceId)
      .maybeSingle();
    customService = fetchedCustomService;
  }

  const isPrayerNightService =
    customService?.ministry_type === "prayer_night" ||
    PRAYER_NIGHT_PATTERN.test(customService?.service_name || "") ||
    params.ministryType === "prayer_night";
  const isKidsCampService =
    customService?.ministry_type === "kids_camp" ||
    KIDS_CAMP_PATTERN.test(customService?.service_name || "") ||
    isKidsCampSetMinistryType(params.ministryType);

  // Resolve template ministry:
  // - Specialty custom services should use their own templates only.
  //   If missing, we'll still generate a flow from songs without applying weekend templates.
  // - Session variants (student_camp_morning) fall back to the base template (student_camp).
  const sessionBaseMinistry = isSessionSetMinistryType(params.ministryType)
    ? normalizeSessionSetMinistryType(params.ministryType)
    : null;
  const templateMinistryCandidates = Array.from(
    new Set(
      [
        ...(isPrayerNightService
          ? ["prayer_night"]
          : isKidsCampService
            ? ["kids_camp"]
            : [params.ministryType]),
        ...(sessionBaseMinistry && sessionBaseMinistry !== params.ministryType
          ? [sessionBaseMinistry]
          : []),
      ].filter(Boolean) as string[],
    ),
  );

  let template: any = null;
  let resolvedMinistryType = params.ministryType;

  for (const candidate of templateMinistryCandidates) {
    const candidateTemplate = await resolveTemplateForCandidate(serviceFlowCampusId, candidate);

    if (candidateTemplate) {
      template = candidateTemplate;
      if (isKidsCampService && resolvedCustomServiceId) {
        resolvedMinistryType = "kids_camp";
      } else if (
        candidate === "kids_camp" &&
        params.ministryType !== "kids_camp" &&
        isKidsCampSetMinistryType(params.ministryType)
      ) {
        resolvedMinistryType = params.ministryType;
      } else if (sessionBaseMinistry && candidate === sessionBaseMinistry) {
        // Keep the session variant on the generated flow even when using the base template.
        resolvedMinistryType = params.ministryType;
      } else {
        resolvedMinistryType = candidate;
      }
      break;
    }
  }

  // If a specialty service has no template, still classify the generated flow correctly.
  if (!template && isPrayerNightService) {
    resolvedMinistryType = "prayer_night";
  }
  if (!template && isKidsCampService) {
    resolvedMinistryType = resolvedCustomServiceId
      ? "kids_camp"
      : isKidsCampSetMinistryType(params.ministryType) ? params.ministryType : "kids_camp";
  }


  // For Kids Camp, combine morning + afternoon session songs into one ordered list.
  // The morning session's songs fill the template's morning-section song placeholders and
  // the afternoon session's songs fill the afternoon-section placeholders (see
  // buildKidsCampPlaceholderSongMap). The combined list is also used as a fallback for
  // templates that don't separate the sessions.
  const isKidsCampCombinedFlow = isKidsCampService && resolvedCustomServiceId !== null;
  let effectiveSongs = params.songs;
  let kidsCampMorningSongs: typeof effectiveSongs | null = null;
  let kidsCampAfternoonSongs: typeof effectiveSongs | null = null;

  if (isKidsCampCombinedFlow) {
    // Match sessions by campus + date + session ministry rather than strictly by the
    // resolved custom service. Morning and Afternoon sets are not always linked to the
    // same Kids Camp custom service (or any), so a strict custom_service_id filter can
    // miss a session and leave its placeholders empty. We still prefer the set tied to
    // the resolved custom service when more than one exists for a session.
    const { data: sessionSets } = await supabase
      .from("draft_sets")
      .select("id, ministry_type, custom_service_id, published_at")
      .eq("campus_id", serviceFlowCampusId)
      .eq("plan_date", params.serviceDate)
      .eq("status", "published")
      .in("ministry_type", ["kids_camp_morning", "kids_camp_afternoon"])
      .order("published_at", { ascending: false });

    if (sessionSets && sessionSets.length > 0) {
      const pickSessionSet = (ministry: string): { id: string } | undefined => {
        const matches = (sessionSets as any[]).filter((s) => s.ministry_type === ministry);
        if (matches.length === 0) return undefined;
        return (
          matches.find((s) => s.custom_service_id === resolvedCustomServiceId) || matches[0]
        ) as { id: string };
      };

      const morningSet = pickSessionSet("kids_camp_morning");
      const afternoonSet = pickSessionSet("kids_camp_afternoon");

      const fetchSessionSongs = async (setId: string): Promise<typeof effectiveSongs> => {
        const { data: setRows } = await supabase
          .from("draft_set_songs")
          .select("id, song_id, song_key, vocalist_id, songs(id, title), sequence_order")
          .eq("draft_set_id", setId)
          .order("sequence_order", { ascending: true });

        const rowIds = (setRows || []).map((r: any) => r.id as string);
        const { data: vocalistRows } = await supabase
          .from("draft_set_song_vocalists")
          .select("draft_set_song_id, vocalist_id")
          .in("draft_set_song_id", rowIds.length > 0 ? rowIds : ["00000000-0000-0000-0000-000000000000"]);

        const vocalistMap = new Map<string, string[]>();
        for (const va of vocalistRows || []) {
          const existing = vocalistMap.get((va as any).draft_set_song_id) || [];
          existing.push((va as any).vocalist_id);
          vocalistMap.set((va as any).draft_set_song_id, existing);
        }

        return (setRows || []).map((r: any) => ({
          id: r.song_id as string,
          title: (r.songs as { id: string; title: string } | null)?.title || "Unknown Song",
          key: (r.song_key as string | null) || null,
          vocalistId: (r.vocalist_id as string | null) || null,
          vocalistIds: (vocalistMap.get(r.id) || []).filter(Boolean) as string[],
        }));
      };

      const morningSongs = morningSet ? await fetchSessionSongs(morningSet.id) : [];
      const afternoonSongs = afternoonSet ? await fetchSessionSongs(afternoonSet.id) : [];
      const combined = [...morningSongs, ...afternoonSongs];
      if (combined.length > 0) {
        effectiveSongs = combined;
        kidsCampMorningSongs = morningSongs;
        kidsCampAfternoonSongs = afternoonSongs;
      }
    }
  }

  // Get song durations from reference track markers
  const markerDurations = await getSongDurationsFromMarkers(
    serviceFlowCampusId,
    resolvedMinistryType,
    params.serviceDate,
    params.draftSetId
  );

  // Helper to get duration for a song from markers (title match first, positional fallback).
  const getDurationForSong = (songTitle: string, songIndex?: number): number | null => {
    const normalized = normalizeTitle(songTitle);
    return (
      markerDurations.byTitle.get(normalized) ??
      (typeof songIndex === "number" ? markerDurations.ordered[songIndex] ?? null : null)
    );
  };

  type ServiceFlowItemInsert = {
    service_flow_id: string;
    item_type: string;
    title: string;
    duration_seconds: number | null;
    sequence_order: number;
    song_id: string | null;
    song_key: string | null;
    vocalist_id: string | null;
  };

  const buildSongFlowItem = (
    serviceFlowId: string,
    song: (typeof effectiveSongs)[number],
    sequenceOrder: number,
    durationSeconds: number | null,
  ): ServiceFlowItemInsert => ({
    service_flow_id: serviceFlowId,
    item_type: "song",
    title: song.title,
    duration_seconds: durationSeconds,
    sequence_order: sequenceOrder,
    song_id: song.id,
    song_key: song.key || null,
    vocalist_id: song.vocalistId || null,
  });

  // Populate a flow purely from the setlist songs (used when there is no template,
  // or a template exists but has no items yet).
  const buildSongOnlyFlowItems = (serviceFlowId: string): ServiceFlowItemInsert[] =>
    effectiveSongs.map((song, index) =>
      buildSongFlowItem(serviceFlowId, song, index, getDurationForSong(song.title, index)),
    );

  // Expand a template into flow items, filling its song placeholders with the setlist songs.
  // For combined Kids Camp flows, placeholders are filled per session (morning vs afternoon)
  // instead of in one running order so songs land in the correct sections.
  const buildTemplateFlowItems = (
    serviceFlowId: string,
    templateItems: any[],
  ): ServiceFlowItemInsert[] => {
    const placeholderMap =
      isKidsCampCombinedFlow && kidsCampMorningSongs && kidsCampAfternoonSongs
        ? buildKidsCampPlaceholderSongMap(templateItems, kidsCampMorningSongs, kidsCampAfternoonSongs)
        : null;

    const flowItems: ServiceFlowItemInsert[] = [];
    const usedSongs = new Set<(typeof effectiveSongs)[number]>();
    let songIndex = 0;

    for (const templateItem of templateItems) {
      if (isTemplateSongPlaceholder(templateItem)) {
        let song: (typeof effectiveSongs)[number] | undefined;
        if (placeholderMap) {
          song = placeholderMap.byOrder.get(templateItem.sequence_order);
        } else if (songIndex < effectiveSongs.length) {
          song = effectiveSongs[songIndex];
          songIndex++;
        }

        if (song) {
          const songPosition = effectiveSongs.indexOf(song);
          const markerDuration = getDurationForSong(
            song.title,
            songPosition >= 0 ? songPosition : undefined,
          );
          flowItems.push(
            buildSongFlowItem(
              serviceFlowId,
              song,
              templateItem.sequence_order,
              markerDuration ?? templateItem.default_duration_seconds,
            ),
          );
          usedSongs.add(song);
        } else {
          // No song for this placeholder: keep the template's label as a plain item.
          flowItems.push({
            service_flow_id: serviceFlowId,
            item_type: "item",
            title: templateItem.title,
            duration_seconds: templateItem.default_duration_seconds,
            sequence_order: templateItem.sequence_order,
            song_id: null,
            song_key: null,
            vocalist_id: null,
          });
        }
      } else {
        flowItems.push({
          service_flow_id: serviceFlowId,
          item_type: templateItem.item_type,
          title: templateItem.title,
          duration_seconds: templateItem.default_duration_seconds,
          sequence_order: templateItem.sequence_order,
          song_id: null,
          song_key: null,
          vocalist_id: null,
        });
      }
    }

    // Append any songs that didn't land in a placeholder so nothing is dropped.
    const leftoverSongs = placeholderMap
      ? effectiveSongs.filter((song) => !usedSongs.has(song))
      : effectiveSongs.slice(songIndex);

    for (const song of leftoverSongs) {
      const songPosition = effectiveSongs.indexOf(song);
      flowItems.push(
        buildSongFlowItem(
          serviceFlowId,
          song,
          flowItems.length,
          getDurationForSong(song.title, songPosition >= 0 ? songPosition : undefined),
        ),
      );
    }

    return flowItems;
  };

  const syncServiceFlowSongVocalists = async (serviceFlowId: string) => {
    if (!params.draftSetId) return;

    const { data: draftSongs, error: draftSongsError } = await supabase
      .from("draft_set_songs")
      .select("id, sequence_order, vocalist_id")
      .eq("draft_set_id", params.draftSetId)
      .order("sequence_order", { ascending: true });
    if (draftSongsError || !draftSongs || draftSongs.length === 0) return;

    const draftSongIds = draftSongs.map((s: any) => s.id);
    const { data: draftSongVocalists } = await supabase
      .from("draft_set_song_vocalists")
      .select("draft_set_song_id, vocalist_id")
      .in("draft_set_song_id", draftSongIds.length > 0 ? draftSongIds : ["00000000-0000-0000-0000-000000000000"]);

    const draftSongVocalistMap = new Map<string, string[]>();
    for (const row of draftSongVocalists || []) {
      const existing = draftSongVocalistMap.get(row.draft_set_song_id) || [];
      existing.push(row.vocalist_id);
      draftSongVocalistMap.set(row.draft_set_song_id, existing);
    }

    const { data: flowSongItems, error: flowItemsError } = await supabase
      .from("service_flow_items")
      .select("id, sequence_order, vocalist_id")
      .eq("service_flow_id", serviceFlowId)
      .eq("item_type", "song")
      .order("sequence_order", { ascending: true });
    if (flowItemsError || !flowSongItems || flowSongItems.length === 0) return;

    const flowItemIds = flowSongItems.map((item: any) => item.id as string);
    const { data: existingFlowVocalists } = await supabase
      .from("service_flow_item_vocalists")
      .select("service_flow_item_id, vocalist_id")
      .in("service_flow_item_id", flowItemIds.length > 0 ? flowItemIds : ["00000000-0000-0000-0000-000000000000"]);

    const existingVocalistMap = new Map<string, string[]>();
    for (const row of existingFlowVocalists || []) {
      const existing = existingVocalistMap.get(row.service_flow_item_id) || [];
      existing.push(row.vocalist_id);
      existingVocalistMap.set(row.service_flow_item_id, existing);
    }

    const sameVocalistIds = (a: string[], b: string[]) => {
      if (a.length !== b.length) return false;
      const sortedA = [...a].sort();
      const sortedB = [...b].sort();
      return sortedA.every((id, index) => id === sortedB[index]);
    };

    const writeTasks: Promise<unknown>[] = [];
    const count = Math.min(draftSongs.length, flowSongItems.length);
    for (let i = 0; i < count; i++) {
      const draftSong: any = draftSongs[i];
      const flowItem: any = flowSongItems[i];

      const vocalistIdsRaw = draftSongVocalistMap.get(draftSong.id) || [];
      const vocalistIds = vocalistIdsRaw.length > 0
        ? Array.from(new Set(vocalistIdsRaw))
        : (draftSong.vocalist_id ? [draftSong.vocalist_id as string] : []);
      const primaryVocalistId = vocalistIds[0] || null;
      const currentVocalistIds = existingVocalistMap.get(flowItem.id) || (
        flowItem.vocalist_id ? [flowItem.vocalist_id as string] : []
      );

      if ((flowItem.vocalist_id ?? null) !== primaryVocalistId) {
        writeTasks.push(
          supabase
            .from("service_flow_items")
            .update({ vocalist_id: primaryVocalistId })
            .eq("id", flowItem.id)
        );
      }

      if (sameVocalistIds(vocalistIds, currentVocalistIds)) {
        continue;
      }

      writeTasks.push(
        (async () => {
          await supabase
            .from("service_flow_item_vocalists")
            .delete()
            .eq("service_flow_item_id", flowItem.id);

          if (vocalistIds.length === 0) return;

          await supabase
            .from("service_flow_item_vocalists")
            .insert(vocalistIds.map((vocalist_id) => ({ service_flow_item_id: flowItem.id, vocalist_id })));
        })()
      );
    }

    if (writeTasks.length > 0) {
      await Promise.all(writeTasks);
    }
  };

  const getSongVocalistIds = (song: { vocalistIds?: string[]; vocalistId?: string | null }) => {
    const ids = (song.vocalistIds || []).filter(Boolean);
    if (ids.length > 0) return Array.from(new Set(ids));
    return song.vocalistId ? [song.vocalistId] : [];
  };

  const insertFlowItemsWithVocalists = async (
    serviceFlowId: string,
    flowItems: Array<{
      service_flow_id: string;
      item_type: string;
      title: string;
      duration_seconds: number | null;
      sequence_order: number;
      song_id: string | null;
      song_key: string | null;
      vocalist_id: string | null;
    }>
  ) => {
    if (flowItems.length === 0) return;
    const { error: insertError } = await supabase.from("service_flow_items").insert(flowItems);
    if (insertError) throw insertError;

    const songItems = flowItems.filter((item) => item.item_type === "song");
    if (songItems.length === 0) return;

    const { data: insertedSongItems, error: insertedSongItemsError } = await supabase
      .from("service_flow_items")
      .select("id, sequence_order")
      .eq("service_flow_id", serviceFlowId)
      .eq("item_type", "song")
      .order("sequence_order", { ascending: true });

    if (insertedSongItemsError || !insertedSongItems) return;

    const vocalistRows: Array<{ service_flow_item_id: string; vocalist_id: string }> = [];
    for (let idx = 0; idx < Math.min(insertedSongItems.length, effectiveSongs.length); idx++) {
      const item = insertedSongItems[idx];
      const song = effectiveSongs[idx];
      const vocalistIds = getSongVocalistIds(song);
      for (const vocalistId of vocalistIds) {
        vocalistRows.push({ service_flow_item_id: item.id, vocalist_id: vocalistId });
      }
    }

    if (vocalistRows.length === 0) return;

    const { error: vocalistInsertError } = await supabase
      .from("service_flow_item_vocalists")
      .insert(vocalistRows);
    if (vocalistInsertError) {
      // Keep legacy single-vocalist behavior working even if junction insert fails.
      console.error("Failed to insert service flow co-vocalists:", vocalistInsertError);
    }
  };

  // Check if service flow already exists
  let existingFlow: {
    id: string;
    ministry_type?: string | null;
    custom_service_id?: string | null;
    created_from_template_id?: string | null;
    updated_at?: string | null;
  } | null = null;

  if (params.draftSetId) {
    const existingByDraftSet = await supabase
      .from("service_flows")
      .select("id, ministry_type, custom_service_id, created_from_template_id, updated_at")
      .eq("draft_set_id", params.draftSetId)
      .maybeSingle();
    if (existingByDraftSet.error) throw existingByDraftSet.error;
    existingFlow = existingByDraftSet.data;
  }

  if (existingFlow && resolvedCustomServiceId) {
    const existingFlowMeta = existingFlow as {
      id: string;
      ministry_type?: string | null;
      custom_service_id?: string | null;
    };
    const hasMismatchedScope =
      (existingFlowMeta.ministry_type || null) !== resolvedMinistryType ||
      (existingFlowMeta.custom_service_id || null) !== resolvedCustomServiceId;

    if (hasMismatchedScope) {
      const scopedFlow = await supabase
        .from("service_flows")
        .select("id, ministry_type, custom_service_id, created_from_template_id, updated_at")
        .eq("campus_id", serviceFlowCampusId)
        .eq("ministry_type", resolvedMinistryType)
        .eq("service_date", params.serviceDate)
        .eq("custom_service_id", resolvedCustomServiceId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (scopedFlow.error) {
        if (!isMissingServiceFlowCustomServiceColumn(scopedFlow.error)) {
          throw scopedFlow.error;
        }
      } else if (scopedFlow.data && scopedFlow.data.id !== existingFlowMeta.id) {
        await supabase
          .from("service_flows")
          .update({ draft_set_id: null })
          .eq("id", existingFlowMeta.id);
        existingFlow = scopedFlow.data;
      }
    }
  }

  // If not directly linked yet, reuse an existing flow in the same service scope
  // (campus + ministry + date [+ custom service]) to avoid unique index collisions.
  if (!existingFlow) {
    const scopedBase = supabase
      .from("service_flows")
      .select("id, ministry_type, custom_service_id, created_from_template_id, updated_at")
      .eq("campus_id", serviceFlowCampusId)
      .eq("ministry_type", resolvedMinistryType)
      .eq("service_date", params.serviceDate)
      .order("updated_at", { ascending: false })
      .limit(1);

    if (resolvedCustomServiceId) {
      const scopedWithCustom = await scopedBase
        .eq("custom_service_id", resolvedCustomServiceId)
        .maybeSingle();

      if (scopedWithCustom.error) {
        if (!isMissingServiceFlowCustomServiceColumn(scopedWithCustom.error)) {
          throw scopedWithCustom.error;
        }
        const scopedFallback = await supabase
          .from("service_flows")
          .select("id, ministry_type, custom_service_id, created_from_template_id, updated_at")
          .eq("campus_id", serviceFlowCampusId)
          .eq("ministry_type", resolvedMinistryType)
          .eq("service_date", params.serviceDate)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (scopedFallback.error) throw scopedFallback.error;
        existingFlow = scopedFallback.data;
      } else {
        existingFlow = scopedWithCustom.data;
      }
    } else {
      const scopedStandard = await scopedBase.is("custom_service_id", null).maybeSingle();
      if (scopedStandard.error) {
        if (!isMissingServiceFlowCustomServiceColumn(scopedStandard.error)) {
          throw scopedStandard.error;
        }
        const scopedFallback = await supabase
          .from("service_flows")
          .select("id, ministry_type, custom_service_id, created_from_template_id, updated_at")
          .eq("campus_id", serviceFlowCampusId)
          .eq("ministry_type", resolvedMinistryType)
          .eq("service_date", params.serviceDate)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (scopedFallback.error) throw scopedFallback.error;
        existingFlow = scopedFallback.data;
      } else {
        existingFlow = scopedStandard.data;
      }
    }
  }

  if (existingFlow) {
    // Update existing flow linkage and ensure it has items.
    const existingFlowMeta = existingFlow as {
      id: string;
      ministry_type?: string | null;
      custom_service_id?: string | null;
      created_from_template_id?: string | null;
      updated_at?: string | null;
    };

    const updatePayloadWithCustom = {
      draft_set_id: params.draftSetId || null,
      ministry_type: resolvedMinistryType,
      custom_service_id: resolvedCustomServiceId,
      created_from_template_id: template?.id || null,
    };
    const { error: updateWithCustomError } = await supabase
      .from("service_flows")
      .update(updatePayloadWithCustom)
      .eq("id", existingFlow.id);
    if (updateWithCustomError) {
      if (!isMissingServiceFlowCustomServiceColumn(updateWithCustomError)) {
        throw updateWithCustomError;
      }
      const { error: updateFallbackError } = await supabase
        .from("service_flows")
        .update({
          draft_set_id: params.draftSetId || null,
          ministry_type: resolvedMinistryType,
          created_from_template_id: template?.id || null,
        })
        .eq("id", existingFlow.id);
      if (updateFallbackError) throw updateFallbackError;
    }

    const { data: existingItems } = await supabase
      .from("service_flow_items")
      .select("id, item_type, title, duration_seconds, sequence_order")
      .eq("service_flow_id", existingFlow.id)
      .order("sequence_order", { ascending: true });

    // A saved flow is date-specific working data. Never replace its items merely because
    // the template, ministry metadata, or linked set changed. Rebuilding is destructive
    // and must only happen through an explicit caller such as the Rebuild button.
    const requiresTemplateResync = !!template && params.forceTemplateResync === true;

    if (existingItems && existingItems.length > 0 && !requiresTemplateResync) {
      const updates: Promise<any>[] = [];
      const songItems = (existingItems as any[]).filter((i) => i.item_type === "song");

      songItems.forEach((item, index) => {
        const titleDuration = markerDurations.byTitle.get(normalizeTitle(item.title || ""));
        const orderedDuration = markerDurations.ordered[index];
        const duration = titleDuration ?? orderedDuration ?? null;

        if (duration && duration > 0 && (!item.duration_seconds || item.duration_seconds <= 0)) {
          updates.push(
            supabase
              .from("service_flow_items")
              .update({ duration_seconds: duration })
              .eq("id", item.id)
          );
        }
      });

      if (updates.length > 0) {
        await Promise.all(updates);
      }
      if (!isKidsCampCombinedFlow) {
        await syncServiceFlowSongVocalists(existingFlow.id);
      }
      return existingFlow.id;
    }

    if (existingItems && existingItems.length > 0 && requiresTemplateResync) {
      const { error: deleteItemsError } = await supabase
        .from("service_flow_items")
        .delete()
        .eq("service_flow_id", existingFlow.id);
      if (deleteItemsError) throw deleteItemsError;
    }

    // If flow exists but has no items, populate it below using template/song data.
    const { data: reusedFlow } = await supabase
      .from("service_flows")
      .select("*")
      .eq("id", existingFlow.id)
      .single();

    if (reusedFlow) {
      const newFlow = reusedFlow as { id: string };

      if (template) {
        const { data: templateItems } = await supabase
          .from("service_flow_template_items")
          .select("*")
          .eq("template_id", template.id)
          .order("sequence_order", { ascending: true });

        const flowItems =
          templateItems && templateItems.length > 0
            ? buildTemplateFlowItems(newFlow.id, templateItems)
            : buildSongOnlyFlowItems(newFlow.id);

        await insertFlowItemsWithVocalists(newFlow.id, flowItems);
      } else {
        await insertFlowItemsWithVocalists(newFlow.id, buildSongOnlyFlowItems(newFlow.id));
      }

      // Kids Camp combined flows have vocalist data baked into effectiveSongs from both
      // sessions; the single-set syncServiceFlowSongVocalists would mis-map positions.
      if (!isKidsCampCombinedFlow) {
        await syncServiceFlowSongVocalists(newFlow.id);
      }
    }

    return existingFlow.id;
  }

  // Create new service flow
  const flowInsertWithCustom = {
    campus_id: serviceFlowCampusId,
    ministry_type: resolvedMinistryType,
    service_date: params.serviceDate,
    draft_set_id: params.draftSetId || null,
    custom_service_id: resolvedCustomServiceId,
    created_from_template_id: template?.id || null,
    created_by: params.createdBy,
  };

  let newFlow: any = null;
  const withCustomResult = await supabase
    .from("service_flows")
    .insert(flowInsertWithCustom)
    .select()
    .single();
  if (withCustomResult.error) {
    if (!isMissingServiceFlowCustomServiceColumn(withCustomResult.error)) {
      throw withCustomResult.error;
    }

    const { data: fallbackFlow, error: fallbackError } = await supabase
      .from("service_flows")
      .insert({
        campus_id: serviceFlowCampusId,
        ministry_type: resolvedMinistryType,
        service_date: params.serviceDate,
        draft_set_id: params.draftSetId || null,
        created_from_template_id: template?.id || null,
        created_by: params.createdBy,
      })
      .select()
      .single();

    if (fallbackError) throw fallbackError;
    newFlow = fallbackFlow;
  } else {
    newFlow = withCustomResult.data;
  }

  if (template) {
    // Fetch template items
    const { data: templateItems } = await supabase
      .from("service_flow_template_items")
      .select("*")
      .eq("template_id", template.id)
      .order("sequence_order", { ascending: true });

    if (templateItems && templateItems.length > 0) {
      const flowItems = buildTemplateFlowItems(newFlow.id, templateItems);

      await insertFlowItemsWithVocalists(newFlow.id, flowItems);
    } else {
      // Template exists but has no items yet: still populate flow with setlist songs.
      const flowItems = buildSongOnlyFlowItems(newFlow.id);

      await insertFlowItemsWithVocalists(newFlow.id, flowItems);
    }
  } else {
    // No template - just add songs with marker-based durations
    await insertFlowItemsWithVocalists(newFlow.id, buildSongOnlyFlowItems(newFlow.id));
  }

  // Kids Camp combined flows have vocalist data baked into effectiveSongs from both
  // sessions; the single-set syncServiceFlowSongVocalists would mis-map positions.
  if (!isKidsCampCombinedFlow) {
    await syncServiceFlowSongVocalists(newFlow.id);
  }

  return newFlow.id;
}
