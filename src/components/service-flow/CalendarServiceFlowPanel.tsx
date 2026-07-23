import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Plus, Printer } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  generateServiceFlowFromTemplate,
  useDeleteServiceFlowItem,
  useReorderServiceFlowItems,
  useSaveServiceFlowItem,
  useServiceFlow,
  useServiceFlowItems,
  type ServiceFlowItem as ServiceFlowItemType,
} from "@/hooks/useServiceFlow";
import { useNetworkWideCampus } from "@/hooks/useCampuses";
import { useAuth } from "@/hooks/useAuth";
import { isNetworkWideMinistryType, MINISTRY_TYPES } from "@/lib/constants";
import { cn } from "@/lib/cn";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { ServiceFlowItem } from "./ServiceFlowItem";
import { AddItemDialog } from "./AddItemDialog";
import { formatTotalDuration } from "./DurationInput";
import { buildServiceFlowPreview } from "./buildServiceFlowPreview";
import { ServiceFlow as ServiceFlowPreview } from "./ServiceFlow";

const EXPORT_MODE_CLASS = "service-flow-export-mode";
const CALENDAR_PRINTING_CLASS = "calendar-service-flow-printing";

export type CalendarServiceFlowPanelProps = {
  date: string;
  campusId?: string | null;
  ministryType?: string | null;
  draftSetId?: string | null;
  customServiceId?: string | null;
  campusName?: string | null;
  label?: string | null;
  readOnly?: boolean;
  className?: string;
  id?: string;
};

function normalizeMinistryType(ministryType?: string | null) {
  if (!ministryType) return "weekend";
  return ministryType === "weekend_team" ? "weekend" : ministryType;
}

function clearPrintMode() {
  document.documentElement.classList.remove(EXPORT_MODE_CLASS, CALENDAR_PRINTING_CLASS);
}

