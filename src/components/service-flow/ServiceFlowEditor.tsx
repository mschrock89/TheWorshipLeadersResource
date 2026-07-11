import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import { Plus, Calendar as CalendarIcon, GripVertical, RefreshCw } from "lucide-react";
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
import { MINISTRY_TYPES, isKidsCampSetMinistryType } from "@/lib/constants";
import { useServiceFlowTemplates } from "@/hooks/useServiceFlowTemplates";
import { useServiceTimeOverrides } from "@/hooks/useServiceTimeOverrides";
import { formatTeachingReference, useTeachingWeekForDate } from "@/hooks/useTeachingSchedule";
import { useScheduledTeamForDate } from "@/hooks/useScheduledTeamForDate";
import { useTeamRosterForDate, type RosterMember } from "@/hooks/useTeamRosterForDate";
import { useCustomServiceOccurrences } from "@/hooks/useCustomServices";
import { buildBibleHref } from "@/lib/bible";
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
import { ServiceFlow as ServiceFlowPreview, type Service as ServiceFlowPreviewData } from "./ServiceFlow";
import { AddItemDialog } from "./AddItemDialog";
import { formatTotalDuration } from "./DurationInput";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface ServiceFlowEditorProps {
  initialDate?: string;
  initialCampusId?: string;
  initialMinistryType?: string;
  initialDraftSetId?: string;
  initialCustomServiceId?: string;
  mode?: "editor" | "view";
}

const WEEKEND_SERVICE_TYPES = new Set(["weekend", "weekend_team", "sunday_am"]);
const TEAM_BUILDER_BLANK_SLOT_MEMBER_NAME = "__TEAM_BUILDER_BLANK_SLOT__";

function normalizeClockSource(value?: string | null): string | null {
  const normalized = value?.trim().slice(0, 5) || "";
  return /^\d{2}:\d{2}$/.test(normalized) ? normalized : null;
}

function clockSourceToSeconds(value?: string | null): number | null {
  const normalized = normalizeClockSource(value);
  if (!normalized) return null;

  const [hours, minutes] = normalized.split(":").map(Number);
  if (hours > 23 || minutes > 59) return null;
  return hours * 3600 + minutes * 60;
}

function formatClockTime(totalSeconds: number): string {
  const secondsInDay = 24 * 60 * 60;
  const normalizedSeconds = ((Math.round(totalSeconds / 60) * 60) % secondsInDay + secondsInDay) % secondsInDay;
  const hours24 = Math.floor(normalizedSeconds / 3600);
  const minutes = Math.floor((normalizedSeconds % 3600) / 60);
  const period = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;

  return `${hours12}:${String(minutes).padStart(2, "0")} ${period}`;
}

function getDefaultCampusServiceTimes(
  campus: { saturday_service_time: string[] | null; sunday_service_time: string[] | null } | undefined,
  date: Date,
  ministryType: string
): string[] {
  if (!campus || !WEEKEND_SERVICE_TYPES.has(ministryType)) return [];

  const dayOfWeek = date.getDay();
  if (dayOfWeek === 6) return campus.saturday_service_time || [];
  if (dayOfWeek === 0) return campus.sunday_service_time || [];
  return [];
}

function serviceTimeOverrideMatches(overrideMinistryType: string, ministryType: string): boolean {
  if (overrideMinistryType === ministryType) return true;
  return WEEKEND_SERVICE_TYPES.has(overrideMinistryType) && WEEKEND_SERVICE_TYPES.has(ministryType);
}

