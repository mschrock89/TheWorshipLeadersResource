import { Link, useSearchParams } from "react-router-dom";
import { useEffect } from "react";
import { ArrowLeft, Heart, MapPin, Megaphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useMyServiceScriptGroups } from "@/hooks/useServiceScripts";
import { getMinistryLabel } from "@/lib/constants";
import {
  formatScriptWeekendLabel,
  isWeekendDate,
  resolveEffectiveScript,
  SERVICE_SCRIPT_KIND_LABELS,
  type ScriptAssignmentGroup,
} from "@/lib/serviceScripts";

const KIND_ICONS = {
  announcement: Megaphone,
  closing_prayer: Heart,
} as const;

function ScriptAssignmentCard({
  group,
  scripts,
  highlighted,
}: {
  group: ScriptAssignmentGroup;
  scripts: Parameters<typeof resolveEffectiveScript>[0];
  highlighted: boolean;
}) {
  const Icon = KIND_ICONS[group.kind];
  const resolved = resolveEffectiveScript(
    scripts,
    group.kind,
    group.weekendKey,
    group.ministryType,
    group.campusId,
  );
  const dateLabel = isWeekendDate(group.weekendKey)
    ? formatScriptWeekendLabel(group.weekendKey)
    : new Date(`${group.weekendKey}T12:00:00`).toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      });

  return (
    <article
      id={`script-${group.key}`}
      className={`border-b border-border/40 py-6 last:border-b-0 ${highlighted ? "-mx-3 rounded-lg bg-primary/5 px-3" : ""}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold text-foreground">
            <Icon className="h-5 w-5 text-primary" />
            {SERVICE_SCRIPT_KIND_LABELS[group.kind]}
          </h2>
          <p className="mt-1 text-lg font-medium text-foreground">{dateLabel}</p>
        </div>
        <Badge variant="secondary">
          {resolved.source === "week" ? "This weekend" : resolved.source === "month" ? "Monthly script" : "Not sent yet"}
        </Badge>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        {group.campusName && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            {group.campusName}
          </span>
        )}
        <span>{getMinistryLabel(group.ministryType)}</span>
        {group.teamNames.length > 0 && <span>{group.teamNames.join(", ")}</span>}
      </div>
      {resolved.script ? (
        <p className="mt-4 whitespace-pre-wrap text-base leading-7 text-foreground">
          {resolved.script.body}
        </p>
      ) : (
        <p className="mt-4 text-muted-foreground">
          Your admin hasn't sent the {SERVICE_SCRIPT_KIND_LABELS[group.kind].toLowerCase()} script for this date yet.
        </p>
      )}
    </article>
  );
}

export default function MyServiceScripts() {
  const [searchParams] = useSearchParams();
  const { groups, scripts, isLoading, error } = useMyServiceScriptGroups();
  const highlightCampus = searchParams.get("campus");
  const highlightKind = searchParams.get("kind");
  const highlightWeekend = searchParams.get("weekend");

  useEffect(() => {
    if (isLoading) return;
    const match = groups.find((group) =>
      group.campusId === highlightCampus &&
      group.kind === highlightKind &&
      (!highlightWeekend || group.weekendKey === highlightWeekend)
    );
    if (!match) return;
    document.getElementById(`script-${match.key}`)?.scrollIntoView({ block: "start" });
  }, [groups, highlightCampus, highlightKind, highlightWeekend, isLoading]);

  return (
    <div className="mx-auto w-full max-w-3xl py-0 sm:py-4">
      <Link
        to="/dashboard"
        className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Dashboard
      </Link>
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold text-foreground">My Scripts</h1>
        <p className="mt-2 text-muted-foreground">
          Announcements and closing prayer scripts for the dates you're scheduled.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : error ? (
        <p className="text-sm text-muted-foreground">
          Scripts couldn't be loaded. Pull to refresh, or check back in a moment.
        </p>
      ) : groups.length === 0 ? (
        <p className="text-muted-foreground">
          You're not scheduled for announcements or closing prayer on an upcoming date.
        </p>
      ) : (
        <div>
          {groups.map((group) => (
            <ScriptAssignmentCard
              key={group.key}
              group={group}
              scripts={scripts}
              highlighted={
                group.campusId === highlightCampus &&
                group.kind === highlightKind &&
                (!highlightWeekend || group.weekendKey === highlightWeekend)
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
