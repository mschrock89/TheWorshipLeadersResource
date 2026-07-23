import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import {
  generateServiceFlowFromTemplate,
  useServiceFlow,
  useServiceFlowItems,
} from "@/hooks/useServiceFlow";
import { useNetworkWideCampus } from "@/hooks/useCampuses";
import { useAuth } from "@/hooks/useAuth";
import { useSongsForDate } from "@/hooks/useSongs";
import { isNetworkWideMinistryType, MINISTRY_TYPES } from "@/lib/constants";
import { cn } from "@/lib/cn";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
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
  const { data: networkWideCampus } = useNetworkWideCampus();

  // service_flows rows for network-wide ministries use the Network Wide campus UUID.
  const flowCampusId = isNetworkWide
    ? networkWideCampus?.id || null
    : campusId;

  // draft_sets / songs for network-wide ministries are stored with campus_id IS NULL.
  const songsCampusId = isNetworkWide ? null : campusId;

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

  const { data: plansWithSongs = [], isLoading: songsLoading } = useSongsForDate(
    date,
    songsCampusId,
    effectiveMinistryType,
  );
  const resolvedDraftSetId = useMemo(() => {
    if (draftSetId) return draftSetId;
    const ids = plansWithSongs
      .filter((plan) => (plan.songs || []).length > 0)
      .map((plan) => plan.draft_set_id)
      .filter((value): value is string => Boolean(value));
    return ids.length === 1 ? ids[0] : ids[0] || null;
  }, [draftSetId, plansWithSongs]);

  const {
    data: serviceFlow,
    isLoading: flowLoading,
    isFetching: flowFetching,
  } = useServiceFlow(
    flowCampusId,
    effectiveMinistryType,
    date,
    resolvedDraftSetId,
    customServiceId,
  );
  const { data: items = [], isLoading: itemsLoading } = useServiceFlowItems(
    serviceFlow?.id || null,
  );

  const [isGenerating, setIsGenerating] = useState(false);
  const hasAttemptedGenerate = useRef(false);

  useEffect(() => {
    hasAttemptedGenerate.current = false;
  }, [date, flowCampusId, effectiveMinistryType, customServiceId, resolvedDraftSetId]);

  const generateFromTemplate = useCallback(async () => {
    if (!user?.id || !flowCampusId || !date || readOnly) return false;

    let nextDraftSetId = resolvedDraftSetId;
    if (!nextDraftSetId) {
      let draftSetQuery = supabase
        .from("draft_sets")
        .select("id")
        .eq("ministry_type", effectiveMinistryType)
        .eq("plan_date", date)
        .eq("status", "published");

      draftSetQuery = isNetworkWide
        ? draftSetQuery.is("campus_id", null)
        : draftSetQuery.eq("campus_id", flowCampusId);

      if (customServiceId) {
        draftSetQuery = draftSetQuery.eq("custom_service_id", customServiceId);
      }

      const { data: draftSet, error } = await draftSetQuery
        .order("published_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      nextDraftSetId = draftSet?.id || null;
    }

    // Still generate from template even without songs when a published set is missing,
    // so the rundown structure appears from the template alone.
    const songs = nextDraftSetId ? await loadDraftSongsWithVocalists(nextDraftSetId) : [];

    await generateServiceFlowFromTemplate({
      campusId: flowCampusId,
      ministryType: effectiveMinistryType,
      serviceDate: date,
      draftSetId: nextDraftSetId,
      customServiceId,
      createdBy: user.id,
      forceTemplateResync: true,
      songs,
    });

    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: [
          "service-flow",
          flowCampusId,
          effectiveMinistryType,
          date,
          nextDraftSetId,
          customServiceId,
        ],
      }),
      queryClient.invalidateQueries({ queryKey: ["service-flow"] }),
      queryClient.invalidateQueries({ queryKey: ["service-flow-items"] }),
    ]);

    return true;
  }, [
    customServiceId,
    date,
    effectiveMinistryType,
    flowCampusId,
    isNetworkWide,
    queryClient,
    readOnly,
    resolvedDraftSetId,
    user?.id,
  ]);

  useEffect(() => {
    const run = async () => {
      if (readOnly) return;
      if (flowLoading || songsLoading || (isNetworkWide && !networkWideCampus)) return;
      if (!flowCampusId || !user?.id) return;
      if (serviceFlow) return;
      if (hasAttemptedGenerate.current || isGenerating) return;

      hasAttemptedGenerate.current = true;
      setIsGenerating(true);
      try {
        await generateFromTemplate();
      } catch (error) {
        console.error("Failed to auto-generate calendar service flow:", error);
      } finally {
        setIsGenerating(false);
      }
    };

    void run();
  }, [
    flowCampusId,
    flowLoading,
    generateFromTemplate,
    isGenerating,
    isNetworkWide,
    networkWideCampus,
    readOnly,
    serviceFlow,
    songsLoading,
    user?.id,
  ]);

  const isLoading =
    flowLoading ||
    flowFetching ||
    (!!serviceFlow?.id && itemsLoading) ||
    isGenerating ||
    (isNetworkWide && !networkWideCampus) ||
    (songsLoading && !serviceFlow);

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
        title: [resolvedCampusName, ministryLabel].filter(Boolean).join(" "),
      }),
    [date, effectiveMinistryType, items, ministryLabel, resolvedCampusName],
  );

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
      ) : !serviceFlow || items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-8 text-center">
          <p className="text-sm font-medium text-foreground">No service flow yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {readOnly
              ? "A rundown has not been generated for this service."
              : "We couldn’t generate a rundown from the template. Open the full page to try again."}
          </p>
          {!readOnly ? (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <Button
                size="sm"
                onClick={() => {
                  hasAttemptedGenerate.current = false;
                  setIsGenerating(true);
                  void generateFromTemplate()
                    .catch((error) => {
                      console.error("Failed to generate calendar service flow:", error);
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
