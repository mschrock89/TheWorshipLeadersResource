import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { format } from "date-fns";
import { Plus, Calendar as CalendarIcon, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useCampuses } from "@/hooks/useCampuses";
import { useCampusSelection } from "@/components/layout/CampusSelectionContext";
import { MINISTRY_TYPES } from "@/lib/constants";
import { useServiceFlowTemplates } from "@/hooks/useServiceFlowTemplates";
import {
  useServiceFlow,
  useServiceFlowItems,
  useCreateServiceFlow,
  useSaveServiceFlowItem,
  useDeleteServiceFlowItem,
  useReorderServiceFlowItems,
  generateServiceFlowFromTemplate,
  ServiceFlowItem as ServiceFlowItemType,
} from "@/hooks/useServiceFlow";
import { ServiceFlowItem } from "./ServiceFlowItem";
import { AddItemDialog } from "./AddItemDialog";
import { formatTotalDuration } from "./DurationInput";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

interface ServiceFlowEditorProps {
  initialDate?: string;
  initialCampusId?: string;
  initialMinistryType?: string;
  initialDraftSetId?: string;
  initialCustomServiceId?: string;
}

export function ServiceFlowEditor({ 
  initialDate, 
  initialCampusId, 
  initialMinistryType,
  initialDraftSetId,
  initialCustomServiceId
}: ServiceFlowEditorProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();
  const { selectedCampusId, setSelectedCampusId } = useCampusSelection();
  const { data: campuses, isLoading: campusesLoading } = useCampuses();

  // Parse initial date from string
  const parsedInitialDate = initialDate ? new Date(initialDate + 'T00:00:00') : new Date();
  
  const [selectedDate, setSelectedDate] = useState<Date>(parsedInitialDate);
  // Default to "weekend" if initialMinistryType is "weekend_team" (consolidated filter, not a real ministry)
  const effectiveInitialMinistry = initialMinistryType === "weekend_team" ? "weekend" : initialMinistryType;
  const [ministryType, setMinistryType] = useState(effectiveInitialMinistry || "weekend");
  const [resolvedDraftSetId, setResolvedDraftSetId] = useState<string | null>(initialDraftSetId || null);
  const [resolvedCustomServiceId, setResolvedCustomServiceId] = useState<string | null>(initialCustomServiceId || null);
  const [boundServiceFlowId, setBoundServiceFlowId] = useState<string | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [draggedItem, setDraggedItem] = useState<ServiceFlowItemType | null>(null);
  const [localItems, setLocalItems] = useState<ServiceFlowItemType[]>([]);
  const [isAutoGenerating, setIsAutoGenerating] = useState(false);
  const hasAttemptedAutoGenerate = useRef(false);
  const hasAttemptedLiveTemplateSync = useRef(false);
  const hasSyncedVocalists = useRef(false);
  const hasInvalidatedOnLive = useRef(false);

  // Came from Live button (Calendar) when we have URL params
  const cameFromLive = !!(initialDate && (initialCampusId || initialMinistryType));

  // Sync initial campus from URL to context on mount
  useEffect(() => {
    if (initialCampusId && initialCampusId !== selectedCampusId) {
      setSelectedCampusId(initialCampusId);
    }
  }, [initialCampusId, selectedCampusId, setSelectedCampusId]);

  // Set campus from URL if provided
  const effectiveCampusId = initialCampusId || selectedCampusId;
  const handleCampusChange = (value: string) => {
    setSelectedCampusId(value);
  };

  const { data: campusTemplates = [] } = useServiceFlowTemplates(effectiveCampusId || null, null);

  const availableMinistryOptions = useMemo(() => {
    const fromTemplates = Array.from(
      new Set((campusTemplates || []).map((t) => t.ministry_type).filter(Boolean))
    );

    const include = new Set<string>(fromTemplates);
    if (ministryType) include.add(ministryType);
    if (effectiveInitialMinistry) include.add(effectiveInitialMinistry);
    if (initialMinistryType && initialMinistryType !== "weekend_team") include.add(initialMinistryType);

    return Array.from(include).map((value) => {
      const known = MINISTRY_TYPES.find((m) => m.value === value);
      return {
        value,
        label: known?.label || value,
      };
    });
  }, [campusTemplates, ministryType, effectiveInitialMinistry, initialMinistryType]);

  const serviceDateStr = format(selectedDate, "yyyy-MM-dd");

  const loadDraftSongsWithVocalists = useCallback(async (draftSetId: string) => {
    const { data: draftSongs, error: draftSongsError } = await supabase
      .from("draft_set_songs")
      .select(
        `
          id,
          sequence_order,
          song_key,
          vocalist_id,
          songs(
            id,
            title,
            author
          )
        `
      )
      .eq("draft_set_id", draftSetId)
      .order("sequence_order", { ascending: true });

    if (draftSongsError) throw draftSongsError;

    const draftSongIds = (draftSongs || []).map((row: any) => row.id);
    const { data: vocalistAssignments } = await supabase
      .from("draft_set_song_vocalists")
      .select("draft_set_song_id, vocalist_id")
      .in("draft_set_song_id", draftSongIds.length > 0 ? draftSongIds : ["00000000-0000-0000-0000-000000000000"]);

    const vocalistMap = new Map<string, string[]>();
    for (const assignment of vocalistAssignments || []) {
      const existing = vocalistMap.get(assignment.draft_set_song_id) || [];
      existing.push(assignment.vocalist_id);
      vocalistMap.set(assignment.draft_set_song_id, existing);
    }

    return (draftSongs || [])
      .filter((row: any) => row.songs?.id)
      .map((row: any) => {
        const vocalistIds = (vocalistMap.get(row.id) || []).filter(Boolean);
        const normalizedVocalistIds = vocalistIds.length > 0
          ? Array.from(new Set(vocalistIds))
          : ((row.vocalist_id as string | null) ? [row.vocalist_id as string] : []);
        return {
          id: row.songs.id as string,
          title: row.songs.title as string,
          key: (row.song_key as string | null) || null,
          vocalistId: normalizedVocalistIds[0] || null,
          vocalistIds: normalizedVocalistIds,
        };
      });
  }, []);

  // Reset live-scoped state when the selected service context changes.
  useEffect(() => {
    hasAttemptedAutoGenerate.current = false;
    hasAttemptedLiveTemplateSync.current = false;
    hasSyncedVocalists.current = false;
    hasInvalidatedOnLive.current = false;
    setResolvedDraftSetId(initialDraftSetId || null);
    setResolvedCustomServiceId(initialCustomServiceId || null);
    setBoundServiceFlowId(null);
  }, [effectiveCampusId, ministryType, serviceDateStr, initialDraftSetId, initialCustomServiceId]);

  const { data: serviceFlow, isLoading: flowLoading } = useServiceFlow(
    effectiveCampusId,
    ministryType,
    serviceDateStr,
    resolvedDraftSetId,
    resolvedCustomServiceId
  );

  // When opened via Live button, force refetch to get latest data
  useEffect(() => {
    if (!cameFromLive || !effectiveCampusId || !serviceDateStr) return;
      queryClient.invalidateQueries({
      queryKey: ["service-flow", effectiveCampusId, ministryType, serviceDateStr, resolvedDraftSetId, resolvedCustomServiceId],
    });
  }, [cameFromLive, effectiveCampusId, ministryType, serviceDateStr, resolvedDraftSetId, resolvedCustomServiceId, queryClient]);

  // Invalidate service flow items when opened via Live (after flow is loaded)
  useEffect(() => {
    if (!cameFromLive || !serviceFlow?.id || hasInvalidatedOnLive.current) return;
    hasInvalidatedOnLive.current = true;
    queryClient.invalidateQueries({
      queryKey: ["service-flow-items", serviceFlow.id],
    });
  }, [cameFromLive, serviceFlow?.id, queryClient]);

  // If user opens via Calendar LIVE button and no flow exists yet, create it from the
  // campus/ministry template + the published setlist for that date.
  useEffect(() => {
    const run = async () => {
      if (flowLoading) return;
      if (!user?.id || !effectiveCampusId || !serviceDateStr) return;
      if (serviceFlow) return;
      if (hasAttemptedAutoGenerate.current) return;

      hasAttemptedAutoGenerate.current = true;
      setIsAutoGenerating(true);

      try {
        let draftSetId = initialDraftSetId || null;
        let draftSetCustomServiceId = initialCustomServiceId || null;

        if (!draftSetId) {
          let draftSetQuery = supabase
            .from("draft_sets")
            .select("id, custom_service_id")
            .eq("campus_id", effectiveCampusId)
            .eq("ministry_type", ministryType)
            .eq("plan_date", serviceDateStr)
            .eq("status", "published");

          if (initialCustomServiceId) {
            draftSetQuery = draftSetQuery.eq("custom_service_id", initialCustomServiceId);
          }

          const { data: draftSet, error: draftSetError } = await draftSetQuery
            .order("published_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (draftSetError) throw draftSetError;
          draftSetId = draftSet?.id || null;
          draftSetCustomServiceId = (draftSet as any)?.custom_service_id || null;
        }

        if (!draftSetId) {
          return;
        }

        setResolvedDraftSetId(draftSetId);
        if (draftSetCustomServiceId) {
          setResolvedCustomServiceId(draftSetCustomServiceId);
        }

        const songs = await loadDraftSongsWithVocalists(draftSetId);

        const generatedFlowId = await generateServiceFlowFromTemplate({
          campusId: effectiveCampusId,
          ministryType,
          serviceDate: serviceDateStr,
          draftSetId,
          createdBy: user.id,
          songs,
        });
        setBoundServiceFlowId(generatedFlowId);

        // Ensure the UI refetches after creating the flow/items
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: ["service-flow", effectiveCampusId, ministryType, serviceDateStr, draftSetId, draftSetCustomServiceId || resolvedCustomServiceId],
          }),
          queryClient.invalidateQueries({
            queryKey: ["service-flow-items"],
          }),
        ]);

        toast({
          title: "Service Flow created",
          description: "Generated from your template and published setlist.",
        });
      } catch (e: any) {
        toast({
          title: "Couldn't generate Service Flow",
          description: e?.message || "Please try again.",
          variant: "destructive",
        });
      } finally {
        setIsAutoGenerating(false);
      }
    };

    run();
  }, [effectiveCampusId, flowLoading, ministryType, queryClient, serviceDateStr, serviceFlow, toast, user?.id, initialDraftSetId, initialCustomServiceId, resolvedCustomServiceId, loadDraftSongsWithVocalists]);

  const activeServiceFlowId = boundServiceFlowId || serviceFlow?.id || null;
  const { data: items = [], isLoading: itemsLoading } = useServiceFlowItems(activeServiceFlowId);

  // When opened via LIVE and a flow already exists, run one sync pass to ensure
  // the flow matches the selected template context (fixes stale template carryover).
  useEffect(() => {
    const syncExistingLiveFlowToTemplate = async () => {
      if (!cameFromLive) return;
      if (!user?.id || !effectiveCampusId) return;
      if (!serviceFlow?.id) return;
      if (hasAttemptedLiveTemplateSync.current) return;
      if (itemsLoading) return;

      const draftSetId = serviceFlow.draft_set_id || resolvedDraftSetId;
      if (!draftSetId) return;

      hasAttemptedLiveTemplateSync.current = true;

      try {
        const songs = await loadDraftSongsWithVocalists(draftSetId);

        await generateServiceFlowFromTemplate({
          campusId: effectiveCampusId,
          ministryType,
          serviceDate: serviceDateStr,
          draftSetId,
          createdBy: user.id,
          songs,
        });

        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: ["service-flow", effectiveCampusId, ministryType, serviceDateStr, resolvedDraftSetId, resolvedCustomServiceId],
          }),
          queryClient.invalidateQueries({
            queryKey: ["service-flow-items", serviceFlow.id],
          }),
        ]);
      } catch {
        // Keep the page usable even if sync fails; generation/toast paths already handle errors.
      }
    };

    syncExistingLiveFlowToTemplate();
  }, [
    cameFromLive,
    user?.id,
    effectiveCampusId,
    serviceFlow?.id,
    serviceFlow?.draft_set_id,
    itemsLoading,
    resolvedDraftSetId,
    ministryType,
    serviceDateStr,
    queryClient,
    resolvedCustomServiceId,
    loadDraftSongsWithVocalists,
  ]);

  // If a flow already exists but is empty, backfill it from the linked setlist/template.
  useEffect(() => {
    const backfillEmptyFlow = async () => {
      if (!cameFromLive) return;
      if (!user?.id || !effectiveCampusId) return;
      if (!activeServiceFlowId) return;
      if (itemsLoading) return;
      if (items.length > 0) return;

      const draftSetId = serviceFlow.draft_set_id || resolvedDraftSetId;
      if (!draftSetId) return;

      try {
        const songs = await loadDraftSongsWithVocalists(draftSetId);

        await generateServiceFlowFromTemplate({
          campusId: effectiveCampusId,
          ministryType,
          serviceDate: serviceDateStr,
          draftSetId,
          createdBy: user.id,
          songs,
        });

        await queryClient.invalidateQueries({
          queryKey: ["service-flow-items", activeServiceFlowId],
        });
      } catch {
        // Keep UI usable; primary generation flow already surfaces errors.
      }
    };

    backfillEmptyFlow();
  }, [activeServiceFlowId, cameFromLive, effectiveCampusId, items, itemsLoading, ministryType, queryClient, resolvedDraftSetId, serviceDateStr, serviceFlow?.draft_set_id, user?.id, loadDraftSongsWithVocalists]);

  // Keep service flow song vocalist assignments synced with the linked draft set.
  // This ensures co-leads and swaps persist even when opening Service Flow outside LIVE.
  useEffect(() => {
    const syncVocalists = async () => {
      if (!serviceFlow?.draft_set_id || !activeServiceFlowId) return;
      if (hasSyncedVocalists.current) return;
      if (itemsLoading || items.length === 0) return;

      hasSyncedVocalists.current = true;

      const { data: draftSongs, error } = await supabase
        .from("draft_set_songs")
        .select("id, sequence_order, song_id, vocalist_id")
        .eq("draft_set_id", serviceFlow.draft_set_id)
        .order("sequence_order", { ascending: true });

      if (error || !draftSongs?.length) return;

      const draftSongIds = (draftSongs || []).map((d: any) => d.id);
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

      const songItems = items
        .filter((i) => i.item_type === "song" && i.song_id)
        .sort((a, b) => a.sequence_order - b.sequence_order);

      let needsUpdate = false;
      for (let i = 0; i < Math.min(songItems.length, draftSongs.length); i++) {
        const item = songItems[i];
        const draft = draftSongs[i] as any;
        const draftVocalistIdsRaw = draftSongVocalistMap.get(draft.id) || [];
        const draftVocalistIds = draftVocalistIdsRaw.length > 0
          ? Array.from(new Set(draftVocalistIdsRaw))
          : ((draft.vocalist_id as string | null) ? [draft.vocalist_id as string] : []);
        const draftVocalistId = draftVocalistIds[0] || null;
        const itemVocalistId = item.vocalist_id ?? null;
        if (draftVocalistId !== itemVocalistId) {
          needsUpdate = true;
          await supabase
            .from("service_flow_items")
            .update({ vocalist_id: draftVocalistId })
            .eq("id", item.id);
        }

        await supabase
          .from("service_flow_item_vocalists")
          .delete()
          .eq("service_flow_item_id", item.id);

        if (draftVocalistIds.length > 0) {
          const inserts = draftVocalistIds.map((vocalist_id) => ({
            service_flow_item_id: item.id,
            vocalist_id,
          }));
          const { error: insertError } = await supabase
            .from("service_flow_item_vocalists")
            .insert(inserts);
          if (insertError) {
            console.error("Failed syncing service flow co-vocalists:", insertError);
          }
        }
      }

      if (needsUpdate) {
        await queryClient.invalidateQueries({
          queryKey: ["service-flow-items", activeServiceFlowId],
        });
      }
    };

    syncVocalists();
  }, [activeServiceFlowId, serviceFlow?.draft_set_id, items, itemsLoading, queryClient]);

  // Sync local items with fetched items when not dragging
  useEffect(() => {
    if (!draggedItem) {
      setLocalItems(items);
    }
  }, [items, draggedItem]);

  const createFlow = useCreateServiceFlow();
  const saveItem = useSaveServiceFlowItem();
  const deleteItem = useDeleteServiceFlowItem();
  const reorderItems = useReorderServiceFlowItems();

  const totalDuration = useMemo(() => {
    return localItems.reduce((sum, item) => sum + (item.duration_seconds || 0), 0);
  }, [localItems]);

  const handleAddItem = useCallback(
    async (newItem: {
      item_type: "header" | "item" | "song";
      title: string;
      duration_seconds: number | null;
      song_id?: string | null;
      song_key?: string | null;
    }) => {
      if (!user?.id || !effectiveCampusId) return;

      let flowId = serviceFlow?.id;
      if (!flowId && activeServiceFlowId) {
        flowId = activeServiceFlowId;
      }

      // Create flow if it doesn't exist
      if (!flowId) {
        const newFlow = await createFlow.mutateAsync({
          campusId: effectiveCampusId,
          ministryType,
          serviceDate: serviceDateStr,
          createdBy: user.id,
          customServiceId: resolvedCustomServiceId || null,
        });
        flowId = newFlow.id;
      }

      await saveItem.mutateAsync({
        service_flow_id: flowId,
        item_type: newItem.item_type,
        title: newItem.title,
        duration_seconds: newItem.duration_seconds,
        sequence_order: localItems.length,
        song_id: newItem.song_id,
        song_key: newItem.song_key,
      });
    },
    [activeServiceFlowId, serviceFlow?.id, effectiveCampusId, ministryType, serviceDateStr, user?.id, localItems.length, createFlow, saveItem]
  );

  const handleUpdateItem = useCallback(
    async (itemId: string, updates: Partial<ServiceFlowItemType>) => {
      const item = localItems.find((i) => i.id === itemId);
      if (!item || !activeServiceFlowId) return;

      await saveItem.mutateAsync({
        id: item.id,
        service_flow_id: activeServiceFlowId,
        item_type: updates.item_type || item.item_type,
        title: updates.title || item.title,
        duration_seconds: updates.duration_seconds ?? item.duration_seconds,
        sequence_order: updates.sequence_order ?? item.sequence_order,
        song_id: updates.song_id ?? item.song_id,
        song_key: updates.song_key ?? item.song_key,
        vocalist_id: updates.vocalist_id ?? item.vocalist_id,
        notes: updates.notes ?? item.notes,
      });
    },
    [localItems, activeServiceFlowId, saveItem]
  );

  const handleDeleteItem = useCallback(
    async (itemId: string) => {
      if (!activeServiceFlowId) return;
      await deleteItem.mutateAsync({ id: itemId, serviceFlowId: activeServiceFlowId });
    },
    [activeServiceFlowId, deleteItem]
  );

  const handleDragStart = (e: React.DragEvent, item: ServiceFlowItemType) => {
    setDraggedItem(item);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (!draggedItem) return;
    
    const draggedIndex = localItems.findIndex(i => i.id === draggedItem.id);
    if (draggedIndex === targetIndex) return;

    // Reorder locally for visual feedback
    const newItems = [...localItems];
    newItems.splice(draggedIndex, 1);
    newItems.splice(targetIndex, 0, draggedItem);
    setLocalItems(newItems);
  };

  const handleDragEnd = async () => {
    if (!draggedItem || !activeServiceFlowId) {
      setDraggedItem(null);
      return;
    }

    // Update sequence orders based on current local order
    const reorderedItems = localItems.map((item, index) => ({
      id: item.id,
      sequence_order: index,
    }));

    await reorderItems.mutateAsync({
      serviceFlowId: activeServiceFlowId,
      items: reorderedItems,
    });

    setDraggedItem(null);
  };

  const isLoading = campusesLoading || flowLoading || itemsLoading || isAutoGenerating;

  return (
    <div className="space-y-4">
      {/* Header Controls */}
      <div className="flex flex-wrap gap-3 items-center">
        <Select value={effectiveCampusId || ""} onValueChange={handleCampusChange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select Campus" />
          </SelectTrigger>
          <SelectContent>
            {campuses?.map((campus) => (
              <SelectItem key={campus.id} value={campus.id}>
                {campus.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={ministryType} onValueChange={setMinistryType}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {availableMinistryOptions.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-[180px] justify-start text-left">
              <CalendarIcon className="mr-2 h-4 w-4" />
              {format(selectedDate, "MMM d, yyyy")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => date && setSelectedDate(date)}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Column Headers */}
      <div className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide border-b">
        <div className="w-4" /> {/* Drag handle space */}
        <div className="w-16 text-center">Length</div>
        <div className="flex-1">Title</div>
        <div className="w-6" /> {/* Delete button space */}
      </div>

      {/* Items List */}
      <div className="space-y-2 min-h-[200px]">
        {isLoading ? (
          <>
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </>
        ) : localItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <p>No items in this service flow yet.</p>
            <p className="text-sm">Click the + button to add items.</p>
          </div>
        ) : (
          localItems.map((item, index) => (
            <div
              key={item.id}
              draggable
              onDragStart={(e) => handleDragStart(e, item)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              className={cn(
                "transition-transform",
                draggedItem?.id === item.id && "opacity-50"
              )}
            >
              <ServiceFlowItem
                item={item}
                onUpdate={(updates) => handleUpdateItem(item.id, updates)}
                onDelete={() => handleDeleteItem(item.id)}
                isDragging={draggedItem?.id === item.id}
              />
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="service-flow-total-footer flex items-center justify-between pt-4 border-t">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsAddDialogOpen(true)}
          disabled={!effectiveCampusId}
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Item
        </Button>
        <div className="text-sm font-medium">
          <span className="text-muted-foreground">Total: </span>
          <span>{formatTotalDuration(totalDuration)}</span>
        </div>
      </div>

      <AddItemDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onAdd={handleAddItem}
      />
    </div>
  );
}
