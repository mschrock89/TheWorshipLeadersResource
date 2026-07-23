import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { useServiceFlow, useServiceFlowItems } from "@/hooks/useServiceFlow";
import { useNetworkWideCampus } from "@/hooks/useCampuses";
import { isNetworkWideMinistryType, MINISTRY_TYPES } from "@/lib/constants";
import { cn } from "@/lib/cn";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
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
  const effectiveMinistryType = normalizeMinistryType(ministryType);
  const { data: networkWideCampus } = useNetworkWideCampus();
  const effectiveCampusId =
    isNetworkWideMinistryType(effectiveMinistryType) || isNetworkWideMinistryType(ministryType)
      ? networkWideCampus?.id || campusId
      : campusId;
  const resolvedCampusName =
    campusName ||
    (effectiveCampusId && effectiveCampusId === networkWideCampus?.id
      ? networkWideCampus?.name
      : null);
  const ministryLabel =
    label ||
    MINISTRY_TYPES.find((option) => option.value === effectiveMinistryType)?.label ||
    MINISTRY_TYPES.find((option) => option.value === ministryType)?.label ||
    "Service";

  const { data: serviceFlow, isLoading: flowLoading } = useServiceFlow(
    effectiveCampusId || null,
    effectiveMinistryType,
    date,
    draftSetId,
    customServiceId,
  );
  const { data: items = [], isLoading: itemsLoading } = useServiceFlowItems(
    serviceFlow?.id || null,
  );

  const isLoading =
    flowLoading ||
    (!!serviceFlow?.id && itemsLoading) ||
    ((isNetworkWideMinistryType(effectiveMinistryType) || isNetworkWideMinistryType(ministryType)) &&
      !networkWideCampus);
  const fullPageHref = buildServiceFlowHref({
    date,
    campusId: effectiveCampusId,
    ministryType: effectiveMinistryType,
    draftSetId: draftSetId || serviceFlow?.draft_set_id || null,
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
              : "Open the full Service Flow page to generate it from the template."}
          </p>
          {!readOnly ? (
            <Button asChild size="sm" className="mt-4">
              <Link to={fullPageHref}>Open Service Flow</Link>
            </Button>
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