async function loadDraftSongsWithVocalists(draftSetId: string) {
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
      `,
    )
    .eq("draft_set_id", draftSetId)
    .order("sequence_order", { ascending: true });

  if (draftSongsError) throw draftSongsError;

  const draftSongIds = (draftSongs || []).map((row: any) => row.id);
  const { data: vocalistAssignments } = await supabase
    .from("draft_set_song_vocalists")
    .select("draft_set_song_id, vocalist_id")
    .in(
      "draft_set_song_id",
      draftSongIds.length > 0 ? draftSongIds : ["00000000-0000-0000-0000-000000000000"],
    );

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
      const normalizedVocalistIds =
        vocalistIds.length > 0
          ? Array.from(new Set(vocalistIds))
          : row.vocalist_id
            ? [row.vocalist_id as string]
            : [];
      return {
        id: row.songs.id as string,
        title: row.songs.title as string,
        key: (row.song_key as string | null) || null,
        vocalistId: normalizedVocalistIds[0] || null,
        vocalistIds: normalizedVocalistIds,
      };
    });
}

export function CalendarServiceFlowPanel({
  date,
  campusId = null,
  ministryType,
  draftSetId = null,
  customServiceId = null,
  campusName = null,
  label = null,
  readOnly = false,
  className,
  id = "calendar-service-flow-panel",
}: CalendarServiceFlowPanelProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const effectiveMinistryType = normalizeMinistryType(ministryType);
  const isNetworkWide =
    isNetworkWideMinistryType(effectiveMinistryType) ||
    isNetworkWideMinistryType(ministryType);
  const { data: networkWideCampus, isLoading: networkWideCampusLoading } = useNetworkWideCampus();

  const flowCampusId = isNetworkWide
    ? networkWideCampus?.id || null
    : campusId;

  const ministryLabel =
    label ||
    MINISTRY_TYPES.find((option) => option.value === effectiveMinistryType)?.label ||
    MINISTRY_TYPES.find((option) => option.value === ministryType)?.label ||
    "Service";

  // Only hit the network when Calendar didn't already provide a draft set.
  const { data: publishedDraftSetId = null, isLoading: draftSetLoading } = useQuery({
    queryKey: [
      "calendar-service-flow-draft-set",
      date,
      isNetworkWide ? "network-wide" : campusId,
      effectiveMinistryType,
      customServiceId,
    ],
    enabled:
      !draftSetId &&
      !!date &&
      !!effectiveMinistryType &&
      (!isNetworkWide || !!networkWideCampus),
    staleTime: 60_000,
    queryFn: async () => {
      let draftSetQuery = supabase
        .from("draft_sets")
        .select("id")
        .eq("ministry_type", effectiveMinistryType)
        .eq("plan_date", date)
        .eq("status", "published");

      draftSetQuery = isNetworkWide
        ? draftSetQuery.is("campus_id", null)
        : draftSetQuery.eq("campus_id", campusId as string);

      if (customServiceId) {
        draftSetQuery = draftSetQuery.eq("custom_service_id", customServiceId);
      }

      const { data, error } = await draftSetQuery
        .order("published_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data?.id || null;
    },
  });

  const resolvedDraftSetId = draftSetId || publishedDraftSetId;

  // Start flow lookup as soon as campus is ready — don't wait on draft-set resolution.
  const {
    data: serviceFlow,
    isLoading: flowLoading,
    refetch: refetchFlow,
  } = useServiceFlow(
    flowCampusId,
    effectiveMinistryType,
    date,
    resolvedDraftSetId,
    customServiceId,
  );

  const [boundFlowId, setBoundFlowId] = useState<string | null>(null);
  const activeFlowId = boundFlowId || serviceFlow?.id || null;
  const {
    data: items = [],
    isLoading: itemsLoading,
    isError: itemsError,
    refetch: refetchItems,
  } = useServiceFlowItems(activeFlowId);

  const saveItem = useSaveServiceFlowItem();
  const deleteItem = useDeleteServiceFlowItem();
  const reorderItems = useReorderServiceFlowItems();

  const [localItems, setLocalItems] = useState<ServiceFlowItemType[]>([]);
  const [draggedItem, setDraggedItem] = useState<ServiceFlowItemType | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [printMounted, setPrintMounted] = useState(false);
  const hasAttemptedGenerate = useRef(false);
  const contextKeyRef = useRef("");
  const draggedItemRef = useRef<ServiceFlowItemType | null>(null);
  const localItemsRef = useRef<ServiceFlowItemType[]>([]);
  const dragFrameRef = useRef<number | null>(null);
  const pendingDragIndexRef = useRef<number | null>(null);
  const printPairRef = useRef<HTMLDivElement | null>(null);
  const printCloneRef = useRef<HTMLElement | null>(null);
  const printReadyResolveRef = useRef<(() => void) | null>(null);

  const contextKey = `${date}|${flowCampusId || ""}|${effectiveMinistryType}|${customServiceId || ""}`;

  useEffect(() => {
    if (serviceFlow?.id) setBoundFlowId(serviceFlow.id);
  }, [serviceFlow?.id]);

  useEffect(() => {
    if (contextKeyRef.current === contextKey) return;
    contextKeyRef.current = contextKey;
    hasAttemptedGenerate.current = false;
    setGenerateError(null);
    setBoundFlowId(null);
    setDraggedItem(null);
    setPrintMounted(false);
  }, [contextKey]);

  useEffect(() => {
    if (!draggedItem) setLocalItems(items);
  }, [items, draggedItem]);

  useEffect(() => {
    localItemsRef.current = localItems;
  }, [localItems]);

  useEffect(() => {
    draggedItemRef.current = draggedItem;
  }, [draggedItem]);

  useEffect(() => {
    return () => {
      clearPrintMode();
    };
  }, []);

  const generateFromTemplate = useCallback(async () => {
    if (!user?.id || !flowCampusId || !date || readOnly) return null;

    const songs = resolvedDraftSetId
      ? await loadDraftSongsWithVocalists(resolvedDraftSetId)
      : [];

    const flowId = await generateServiceFlowFromTemplate({
      campusId: flowCampusId,
      ministryType: effectiveMinistryType,
      serviceDate: date,
      draftSetId: resolvedDraftSetId,
      customServiceId,
      createdBy: user.id,
      forceTemplateResync: false,
      songs,
    });

    setBoundFlowId(flowId);

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["service-flow"] }),
      queryClient.invalidateQueries({ queryKey: ["service-flow-items", flowId] }),
    ]);
    await Promise.all([refetchFlow(), refetchItems()]);
    return flowId;
  }, [
    customServiceId,
    date,
    effectiveMinistryType,
    flowCampusId,
    queryClient,
    readOnly,
    refetchFlow,
    refetchItems,
    resolvedDraftSetId,
    user?.id,
  ]);

  useEffect(() => {
    const run = async () => {
      if (readOnly) return;
      if (networkWideCampusLoading || flowLoading) return;
      // Wait for draft-set lookup only when we still have no flow to show.
      if (!activeFlowId && !draftSetId && draftSetLoading) return;
      if (isNetworkWide && !networkWideCampus) return;
      if (!flowCampusId || !user?.id) return;
      if (activeFlowId) return;
      if (hasAttemptedGenerate.current || isGenerating) return;

      hasAttemptedGenerate.current = true;
      setIsGenerating(true);
      setGenerateError(null);
      try {
        await generateFromTemplate();
      } catch (error: any) {
        console.error("Failed to auto-generate calendar service flow:", error);
        setGenerateError(error?.message || "Couldn't generate service flow.");
      } finally {
        setIsGenerating(false);
      }
    };

    void run();
  }, [
    activeFlowId,
    draftSetId,
    draftSetLoading,
    flowLoading,
    flowCampusId,
    generateFromTemplate,
    isGenerating,
    isNetworkWide,
    networkWideCampus,
    networkWideCampusLoading,
    readOnly,
    user?.id,
  ]);

  const handleUpdateItem = useCallback(
    async (itemId: string, updates: Partial<ServiceFlowItemType>) => {
      const item = localItemsRef.current.find((entry) => entry.id === itemId);
      if (!item || !activeFlowId || readOnly) return;

      await saveItem.mutateAsync({
        id: item.id,
        service_flow_id: activeFlowId,
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
    [activeFlowId, readOnly, saveItem],
  );

  const handleDeleteItem = useCallback(
    async (itemId: string) => {
      if (!activeFlowId || readOnly) return;
      await deleteItem.mutateAsync({ id: itemId, serviceFlowId: activeFlowId });
    },
    [activeFlowId, deleteItem, readOnly],
  );

  const handleAddItem = useCallback(
    async (newItem: {
      item_type: "header" | "item" | "song";
      title: string;
      duration_seconds: number | null;
      song_id?: string | null;
      song_key?: string | null;
    }) => {
      if (!activeFlowId || readOnly) return;
      await saveItem.mutateAsync({
        service_flow_id: activeFlowId,
        item_type: newItem.item_type,
        title: newItem.title,
        duration_seconds: newItem.duration_seconds,
        sequence_order: localItemsRef.current.length,
        song_id: newItem.song_id,
        song_key: newItem.song_key,
      });
    },
    [activeFlowId, readOnly, saveItem],
  );

  const handleDragStart = useCallback((e: React.DragEvent, item: ServiceFlowItemType) => {
    if (readOnly) return;
    draggedItemRef.current = item;
    setDraggedItem(item);
    e.dataTransfer.effectAllowed = "move";
  }, [readOnly]);

  const handleDragOver = useCallback((e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (readOnly || !draggedItemRef.current) return;

    pendingDragIndexRef.current = targetIndex;
    if (dragFrameRef.current !== null) return;

    dragFrameRef.current = requestAnimationFrame(() => {
      dragFrameRef.current = null;
      const dragged = draggedItemRef.current;
      const nextIndex = pendingDragIndexRef.current;
      if (!dragged || nextIndex === null) return;

      const currentItems = localItemsRef.current;
      const draggedIndex = currentItems.findIndex((entry) => entry.id === dragged.id);
      if (draggedIndex < 0 || draggedIndex === nextIndex) return;

      const nextItems = [...currentItems];
      nextItems.splice(draggedIndex, 1);
      nextItems.splice(nextIndex, 0, dragged);
      localItemsRef.current = nextItems;
      setLocalItems(nextItems);
    });
  }, [readOnly]);

  const handleDragEnd = useCallback(async () => {
    if (dragFrameRef.current !== null) {
      cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }

    const currentDragged = draggedItemRef.current;
    if (!currentDragged || !activeFlowId || readOnly) {
      draggedItemRef.current = null;
      setDraggedItem(null);
      return;
    }

    await reorderItems.mutateAsync({
      serviceFlowId: activeFlowId,
      items: localItemsRef.current.map((item, index) => ({
        id: item.id,
        sequence_order: index,
      })),
    });

    draggedItemRef.current = null;
    setDraggedItem(null);
  }, [activeFlowId, readOnly, reorderItems]);

  const totalDuration = useMemo(
    () =>
      localItems.reduce(
        (sum, item) => sum + (item.duration_seconds && item.duration_seconds > 0 ? item.duration_seconds : 0),
        0,
      ),
    [localItems],
  );

  const servicePreview = useMemo(
    () =>
      buildServiceFlowPreview({
        items: localItems,
        serviceDate: date,
        campusName,
        ministryType: effectiveMinistryType,
        title: ministryLabel,
      }),
    [campusName, date, effectiveMinistryType, localItems, ministryLabel],
  );

  useEffect(() => {
    if (!printMounted || !printReadyResolveRef.current) return;
    const resolve = printReadyResolveRef.current;
    printReadyResolveRef.current = null;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  }, [printMounted]);

  useLayoutEffect(() => {
    const pair = printPairRef.current;
    if (!printMounted || !pair) {
      printCloneRef.current = null;
      return;
    }

    const source = pair.firstElementChild;
    if (!(source instanceof HTMLElement)) return;

    if (printCloneRef.current?.isConnected) {
      printCloneRef.current.remove();
    }

    const clone = source.cloneNode(true) as HTMLElement;
    clone.setAttribute("aria-hidden", "true");
    clone.setAttribute("data-print-clone", "true");
    pair.appendChild(clone);
    printCloneRef.current = clone;

    return () => {
      printCloneRef.current?.remove();
      printCloneRef.current = null;
    };
  }, [printMounted, servicePreview]);

  const handlePrint = useCallback(async () => {
    if (localItems.length === 0) return;

    await new Promise<void>((resolve) => {
      if (printMounted) {
        resolve();
        return;
      }
      printReadyResolveRef.current = resolve;
      setPrintMounted(true);
    });

    const printableNode = printPairRef.current;
    if (!printableNode) {
      setPrintMounted(false);
      window.print();
      return;
    }

    const html = document.documentElement;
    const previousTitle = document.title;
    let cleanedUp = false;

    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      clearPrintMode();
      document.title = previousTitle;
      setPrintMounted(false);
      window.removeEventListener("afterprint", cleanup);
    };

    document.title = `${ministryLabel} Service Flow`;
    html.classList.add(EXPORT_MODE_CLASS, CALENDAR_PRINTING_CLASS);
    window.addEventListener("afterprint", cleanup);

    window.setTimeout(() => {
      window.print();
      window.setTimeout(cleanup, 1500);
    }, 50);
  }, [localItems.length, ministryLabel, printMounted]);

  // Show the editor as soon as we have items — don't block on background refetch/draft lookup.
  const isInitialLoading =
    (networkWideCampusLoading && isNetworkWide) ||
    (flowLoading && !activeFlowId) ||
    (itemsLoading && localItems.length === 0 && !!activeFlowId) ||
    (isGenerating && localItems.length === 0);

  const showEmpty =
    !isInitialLoading && (!activeFlowId || localItems.length === 0 || itemsError);

  const canPrint = !isInitialLoading && !showEmpty && localItems.length > 0;

  return (
    <section
      id={id}
      className={cn(
        "calendar-service-flow-panel scroll-mt-24 overflow-x-hidden rounded-lg border border-border bg-card p-3 sm:scroll-mt-20 sm:p-4",
        className,
      )}
      aria-label={`${ministryLabel} service flow`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Service Flow
          </p>
          <h3 className="truncate text-base font-semibold leading-tight text-foreground sm:text-lg">
            {ministryLabel}
          </h3>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 shrink-0 gap-1.5 px-2.5 text-xs"
          onClick={() => void handlePrint()}
          disabled={!canPrint}
        >
          <Printer className="h-3.5 w-3.5" />
          Print
        </Button>
      </div>

      {isInitialLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : showEmpty ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-8 text-center">
          <p className="text-sm font-medium text-foreground">No service flow yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {readOnly
              ? "A rundown has not been generated for this service."
              : generateError ||
                "Generate from the template to start editing this rundown."}
          </p>
          {!readOnly ? (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <Button
                size="sm"
                onClick={() => {
                  hasAttemptedGenerate.current = false;
                  setIsGenerating(true);
                  setGenerateError(null);
                  void generateFromTemplate()
                    .catch((error: any) => {
                      console.error("Failed to generate calendar service flow:", error);
                      setGenerateError(error?.message || "Couldn't generate service flow.");
                    })
                    .finally(() => setIsGenerating(false));
                }}
              >
                Generate from Template
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <div className={cn("space-y-2", readOnly && "pointer-events-none")}>
            {localItems.map((item, index) => (
              <div
                key={item.id}
                draggable={!readOnly}
                onDragStart={(e) => handleDragStart(e, item)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
                className={cn(draggedItem?.id === item.id && "opacity-50")}
              >
                <ServiceFlowItem
                  item={item}
                  onUpdate={handleUpdateItem}
                  onDelete={handleDeleteItem}
                  isDragging={draggedItem?.id === item.id}
                />
              </div>
            ))}
          </div>

          {!readOnly ? (
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => setIsAddDialogOpen(true)}
                disabled={!activeFlowId}
              >
                <Plus className="mr-1 h-4 w-4" />
                Add Item
              </Button>
              <div className="text-sm font-medium">
                <span className="text-muted-foreground">Total: </span>
                <span>{formatTotalDuration(totalDuration)}</span>
              </div>
            </div>
          ) : null}

          {!readOnly ? (
            <AddItemDialog
              open={isAddDialogOpen}
              onOpenChange={setIsAddDialogOpen}
              onAdd={handleAddItem}
            />
          ) : null}
        </>
      )}

      {printMounted && localItems.length > 0 ? (
        <div
          ref={printPairRef}
          className="service-flow-print-render service-flow-print-pair hidden print:grid print:grid-cols-2 print:gap-[0.2in]"
        >
          <ServiceFlowPreview
            service={servicePreview}
            compactMode
            showProgressBar={false}
            printFitHalfSheet
          />
        </div>
      ) : null}
    </section>
  );
}
