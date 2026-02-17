import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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
        if (byDraftSet) return byDraftSet;
      }

      // 2) For custom services, try custom-service scoped flow.
      if (customServiceId) {
        const byCustomService = await fetchSingle(
          supabase
            .from("service_flows")
            .eq("campus_id", campusId)
            .eq("ministry_type", ministryType)
            .eq("service_date", serviceDate)
            .eq("custom_service_id", customServiceId)
        );
        if (byCustomService) return byCustomService;
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
          const legacyPrayerCustom = await fetchSingle(
            supabase
              .from("service_flows")
              .eq("campus_id", campusId)
              .eq("ministry_type", "weekend")
              .eq("service_date", serviceDate)
              .eq("custom_service_id", customServiceId)
          );
          if (legacyPrayerCustom) return legacyPrayerCustom;
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
      return data as ServiceFlowItem[];
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
      const { data, error } = await supabase
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

// Helper to calculate song durations from reference track markers
async function getSongDurationsFromMarkers(
  campusId: string,
  ministryType: string,
  serviceDate: string
): Promise<Map<string, number>> {
  const durationMap = new Map<string, number>();

  // Get the playlist for this service
  const { data: playlist } = await supabase
    .from("setlist_playlists")
    .select("id")
    .eq("campus_id", campusId)
    .eq("ministry_type", ministryType)
    .eq("service_date", serviceDate)
    .maybeSingle();

  if (!playlist) return durationMap;

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

  if (!refTracks || refTracks.length === 0) return durationMap;

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
      }
    }
  }

  return durationMap;
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
  }>;
}) {
  const PRAYER_NIGHT_PATTERN = /\bprayer\s*night\b/i;

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
  // - Prayer Night services should use prayer_night templates first
  // - fallback to weekend template for legacy setups
  const templateMinistryCandidates = Array.from(
    new Set(
      isPrayerNightService
        ? ["prayer_night", "weekend", params.ministryType]
        : [params.ministryType]
    )
  );

  let template: any = null;
  let resolvedMinistryType = params.ministryType;

  for (const candidate of templateMinistryCandidates) {
    const { data: candidateTemplate } = await supabase
      .from("service_flow_templates")
      .select("*")
      .eq("campus_id", params.campusId)
      .eq("ministry_type", candidate)
      .maybeSingle();

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
  const songDurations = await getSongDurationsFromMarkers(
    params.campusId,
    resolvedMinistryType,
    params.serviceDate
  );

  // Check if service flow already exists
  const { data: existingFlow } = await supabase
    .from("service_flows")
    .select("id")
    .eq("draft_set_id", params.draftSetId)
    .maybeSingle();

  if (existingFlow) {
    // Update existing flow linkage and ensure it has items.
    await supabase
      .from("service_flows")
      .update({
        draft_set_id: params.draftSetId,
        ministry_type: resolvedMinistryType,
        custom_service_id: resolvedCustomServiceId,
      })
      .eq("id", existingFlow.id);

    const { data: existingItems } = await supabase
      .from("service_flow_items")
      .select("id")
      .eq("service_flow_id", existingFlow.id)
      .limit(1);

    if (existingItems && existingItems.length > 0) {
      return existingFlow.id;
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
      const getDurationForSong = (songTitle: string): number | null => {
        const normalized = normalizeTitle(songTitle);
        return songDurations.get(normalized) ?? null;
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
            if (templateItem.item_type === "song_placeholder") {
              if (songIndex < params.songs.length) {
                const song = params.songs[songIndex];
                const markerDuration = getDurationForSong(song.title);
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
            const markerDuration = getDurationForSong(song.title);
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

          if (flowItems.length > 0) {
            await supabase.from("service_flow_items").insert(flowItems);
          }
        }
      } else {
        const flowItems = params.songs.map((song, index) => ({
          service_flow_id: newFlow.id,
          item_type: "song" as const,
          title: song.title,
          duration_seconds: getDurationForSong(song.title),
          sequence_order: index,
          song_id: song.id,
          song_key: song.key || null,
          vocalist_id: song.vocalistId || null,
        }));

        if (flowItems.length > 0) {
          await supabase.from("service_flow_items").insert(flowItems);
        }
      }
    }

    return existingFlow.id;
  }

  // Create new service flow
  const { data: newFlow, error: flowError } = await supabase
    .from("service_flows")
    .insert({
      campus_id: params.campusId,
      ministry_type: resolvedMinistryType,
      service_date: params.serviceDate,
      draft_set_id: params.draftSetId,
      custom_service_id: resolvedCustomServiceId,
      created_from_template_id: template?.id || null,
      created_by: params.createdBy,
    })
    .select()
    .single();

  if (flowError) throw flowError;

  // Helper to get duration for a song from markers
  const getDurationForSong = (songTitle: string): number | null => {
    const normalized = normalizeTitle(songTitle);
    return songDurations.get(normalized) ?? null;
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
        if (templateItem.item_type === "song_placeholder") {
          // Expand song placeholders into actual songs
          if (songIndex < params.songs.length) {
            const song = params.songs[songIndex];
            // Try to get duration from markers, fallback to template default
            const markerDuration = getDurationForSong(song.title);
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
        const markerDuration = getDurationForSong(song.title);
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

      if (flowItems.length > 0) {
        await supabase.from("service_flow_items").insert(flowItems);
      }
    }
  } else {
    // No template - just add songs with marker-based durations
    const flowItems = params.songs.map((song, index) => ({
      service_flow_id: newFlow.id,
      item_type: "song" as const,
      title: song.title,
      duration_seconds: getDurationForSong(song.title),
      sequence_order: index,
      song_id: song.id,
      song_key: song.key || null,
      vocalist_id: song.vocalistId || null,
    }));

    if (flowItems.length > 0) {
      await supabase.from("service_flow_items").insert(flowItems);
    }
  }

  return newFlow.id;
}
