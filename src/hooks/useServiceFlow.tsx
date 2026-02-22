import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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
          if (customServiceId) {
            const byDraftSetCustomServiceId =
              (byDraftSet as { custom_service_id?: string | null }).custom_service_id ?? null;
            const byDraftSetMinistryType =
              (byDraftSet as { ministry_type?: string | null }).ministry_type ?? null;

            const customServiceMatches = byDraftSetCustomServiceId === customServiceId;
            const ministryMatches = byDraftSetMinistryType === ministryType;

            if (customServiceMatches && ministryMatches) {
              return byDraftSet;
            }
          } else {
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

export function useServiceFlowItems(serviceFlowId: string | null) {
  return useQuery({
    queryKey: ["service-flow-items", serviceFlowId],
    queryFn: async () => {
      if (!serviceFlowId) return [];
      
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
      const items = (data || []) as ServiceFlowItem[];

      const itemIds = items.map((i) => i.id);
      if (itemIds.length === 0) return items;

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

      return items.map((item) => {
        const linked = byItemId.get(item.id) || [];
        // Always include legacy single vocalist_id as fallback/first vocalist.
        if (item.vocalist && !linked.some((v) => v.id === item.vocalist!.id)) {
          linked.unshift({
            id: item.vocalist.id,
            full_name: item.vocalist.full_name,
            avatar_url: item.vocalist.avatar_url,
          });
        }
        return {
          ...item,
          vocalists: linked,
        };
      });
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
  const title = (templateItem.title || "").trim();
  // Backward compatibility: older templates used literal labels like "Song 1", "Song 2"
  // as placeholder rows instead of item_type = "song_placeholder".
  return /^song\s*\d+\b/i.test(title);
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
  campusId: string;
  ministryType: string;
  serviceDate: string;
  draftSetId: string;
  createdBy: string;
  songs: Array<{
    id: string;
    title: string;
    key?: string | null;
    vocalistId?: string | null;
    vocalistIds?: string[];
  }>;
}) {
  const PRAYER_NIGHT_PATTERN = /\bprayer\s*night\b/i;

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

  // Detect whether this published set is tied to a Prayer Night custom service.
  const { data: setContext } = await supabase
    .from("draft_sets")
    .select("custom_service_id, custom_services(ministry_type, service_name)")
    .eq("id", params.draftSetId)
    .maybeSingle();

  const resolvedCustomServiceId = (setContext as any)?.custom_service_id || null;
  const customService = (setContext as any)?.custom_services;
  const isPrayerNightService =
    customService?.ministry_type === "prayer_night" ||
    PRAYER_NIGHT_PATTERN.test(customService?.service_name || "");

  // Resolve template ministry:
  // - Prayer Night services should use prayer_night templates only.
  //   If missing, we'll still generate a flow from songs without applying weekend templates.
  const templateMinistryCandidates = Array.from(
    new Set(
      isPrayerNightService
        ? ["prayer_night"]
        : [params.ministryType]
    )
  );

  let template: any = null;
  let resolvedMinistryType = params.ministryType;

  for (const candidate of templateMinistryCandidates) {
    const candidateTemplate = await resolveTemplateForCandidate(params.campusId, candidate);

    if (candidateTemplate) {
      template = candidateTemplate;
      resolvedMinistryType = candidate;
      break;
    }
  }

  // If it's prayer night without a template, still classify generated flow as prayer_night.
  if (!template && isPrayerNightService) {
    resolvedMinistryType = "prayer_night";
  }

  // Get song durations from reference track markers
  const markerDurations = await getSongDurationsFromMarkers(
    params.campusId,
    resolvedMinistryType,
    params.serviceDate,
    params.draftSetId
  );

  const syncServiceFlowSongVocalists = async (serviceFlowId: string) => {
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

    const count = Math.min(draftSongs.length, flowSongItems.length);
    for (let i = 0; i < count; i++) {
      const draftSong: any = draftSongs[i];
      const flowItem: any = flowSongItems[i];

      const vocalistIdsRaw = draftSongVocalistMap.get(draftSong.id) || [];
      const vocalistIds = vocalistIdsRaw.length > 0
        ? Array.from(new Set(vocalistIdsRaw))
        : (draftSong.vocalist_id ? [draftSong.vocalist_id as string] : []);
      const primaryVocalistId = vocalistIds[0] || null;

      if ((flowItem.vocalist_id ?? null) !== primaryVocalistId) {
        await supabase
          .from("service_flow_items")
          .update({ vocalist_id: primaryVocalistId })
          .eq("id", flowItem.id);
      }

      await supabase
        .from("service_flow_item_vocalists")
        .delete()
        .eq("service_flow_item_id", flowItem.id);

      if (vocalistIds.length > 0) {
        await supabase
          .from("service_flow_item_vocalists")
          .insert(vocalistIds.map((vocalist_id) => ({ service_flow_item_id: flowItem.id, vocalist_id })));
      }
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
    for (let idx = 0; idx < Math.min(insertedSongItems.length, params.songs.length); idx++) {
      const item = insertedSongItems[idx];
      const song = params.songs[idx];
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
  let { data: existingFlow } = await supabase
    .from("service_flows")
    .select("id, ministry_type, custom_service_id, created_from_template_id")
    .eq("draft_set_id", params.draftSetId)
    .maybeSingle();

  // If not directly linked yet, reuse an existing flow in the same service scope
  // (campus + ministry + date [+ custom service]) to avoid unique index collisions.
  if (!existingFlow) {
    const scopedBase = supabase
      .from("service_flows")
      .select("id, ministry_type, custom_service_id, created_from_template_id")
      .eq("campus_id", params.campusId)
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
          .select("id, ministry_type, custom_service_id, created_from_template_id")
          .eq("campus_id", params.campusId)
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
          .select("id, ministry_type, custom_service_id, created_from_template_id")
          .eq("campus_id", params.campusId)
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
    };

    const updatePayloadWithCustom = {
      draft_set_id: params.draftSetId,
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
          draft_set_id: params.draftSetId,
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

    const hasLegacyPlaceholderRows = (existingItems || []).some((item: any) =>
      item.item_type !== "song" &&
      /^song\s*\d+\b/i.test((item.title || "").trim())
    );

    const requiresTemplateResync =
      !!template &&
      (
        (existingFlowMeta.created_from_template_id || null) !== (template.id || null) ||
        (existingFlowMeta.ministry_type || null) !== resolvedMinistryType ||
        (existingFlowMeta.custom_service_id || null) !== (resolvedCustomServiceId || null) ||
        hasLegacyPlaceholderRows
      );

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
      await syncServiceFlowSongVocalists(existingFlow.id);
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

      // Helper to get duration for a song from markers
      const getDurationForSong = (songTitle: string, songIndex?: number): number | null => {
        const normalized = normalizeTitle(songTitle);
        return markerDurations.byTitle.get(normalized) ?? (typeof songIndex === "number" ? markerDurations.ordered[songIndex] ?? null : null);
      };

      if (template) {
        const { data: templateItems } = await supabase
          .from("service_flow_template_items")
          .select("*")
          .eq("template_id", template.id)
          .order("sequence_order", { ascending: true });

        if (templateItems && templateItems.length > 0) {
          let songIndex = 0;
          const flowItems: Array<{
            service_flow_id: string;
            item_type: string;
            title: string;
            duration_seconds: number | null;
            sequence_order: number;
            song_id: string | null;
            song_key: string | null;
            vocalist_id: string | null;
          }> = [];

          for (const templateItem of templateItems) {
            if (isTemplateSongPlaceholder(templateItem)) {
              if (songIndex < params.songs.length) {
                const song = params.songs[songIndex];
                const markerDuration = getDurationForSong(song.title, songIndex);
                flowItems.push({
                  service_flow_id: newFlow.id,
                  item_type: "song",
                  title: song.title,
                  duration_seconds: markerDuration ?? templateItem.default_duration_seconds,
                  sequence_order: templateItem.sequence_order,
                  song_id: song.id,
                  song_key: song.key || null,
                  vocalist_id: song.vocalistId || null,
                });
                songIndex++;
              }
            } else {
              flowItems.push({
                service_flow_id: newFlow.id,
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

          while (songIndex < params.songs.length) {
            const song = params.songs[songIndex];
            const markerDuration = getDurationForSong(song.title, songIndex);
            flowItems.push({
              service_flow_id: newFlow.id,
              item_type: "song",
              title: song.title,
              duration_seconds: markerDuration,
              sequence_order: flowItems.length,
              song_id: song.id,
              song_key: song.key || null,
              vocalist_id: song.vocalistId || null,
            });
            songIndex++;
          }

          await insertFlowItemsWithVocalists(newFlow.id, flowItems);
        } else {
          const flowItems = params.songs.map((song, index) => ({
            service_flow_id: newFlow.id,
            item_type: "song" as const,
            title: song.title,
            duration_seconds: getDurationForSong(song.title, index),
            sequence_order: index,
            song_id: song.id,
            song_key: song.key || null,
            vocalist_id: song.vocalistId || null,
          }));

          await insertFlowItemsWithVocalists(newFlow.id, flowItems);
        }
      } else {
        const flowItems = params.songs.map((song, index) => ({
          service_flow_id: newFlow.id,
          item_type: "song" as const,
          title: song.title,
          duration_seconds: getDurationForSong(song.title, index),
          sequence_order: index,
          song_id: song.id,
          song_key: song.key || null,
          vocalist_id: song.vocalistId || null,
        }));

        await insertFlowItemsWithVocalists(newFlow.id, flowItems);
      }

      await syncServiceFlowSongVocalists(newFlow.id);
    }

    return existingFlow.id;
  }

  // Create new service flow
  const flowInsertWithCustom = {
    campus_id: params.campusId,
    ministry_type: resolvedMinistryType,
    service_date: params.serviceDate,
    draft_set_id: params.draftSetId,
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
        campus_id: params.campusId,
        ministry_type: resolvedMinistryType,
        service_date: params.serviceDate,
        draft_set_id: params.draftSetId,
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

  // Helper to get duration for a song from markers
  const getDurationForSong = (songTitle: string, songIndex?: number): number | null => {
    const normalized = normalizeTitle(songTitle);
    return markerDurations.byTitle.get(normalized) ?? (typeof songIndex === "number" ? markerDurations.ordered[songIndex] ?? null : null);
  };

  if (template) {
    // Fetch template items
    const { data: templateItems } = await supabase
      .from("service_flow_template_items")
      .select("*")
      .eq("template_id", template.id)
      .order("sequence_order", { ascending: true });

    if (templateItems && templateItems.length > 0) {
      let songIndex = 0;
      const flowItems: Array<{
        service_flow_id: string;
        item_type: string;
        title: string;
        duration_seconds: number | null;
        sequence_order: number;
        song_id: string | null;
        song_key: string | null;
        vocalist_id: string | null;
      }> = [];

      for (const templateItem of templateItems) {
        if (isTemplateSongPlaceholder(templateItem)) {
          // Expand song placeholders into actual songs
          if (songIndex < params.songs.length) {
            const song = params.songs[songIndex];
            // Try to get duration from markers, fallback to template default
            const markerDuration = getDurationForSong(song.title, songIndex);
            flowItems.push({
              service_flow_id: newFlow.id,
              item_type: "song",
              title: song.title,
              duration_seconds: markerDuration ?? templateItem.default_duration_seconds,
              sequence_order: templateItem.sequence_order,
              song_id: song.id,
              song_key: song.key || null,
              vocalist_id: song.vocalistId || null,
            });
            songIndex++;
          }
        } else {
          flowItems.push({
            service_flow_id: newFlow.id,
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

      // Add any remaining songs not covered by placeholders
      while (songIndex < params.songs.length) {
        const song = params.songs[songIndex];
        const markerDuration = getDurationForSong(song.title, songIndex);
        flowItems.push({
          service_flow_id: newFlow.id,
          item_type: "song",
          title: song.title,
          duration_seconds: markerDuration,
          sequence_order: flowItems.length,
          song_id: song.id,
          song_key: song.key || null,
          vocalist_id: song.vocalistId || null,
        });
        songIndex++;
      }

      await insertFlowItemsWithVocalists(newFlow.id, flowItems);
    } else {
      // Template exists but has no items yet: still populate flow with setlist songs.
      const flowItems = params.songs.map((song, index) => ({
        service_flow_id: newFlow.id,
        item_type: "song" as const,
        title: song.title,
        duration_seconds: getDurationForSong(song.title, index),
        sequence_order: index,
        song_id: song.id,
        song_key: song.key || null,
        vocalist_id: song.vocalistId || null,
      }));

      await insertFlowItemsWithVocalists(newFlow.id, flowItems);
    }
  } else {
    // No template - just add songs with marker-based durations
    const flowItems = params.songs.map((song, index) => ({
      service_flow_id: newFlow.id,
      item_type: "song" as const,
      title: song.title,
      duration_seconds: getDurationForSong(song.title, index),
      sequence_order: index,
      song_id: song.id,
      song_key: song.key || null,
      vocalist_id: song.vocalistId || null,
    }));

    await insertFlowItemsWithVocalists(newFlow.id, flowItems);
  }

  await syncServiceFlowSongVocalists(newFlow.id);

  return newFlow.id;
}
