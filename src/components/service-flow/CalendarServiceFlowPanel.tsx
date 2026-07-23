import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  generateServiceFlowFromTemplate,
  useServiceFlow,
  useServiceFlowItems,
} from "@/hooks/useServiceFlow";
import { useNetworkWideCampus } from "@/hooks/useCampuses";
import { useAuth } from "@/hooks/useAuth";
import { isNetworkWideMinistryType, MINISTRY_TYPES } from "@/lib/constants";
import { cn } from "@/lib/cn";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { ServiceFlow } from "./ServiceFlow";
import { buildServiceFlowHref, buildServiceFlowPreview } from "./buildServiceFlowPreview";

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

  // service_flows rows for network-wide ministries use the Network Wide campus UUID.
  const flowCampusId = isNetworkWide
    ? networkWideCampus?.id || null
    : campusId;

  const resolvedCampusName =
    campusName ||
    (flowCampusId && flowCampusId === networkWideCampus?.id
      ? networkWideCampus?.name
      : null);
  const ministryLabel =
    label ||
    MINISTRY_TYPES.find((option) => option.value === effectiveMinistryType)?.label ||
    MINISTRY_TYPES.find((option) => option.value === ministryType)?.label ||
    "Service";

  // Resolve the published set the same way the full Service Flow page does when opened
  // from Calendar — including campus_id IS NULL for Student Camp.
  const { data: publishedDraftSetId = null, isLoading: draftSetLoading } = useQuery({
    queryKey: [
      "calendar-service-flow-draft-set",
      date,
      isNetworkWide ? "network-wide" : campusId,
      effectiveMinistryType,
      customServiceId,
    ],
    enabled: !!date && !!effectiveMinistryType && (!isNetworkWide || !!networkWideCampus),
    staleTime: 30_000,
    queryFn: async () => {
      if (draftSetId) return draftSetId;

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

  const {
    data: serviceFlow,
    isLoading: flowLoading,
    isFetching: flowFetching,
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

  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const hasAttemptedGenerate = useRef(false);
  const ensureKeyRef = useRef<string>("");

  const ensureKey = `${date}|${flowCampusId || ""}|${effectiveMinistryType}|${resolvedDraftSetId || ""}|${customServiceId || ""}`;

  useEffect(() => {
    if (serviceFlow?.id) {
      setBoundFlowId(serviceFlow.id);
    }
  }, [serviceFlow?.id]);

  useEffect(() => {
    if (ensureKeyRef.current !== ensureKey) {
      ensureKeyRef.current = ensureKey;
      hasAttemptedGenerate.current = false;
      setGenerateError(null);
      setBoundFlowId(null);
    }
  }, [ensureKey]);

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
      // Only build when missing/empty; do not wipe an existing rundown from Calendar.
      forceTemplateResync: false,
      songs,
    });

    setBoundFlowId(flowId);

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["service-flow"] }),
      queryClient.invalidateQueries({ queryKey: ["service-flow-items", flowId] }),
      queryClient.invalidateQueries({ queryKey: ["service-flow-items"] }),
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
      if (networkWideCampusLoading || draftSetLoading || flowLoading) return;
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

  const isLoading =
    networkWideCampusLoading ||
    draftSetLoading ||
    flowLoading ||
    flowFetching ||
    (!!activeFlowId && itemsLoading) ||
    isGenerating ||
    (isNetworkWide && !networkWideCampus);

  const fullPageHref = buildServiceFlowHref({
    date,
    campusId: flowCampusId,
    ministryType: effectiveMinistryType,
    draftSetId: resolvedDraftSetId || serviceFlow?.draft_set_id || null,
    customServiceId,
  });

  const preview = useMemo(
    () =>
      buildServiceFlowPreview({
        items,
        serviceDate: date,
        campusName: resolvedCampusName,
        ministryType: effectiveMinistryType,
        title: ministryLabel,
      }),
    [date, effectiveMinistryType, items, ministryLabel, resolvedCampusName],
  );

  const showEmpty = !isLoading && (!activeFlowId || items.length === 0 || itemsError);

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
          asChild
          variant="outline"
          size="sm"
          className="h-8 shrink-0 gap-1.5 px-2.5 text-xs"
        >
          <Link to={fullPageHref}>
            <ExternalLink className="h-3.5 w-3.5" />
            {readOnly ? "Open" : "Edit"}
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      ) : showEmpty ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-8 text-center">
          <p className="text-sm font-medium text-foreground">No service flow yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {readOnly
              ? "A rundown has not been generated for this service."
              : generateError ||
                "Open the full Service Flow page to generate it from the template."}
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
              <Button asChild size="sm" variant="outline">
                <Link to={fullPageHref}>Open Service Flow</Link>
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="calendar-service-flow-preview overflow-x-hidden">
          <ServiceFlow
            service={preview}
            compactMode
            showProgressBar={false}
            className="max-w-none"
          />
        </div>
      )}
    </section>
  );
}