function normalizeRoleText(value?: string | null): string {
  return (value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ");
}

function compactRoleText(value?: string | null): string {
  return normalizeRoleText(value).replace(/\s+/g, "");
}

function rosterMemberHasRole(member: RosterMember, roles: Set<string>) {
  return [...member.positions, ...member.positionSlots].some((role) =>
    roles.has(compactRoleText(role))
  );
}

function formatRosterRoleNames(members: RosterMember[], roles: Set<string>) {
  const seen = new Set<string>();

  return members
    .filter((member) => rosterMemberHasRole(member, roles))
    .map((member) => member.memberName?.trim())
    .filter((name): name is string => Boolean(name) && name !== TEAM_BUILDER_BLANK_SLOT_MEMBER_NAME)
    .filter((name) => {
      const key = compactRoleText(name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(", ");
}

function isNamePlaceholderTitle(title: string) {
  const normalized = normalizeRoleText(title);
  return normalized === "name place holder" || normalized === "name placeholder";
}

function isAnnouncementsContext(title: string, sectionTitle: string) {
  const compactTitle = compactRoleText(title);
  const compactSectionTitle = compactRoleText(sectionTitle);
  return (
    compactSectionTitle.includes("announcement") ||
    compactSectionTitle.includes("anncouncement") ||
    compactSectionTitle.includes("annoucement") ||
    compactSectionTitle.includes("annoucnemt") ||
    compactSectionTitle.includes("annoucnemtn") ||
    compactTitle.includes("announcement") ||
    compactTitle.includes("anncouncement") ||
    compactTitle.includes("annoucement") ||
    compactTitle.includes("annoucnemt") ||
    compactTitle.includes("annoucnemtn")
  );
}

function isClosingPrayerContext(title: string, sectionTitle: string) {
  const normalizedTitle = normalizeRoleText(title);
  const normalizedSectionTitle = normalizeRoleText(sectionTitle);
  return (
    normalizedSectionTitle.includes("closing prayer") ||
    normalizedSectionTitle.includes("communion closing prayer") ||
    normalizedTitle.includes("communion closing prayer")
  );
}

function isLessonContext(title: string, sectionTitle: string) {
  const normalizedTitle = normalizeRoleText(title);
  const normalizedSectionTitle = normalizeRoleText(sectionTitle);
  return (
    normalizedSectionTitle.includes("lesson") ||
    normalizedSectionTitle.includes("message") ||
    normalizedSectionTitle.includes("sermon") ||
    normalizedSectionTitle.includes("teaching") ||
    normalizedTitle.includes("lesson") ||
    normalizedTitle.includes("teacher") ||
    normalizedTitle.includes("message") ||
    normalizedTitle.includes("sermon")
  );
}

function isLessonPlaceholderTitle(title: string) {
  const normalized = normalizeRoleText(title);
  return (
    isNamePlaceholderTitle(title) ||
    normalized === "lesson" ||
    normalized === "teacher" ||
    normalized === "teacher place holder" ||
    normalized === "teacher placeholder" ||
    normalized === "speaker" ||
    normalized === "speaker place holder" ||
    normalized === "speaker placeholder"
  );
}

export function ServiceFlowEditor({ 
  initialDate, 
  initialCampusId, 
  initialMinistryType,
  initialDraftSetId,
  initialCustomServiceId,
  mode = "editor",
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
  const hasAttemptedStaleTemplateSync = useRef(false);
  const hasAttemptedEmptyBackfill = useRef(false);
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
  const shouldResolveCustomService =
    !initialCustomServiceId &&
    !!effectiveCampusId &&
    (isKidsCampSetMinistryType(ministryType) || ministryType === "prayer_night");
  const {
    data: customServiceOccurrences = [],
    isLoading: customServiceOccurrencesLoading,
  } = useCustomServiceOccurrences({
    campusId: effectiveCampusId || undefined,
    ministryType,
    startDate: serviceDateStr,
    endDate: serviceDateStr,
  });
  const autoResolvedCustomService = useMemo(() => {
    if (!shouldResolveCustomService) return null;
    return customServiceOccurrences.length === 1 ? customServiceOccurrences[0] : null;
  }, [customServiceOccurrences, shouldResolveCustomService]);
  const {
    data: autoResolvedDraftSet = null,
    isLoading: autoResolvedDraftSetLoading,
  } = useQuery({
    queryKey: [
      "service-flow-auto-draft-set",
      effectiveCampusId,
      ministryType,
      serviceDateStr,
      autoResolvedCustomService?.id || null,
    ],
    enabled: shouldResolveCustomService,
    queryFn: async () => {
      let draftSetQuery = supabase
        .from("draft_sets")
        .select("id, custom_service_id")
        .eq("campus_id", effectiveCampusId!)
        .eq("ministry_type", ministryType)
        .eq("plan_date", serviceDateStr)
        .eq("status", "published")
        .not("custom_service_id", "is", null)
        .order("published_at", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(1);

      if (autoResolvedCustomService?.id) {
        draftSetQuery = draftSetQuery.eq("custom_service_id", autoResolvedCustomService.id);
      }

      const { data, error } = await draftSetQuery.maybeSingle();
      if (error) throw error;
      return (data as { id: string; custom_service_id: string | null } | null) || null;
    },
  });

  useEffect(() => {
    if (initialCustomServiceId) return;
    if (autoResolvedDraftSet?.custom_service_id) {
      if (resolvedCustomServiceId !== autoResolvedDraftSet.custom_service_id) {
        setResolvedCustomServiceId(autoResolvedDraftSet.custom_service_id);
      }
      return;
    }
    if (!autoResolvedCustomService?.id) return;
    if (resolvedCustomServiceId === autoResolvedCustomService.id) return;
    setResolvedCustomServiceId(autoResolvedCustomService.id);
  }, [
    autoResolvedCustomService?.id,
    autoResolvedDraftSet?.custom_service_id,
    initialCustomServiceId,
    resolvedCustomServiceId,
  ]);

  useEffect(() => {
    if (initialDraftSetId) return;
    if (!autoResolvedDraftSet?.id) return;
    if (resolvedDraftSetId === autoResolvedDraftSet.id) return;
    setResolvedDraftSetId(autoResolvedDraftSet.id);
  }, [autoResolvedDraftSet?.id, initialDraftSetId, resolvedDraftSetId]);

  const effectiveCustomServiceId =
    resolvedCustomServiceId ||
    initialCustomServiceId ||
    autoResolvedDraftSet?.custom_service_id ||
    autoResolvedCustomService?.id ||
    null;

  const { data: directCustomServiceFlow = null } = useQuery({
    queryKey: [
      "service-flow-direct-custom-service",
      effectiveCampusId,
      ministryType,
      serviceDateStr,
      effectiveCustomServiceId,
    ],
    enabled: !!effectiveCampusId && !!serviceDateStr && !!effectiveCustomServiceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_flows")
        .select("*")
        .eq("campus_id", effectiveCampusId!)
        .eq("service_date", serviceDateStr)
        .eq("custom_service_id", effectiveCustomServiceId!)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data || null;
    },
  });

  const { data: teachingWeek } = useTeachingWeekForDate(
    effectiveCampusId,
    ministryType,
    serviceDateStr
  );
  const { data: scheduledTeam } = useScheduledTeamForDate(
    selectedDate,
    effectiveCampusId,
    ministryType
  );
  const { data: scheduledRoster = [] } = useTeamRosterForDate(
    selectedDate,
    scheduledTeam?.teamId,
    ministryType,
    effectiveCampusId
  );
  const { data: serviceTimeOverrides = [] } = useServiceTimeOverrides({
    campusId: effectiveCampusId || undefined,
    startDate: serviceDateStr,
    endDate: serviceDateStr,
  });
  const { data: customServiceStartTime = null } = useQuery({
    queryKey: ["custom-service-start-time", effectiveCustomServiceId],
    enabled: !!effectiveCustomServiceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("custom_services")
        .select("start_time")
        .eq("id", effectiveCustomServiceId!)
        .maybeSingle();

      if (error) throw error;
      return normalizeClockSource(data?.start_time) || null;
    },
  });

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
    hasAttemptedStaleTemplateSync.current = false;
    hasAttemptedEmptyBackfill.current = false;
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
    effectiveCustomServiceId
  );

  // When opened via Live button, force refetch to get latest data
  useEffect(() => {
    if (!cameFromLive || !effectiveCampusId || !serviceDateStr) return;
      queryClient.invalidateQueries({
      queryKey: ["service-flow", effectiveCampusId, ministryType, serviceDateStr, resolvedDraftSetId, effectiveCustomServiceId],
    });
  }, [cameFromLive, effectiveCampusId, ministryType, serviceDateStr, resolvedDraftSetId, effectiveCustomServiceId, queryClient]);

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
      if (serviceFlow || directCustomServiceFlow) return;
      if (hasAttemptedAutoGenerate.current) return;
      if (shouldResolveCustomService && (customServiceOccurrencesLoading || autoResolvedDraftSetLoading)) return;
      if ((autoResolvedDraftSet?.custom_service_id || autoResolvedCustomService?.id) && !effectiveCustomServiceId) return;

      hasAttemptedAutoGenerate.current = true;
      setIsAutoGenerating(true);

      try {
        let draftSetId = initialDraftSetId || autoResolvedDraftSet?.id || null;
        let draftSetCustomServiceId =
          initialCustomServiceId ||
          effectiveCustomServiceId ||
          autoResolvedDraftSet?.custom_service_id ||
          autoResolvedCustomService?.id ||
          null;

        if (!draftSetId) {
          let draftSetQuery = supabase
            .from("draft_sets")
            .select("id, custom_service_id")
            .eq("campus_id", effectiveCampusId)
            .eq("ministry_type", ministryType)
            .eq("plan_date", serviceDateStr)
            .eq("status", "published");

          if (draftSetCustomServiceId) {
            draftSetQuery = draftSetQuery.eq("custom_service_id", draftSetCustomServiceId);
          }

          const { data: draftSet, error: draftSetError } = await draftSetQuery
            .order("published_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (draftSetError) throw draftSetError;
          draftSetId = draftSet?.id || null;
          draftSetCustomServiceId = (draftSet as any)?.custom_service_id || null;
        }

        if (!draftSetId && !draftSetCustomServiceId) {
          return;
        }

        if (draftSetId) {
          setResolvedDraftSetId(draftSetId);
        }
        if (draftSetCustomServiceId) {
          setResolvedCustomServiceId(draftSetCustomServiceId);
        }

        const songs = draftSetId ? await loadDraftSongsWithVocalists(draftSetId) : [];

        const generatedFlowId = await generateServiceFlowFromTemplate({
          campusId: effectiveCampusId,
          ministryType,
          serviceDate: serviceDateStr,
          draftSetId,
          customServiceId: draftSetCustomServiceId || effectiveCustomServiceId || initialCustomServiceId || null,
          createdBy: user.id,
          forceTemplateResync: true,
          songs,
        });
        setBoundServiceFlowId(generatedFlowId);

        // Ensure the UI refetches after creating the flow/items
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: ["service-flow", effectiveCampusId, ministryType, serviceDateStr, draftSetId, draftSetCustomServiceId || effectiveCustomServiceId],
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
  }, [
    effectiveCampusId,
    flowLoading,
    ministryType,
    queryClient,
    serviceDateStr,
    serviceFlow,
    toast,
    user?.id,
    initialDraftSetId,
    initialCustomServiceId,
    effectiveCustomServiceId,
    autoResolvedDraftSet?.id,
    autoResolvedDraftSet?.custom_service_id,
    autoResolvedDraftSetLoading,
    autoResolvedCustomService?.id,
    customServiceOccurrencesLoading,
    shouldResolveCustomService,
    directCustomServiceFlow,
    loadDraftSongsWithVocalists,
  ]);

  const activeServiceFlowId = boundServiceFlowId || serviceFlow?.id || directCustomServiceFlow?.id || null;
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
      // Kids Camp combined flows may have no draft_set_id — they fetch songs from both
      // sessions internally inside generateServiceFlowFromTemplate.
      const isKidsCampFlow = isKidsCampSetMinistryType(ministryType) || ministryType === "kids_camp";
      if (!draftSetId && !isKidsCampFlow) return;

      hasAttemptedLiveTemplateSync.current = true;

      try {
        const songs = draftSetId ? await loadDraftSongsWithVocalists(draftSetId) : [];

        await generateServiceFlowFromTemplate({
          campusId: effectiveCampusId,
          ministryType,
          serviceDate: serviceDateStr,
          draftSetId,
          customServiceId: effectiveCustomServiceId || null,
          createdBy: user.id,
          forceTemplateResync: true,
          songs,
        });

        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: ["service-flow", effectiveCampusId, ministryType, serviceDateStr, resolvedDraftSetId, effectiveCustomServiceId],
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
    effectiveCustomServiceId,
    loadDraftSongsWithVocalists,
  ]);

  // Detect when the service flow template was updated after the flow was last generated
  // and automatically regenerate. This covers the case where a user edits the template
  // and then opens the service flow editor without going through Live mode.
  useEffect(() => {
    const syncStaleTemplateFlow = async () => {
      if (!serviceFlow?.id) return;
      if (!user?.id || !effectiveCampusId) return;
      if (hasAttemptedLiveTemplateSync.current) return; // Live sync handles this path
      if (hasAttemptedStaleTemplateSync.current) return;
      if (itemsLoading) return;
      if (!serviceFlow.created_from_template_id) return;

      // Find the matching template for the current campus/ministry
      const relevantMinistry =
        isKidsCampSetMinistryType(ministryType) ? "kids_camp" : ministryType;
      const matchingTemplate = (campusTemplates || []).find(
        (t) => t.ministry_type === relevantMinistry
      );
      if (!matchingTemplate) return;

      const templateUpdatedAt = matchingTemplate.updated_at
        ? new Date(matchingTemplate.updated_at).getTime()
        : null;
      const flowUpdatedAt = serviceFlow.updated_at
        ? new Date(serviceFlow.updated_at).getTime()
        : null;

      const templateIsNewer =
        templateUpdatedAt !== null &&
        flowUpdatedAt !== null &&
        templateUpdatedAt > flowUpdatedAt;
      const templateIdMismatch =
        serviceFlow.created_from_template_id !== matchingTemplate.id;

      if (!templateIsNewer && !templateIdMismatch) return;

      hasAttemptedStaleTemplateSync.current = true;

      try {
        const draftSetId = serviceFlow.draft_set_id || resolvedDraftSetId || null;
        const songs = draftSetId ? await loadDraftSongsWithVocalists(draftSetId) : [];

        await generateServiceFlowFromTemplate({
          campusId: effectiveCampusId,
          ministryType,
          serviceDate: serviceDateStr,
          draftSetId,
          customServiceId: effectiveCustomServiceId || null,
          createdBy: user.id,
          forceTemplateResync: true,
          songs,
        });

        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: ["service-flow", effectiveCampusId, ministryType, serviceDateStr, resolvedDraftSetId, effectiveCustomServiceId],
          }),
          queryClient.invalidateQueries({
            queryKey: ["service-flow-items", serviceFlow.id],
          }),
        ]);
      } catch {
        // Keep the page usable even if sync fails.
      }
    };

    syncStaleTemplateFlow();
  }, [
    serviceFlow?.id,
    serviceFlow?.created_from_template_id,
    serviceFlow?.updated_at,
    serviceFlow?.draft_set_id,
    effectiveCustomServiceId,
    user?.id,
    effectiveCampusId,
    ministryType,
    serviceDateStr,
    campusTemplates,
    itemsLoading,
    queryClient,
    resolvedDraftSetId,
    loadDraftSongsWithVocalists,
  ]);

  // If a flow already exists but is empty, backfill it from the linked setlist/template.
  useEffect(() => {
    const backfillEmptyFlow = async () => {
      if (!user?.id || !effectiveCampusId) return;
      if (!activeServiceFlowId) return;
      if (itemsLoading) return;
      if (items.length > 0) return;
      if (hasAttemptedEmptyBackfill.current) return;
      if (shouldResolveCustomService && (customServiceOccurrencesLoading || autoResolvedDraftSetLoading)) return;
      if ((autoResolvedDraftSet?.custom_service_id || autoResolvedCustomService?.id) && !effectiveCustomServiceId) return;

      hasAttemptedEmptyBackfill.current = true;

      try {
        let draftSetId = serviceFlow?.draft_set_id || resolvedDraftSetId || autoResolvedDraftSet?.id;
        let draftSetCustomServiceId =
          effectiveCustomServiceId ||
          autoResolvedDraftSet?.custom_service_id ||
          autoResolvedCustomService?.id ||
          initialCustomServiceId ||
          null;

        if (!draftSetId) {
          let draftSetQuery = supabase
            .from("draft_sets")
            .select("id, custom_service_id")
            .eq("campus_id", effectiveCampusId)
            .eq("ministry_type", ministryType)
            .eq("plan_date", serviceDateStr)
            .eq("status", "published");

          if (draftSetCustomServiceId) {
            draftSetQuery = draftSetQuery.eq("custom_service_id", draftSetCustomServiceId);
          }

          const { data: draftSet, error: draftSetError } = await draftSetQuery
            .order("published_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (draftSetError) throw draftSetError;
          draftSetId = draftSet?.id || null;
          draftSetCustomServiceId = (draftSet as any)?.custom_service_id || draftSetCustomServiceId;
        }

        if (!draftSetId && !draftSetCustomServiceId) return;

        if (draftSetId) {
          setResolvedDraftSetId(draftSetId);
        }
        if (draftSetCustomServiceId) {
          setResolvedCustomServiceId(draftSetCustomServiceId);
        }

        const songs = draftSetId ? await loadDraftSongsWithVocalists(draftSetId) : [];

        await generateServiceFlowFromTemplate({
          campusId: effectiveCampusId,
          ministryType,
          serviceDate: serviceDateStr,
          draftSetId,
          customServiceId: draftSetCustomServiceId,
          createdBy: user.id,
          forceTemplateResync: true,
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
  }, [
    activeServiceFlowId,
    effectiveCampusId,
    items,
    itemsLoading,
    ministryType,
    queryClient,
    resolvedDraftSetId,
    effectiveCustomServiceId,
    serviceDateStr,
    serviceFlow?.draft_set_id,
    user?.id,
    initialCustomServiceId,
    autoResolvedDraftSet?.id,
    autoResolvedDraftSet?.custom_service_id,
    autoResolvedDraftSetLoading,
    autoResolvedCustomService?.id,
    customServiceOccurrencesLoading,
    shouldResolveCustomService,
    loadDraftSongsWithVocalists,
  ]);

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

  const [isRegenerating, setIsRegenerating] = useState(false);

  // Deterministic, user-triggered rebuild of the flow from the current saved template.
  // The automatic resyncs are guarded (run once per mount, swallow errors), so this gives
  // a reliable way to pull in template edits made after the flow was generated.
  const handleRegenerateFromTemplate = useCallback(async () => {
    if (!user?.id || !effectiveCampusId || !serviceDateStr) return;
    setIsRegenerating(true);
    try {
      const draftSetId = serviceFlow?.draft_set_id || resolvedDraftSetId || null;
      const songs = draftSetId ? await loadDraftSongsWithVocalists(draftSetId) : [];

      await generateServiceFlowFromTemplate({
        campusId: effectiveCampusId,
        ministryType,
        serviceDate: serviceDateStr,
        draftSetId,
        customServiceId: effectiveCustomServiceId || null,
        createdBy: user.id,
        forceTemplateResync: true,
        songs,
      });

      // Let the automatic syncs run again on the refreshed data.
      hasAttemptedLiveTemplateSync.current = false;
      hasAttemptedStaleTemplateSync.current = false;
      hasAttemptedEmptyBackfill.current = false;

      await queryClient.invalidateQueries({ queryKey: ["service-flow"] });
      await queryClient.invalidateQueries({ queryKey: ["service-flow-items"] });

      toast({
        title: "Service Flow rebuilt",
        description: "Regenerated from the current saved template.",
      });
    } catch (e: any) {
      toast({
        title: "Couldn't rebuild Service Flow",
        description: e?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsRegenerating(false);
    }
  }, [
    user?.id,
    effectiveCampusId,
    serviceDateStr,
    ministryType,
    serviceFlow?.draft_set_id,
    resolvedDraftSetId,
    effectiveCustomServiceId,
    loadDraftSongsWithVocalists,
    queryClient,
    toast,
  ]);

  const totalDuration = useMemo(() => {
    return localItems.reduce((sum, item) => sum + (item.duration_seconds || 0), 0);
  }, [localItems]);

  const scheduledStartTime = useMemo(() => {
    if (customServiceStartTime) return customServiceStartTime;

    const matchingOverride = serviceTimeOverrides
      .filter((override) => {
        if (!effectiveCampusId || override.campus_id !== effectiveCampusId) return false;
        if (override.service_date !== serviceDateStr) return false;
        return serviceTimeOverrideMatches(override.ministry_type || "weekend", ministryType);
      })
      .sort((a, b) => {
        const aExact = (a.ministry_type || "weekend") === ministryType ? 0 : 1;
        const bExact = (b.ministry_type || "weekend") === ministryType ? 0 : 1;
        return aExact - bExact || (a.ministry_type || "").localeCompare(b.ministry_type || "");
      })[0];

    const overrideTime = matchingOverride?.service_times
      ?.map(normalizeClockSource)
      .filter((time): time is string => Boolean(time))
      .sort()[0];
    if (overrideTime) return overrideTime;

    const campus = campuses?.find((campus) => campus.id === effectiveCampusId);
    const defaultTime = getDefaultCampusServiceTimes(campus, selectedDate, ministryType)
      .map(normalizeClockSource)
      .filter((time): time is string => Boolean(time))
      .sort()[0];

    return defaultTime || null;
  }, [
    campuses,
    customServiceStartTime,
    effectiveCampusId,
    ministryType,
    selectedDate,
    serviceDateStr,
    serviceTimeOverrides,
  ]);

  const clockTimesByItemId = useMemo(() => {
    const startSeconds = clockSourceToSeconds(scheduledStartTime);
    const clockMap = new Map<string, string>();
    if (startSeconds === null) return clockMap;

    let currentSectionTitle = "";
    let secondsBeforeServiceStart = 0;
    let hasServiceStartAnchor = false;

    for (const item of localItems) {
      if (item.item_type === "header") {
        currentSectionTitle = item.title;
        continue;
      }

      const title = item.song?.title || item.title;
      if (isAnnouncementsContext(title, currentSectionTitle)) {
        hasServiceStartAnchor = true;
        break;
      }

      secondsBeforeServiceStart += item.duration_seconds || 0;
    }

    let runningSeconds = hasServiceStartAnchor
      ? startSeconds - secondsBeforeServiceStart
      : startSeconds;

    localItems.forEach((item) => {
      if (item.item_type === "header") return;
      clockMap.set(item.id, formatClockTime(runningSeconds));
      runningSeconds += item.duration_seconds || 0;
    });

    return clockMap;
  }, [localItems, scheduledStartTime]);

  const scheduledRoleNames = useMemo(() => ({
    announcements: formatRosterRoleNames(
      scheduledRoster,
      new Set(["announcement", "announcements", "anncouncement", "anncouncements", "annoucement", "annoucements"])
    ),
    closingPrayer: formatRosterRoleNames(
      scheduledRoster,
      new Set(["closingprayer", "closer"])
    ),
    teacher: formatRosterRoleNames(
      scheduledRoster,
      new Set(["teacher", "speaker", "pastor speaker", "pastorspeaker"])
    ),
  }), [scheduledRoster]);

  const resolvePlaceholderTitle = useCallback((
    item: ServiceFlowItemType,
    sectionTitle: string
  ) => {
    const rawTitle = item.song?.title || item.title;

    if (
      isNamePlaceholderTitle(rawTitle) &&
      isAnnouncementsContext(rawTitle, sectionTitle)
    ) {
      return scheduledRoleNames.announcements || teachingWeek?.announcer_name?.trim() || rawTitle;
    }

    if (
      isNamePlaceholderTitle(rawTitle) &&
      isClosingPrayerContext(rawTitle, sectionTitle)
    ) {
      return scheduledRoleNames.closingPrayer || rawTitle;
    }

    if (
      normalizeRoleText(rawTitle) === "communion closing prayer" &&
      scheduledRoleNames.closingPrayer
    ) {
      return scheduledRoleNames.closingPrayer;
    }

    if (isLessonPlaceholderTitle(rawTitle) && isLessonContext(rawTitle, sectionTitle)) {
      return (
        teachingWeek?.teacher_name?.trim() ||
        scheduledRoleNames.teacher ||
        rawTitle
      );
    }

    return rawTitle;
  }, [
    scheduledRoleNames.announcements,
    scheduledRoleNames.closingPrayer,
    scheduledRoleNames.teacher,
    teachingWeek?.announcer_name,
    teachingWeek?.teacher_name,
  ]);

  const resolvedItemTitlesById = useMemo(() => {
    const titles = new Map<string, string>();
    let currentSectionTitle = "";

    localItems.forEach((item) => {
      if (item.item_type === "header") {
        currentSectionTitle = item.title;
        return;
      }

      titles.set(item.id, resolvePlaceholderTitle(item, currentSectionTitle));
    });

    return titles;
  }, [localItems, resolvePlaceholderTitle]);

  const printDateRange = useMemo(() => {
    const date = new Date(selectedDate);
    const dayOfWeek = date.getDay();
    const saturday = new Date(date);

    if (dayOfWeek === 0) {
      saturday.setDate(date.getDate() - 1);
    } else if (dayOfWeek !== 6) {
      saturday.setDate(date.getDate() + (6 - dayOfWeek));
    }

    const sunday = new Date(saturday);
    sunday.setDate(saturday.getDate() + 1);

    const options: Intl.DateTimeFormatOptions = { month: "long", day: "numeric" };
    const satStr = saturday.toLocaleDateString("en-US", options);
    const sunStr = sunday.toLocaleDateString("en-US", { day: "numeric" });
    const year = saturday.getFullYear();

    return `${satStr}-${sunStr}, ${year}`;
  }, [selectedDate]);

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
          customServiceId: effectiveCustomServiceId || null,
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
    [activeServiceFlowId, serviceFlow?.id, effectiveCampusId, ministryType, serviceDateStr, user?.id, localItems.length, effectiveCustomServiceId, createFlow, saveItem]
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

  const servicePreview = useMemo<ServiceFlowPreviewData>(() => {
    const campusName = campuses?.find((campus) => campus.id === effectiveCampusId)?.name;
    const ministryLabel =
      availableMinistryOptions.find((option) => option.value === ministryType)?.label ||
      MINISTRY_TYPES.find((option) => option.value === ministryType)?.label ||
      "Service";

    const sections: ServiceFlowPreviewData["sections"] = [];
    let currentSection: ServiceFlowPreviewData["sections"][number] | null = null;

    const ensureSection = () => {
      if (!currentSection) {
        currentSection = {
          id: "section-overview",
          title: "Service",
          items: [],
        };
        sections.push(currentSection);
      }
      return currentSection;
    };

    const inferItemType = (
      item: ServiceFlowItemType,
      sectionTitle: string
    ): "song" | "video" | "announcement" | "message" | "speaker" | "other" => {
      if (item.item_type === "song") return "song";

      const title = item.title.toLowerCase();
      if (title.includes("video")) return "video";

      // Person slots (teacher, announcer, etc.) — show as Speaker even when the
      // title has been replaced with a person's name.
      if (
        isLessonContext(item.title, sectionTitle) ||
        isAnnouncementsContext(item.title, sectionTitle) ||
        title.includes("message") ||
        title.includes("sermon") ||
        title.includes("teaching") ||
        title.includes("speaker") ||
        title.includes("welcome") ||
        title.includes("host")
      ) {
        return "speaker";
      }

      if (title.includes("announcement")) return "announcement";
      return "other";
    };

    const formatItemDuration = (seconds: number | null) => {
      if (!seconds || seconds <= 0) return "TBD";
      const minutes = Math.floor(seconds / 60);
      const remainder = seconds % 60;
      return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
    };

    const formatLeader = (item: ServiceFlowItemType) => {
      if (item.vocalists && item.vocalists.length > 0) {
        return item.vocalists
          .map((vocalist) => vocalist.full_name || "")
          .filter(Boolean)
          .join(", ");
      }
      return item.vocalist?.full_name || undefined;
    };

    localItems.forEach((item) => {
      if (item.item_type === "header") {
        currentSection = {
          id: item.id,
          title: item.title,
          items: [],
        };
        sections.push(currentSection);
        return;
      }

      ensureSection().items.push({
        id: item.id,
        title: resolvePlaceholderTitle(item, currentSection?.title || ""),
        type: inferItemType(item, currentSection?.title || ""),
        duration: formatItemDuration(item.duration_seconds),
        clockTime: clockTimesByItemId.get(item.id),
        bpm: item.song?.bpm || undefined,
        key: item.song_key || undefined,
        leader: formatLeader(item),
      });
    });

    return {
      title: [campusName, ministryLabel].filter(Boolean).join(" ") || "Service Flow",
      date: serviceDateStr,
      totalTime: formatTotalDuration(totalDuration),
      sections: sections.filter((section) => section.items.length > 0),
    };
  }, [
    campuses,
    effectiveCampusId,
    availableMinistryOptions,
    clockTimesByItemId,
    ministryType,
    localItems,
    resolvePlaceholderTitle,
    serviceDateStr,
    totalDuration,
  ]);

  return (
    <div className="service-flow-editor space-y-4">
      {/* Header Controls */}
      <div className="service-flow-screen-layout flex flex-wrap gap-3 items-center print:hidden">
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

        {scheduledStartTime ? (
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Start: </span>
            <span className="font-medium tabular-nums">
              {formatClockTime(clockSourceToSeconds(scheduledStartTime) || 0)}
            </span>
          </div>
        ) : null}
      </div>

      {teachingWeek ? (
        <div className="service-flow-screen-layout rounded-lg border border-border bg-muted/20 px-4 py-3 print:hidden">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-border bg-background px-2 py-1 text-xs font-medium text-muted-foreground">
              Teaching
            </span>
            <span className="text-sm font-medium">
              {formatTeachingReference(teachingWeek)}
            </span>
            {teachingWeek.teacher_name ? (
              <span className="text-xs font-medium text-foreground">
                {teachingWeek.teacher_name}
              </span>
            ) : null}
            {teachingWeek.themes_manual && teachingWeek.themes_manual.length > 0 ? (
              <span className="text-xs text-muted-foreground">
                {teachingWeek.themes_manual.join(", ")}
              </span>
            ) : null}
            <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs">
              <Link to={buildBibleHref(formatTeachingReference(teachingWeek), teachingWeek.translation || "ESV")}>
                Read Passage
              </Link>
            </Button>
          </div>
          {teachingWeek.ai_summary ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {teachingWeek.ai_summary}
            </p>
          ) : null}
          {(teachingWeek.psa_highlight || teachingWeek.announcer_name) ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {[teachingWeek.psa_highlight, teachingWeek.announcer_name].filter(Boolean).join(" • ")}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Items List */}
      <div className="service-flow-screen-layout print:hidden">
        {isLoading ? (
          mode === "view" ? (
            <div className="space-y-3">
              <Skeleton className="h-32 w-full rounded-[28px]" />
              <Skeleton className="h-24 w-full rounded-[24px]" />
              <Skeleton className="h-24 w-full rounded-[24px]" />
            </div>
          ) : (
            <>
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </>
          )
        ) : localItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-[28px] border border-dashed border-border bg-card/40 py-16 text-center text-muted-foreground">
            <p>No items in this service flow yet.</p>
            <p className="text-sm">
              {mode === "view" ? "Switch to edit mode to add items." : "Click the + button to add items."}
            </p>
          </div>
        ) : mode === "view" ? (
          <ServiceFlowPreview service={servicePreview} />
        ) : (
          <div className="space-y-2 min-h-[200px]">
            {localItems.map((item, index) => (
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
                  displayTitle={resolvedItemTitlesById.get(item.id)}
                  clockTime={clockTimesByItemId.get(item.id)}
                  isDragging={draggedItem?.id === item.id}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {mode === "editor" ? (
        <div className="service-flow-screen-layout service-flow-total-footer flex items-center justify-between pt-4 border-t print:hidden">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsAddDialogOpen(true)}
              disabled={!effectiveCampusId}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Item
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRegenerateFromTemplate}
              disabled={!effectiveCampusId || isRegenerating}
              title="Rebuild this service flow from the current saved template"
            >
              <RefreshCw className={cn("h-4 w-4 mr-1", isRegenerating && "animate-spin")} />
              Reset to Template
            </Button>
          </div>
          <div className="text-sm font-medium">
            <span className="text-muted-foreground">Total: </span>
            <span>{formatTotalDuration(totalDuration)}</span>
          </div>
        </div>
      ) : null}

      {!isLoading && localItems.length > 0 ? (
        <div className="service-flow-print-render service-flow-print-pair hidden print:grid print:grid-cols-2 print:gap-[0.2in]">
          <ServiceFlowPreview
            service={servicePreview}
            compactMode
            showProgressBar={false}
            printFitHalfSheet
          />
          <ServiceFlowPreview
            service={servicePreview}
            compactMode
            showProgressBar={false}
            printFitHalfSheet
          />
        </div>
      ) : null}

      <AddItemDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onAdd={handleAddItem}
      />
    </div>
  );
}
