import { Link, useSearchParams } from "react-router-dom";
import { useEffect } from "react";
import { ArrowLeft, Heart, MapPin, Megaphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card id={`script-${group.key}`} className={highlighted ? "border-primary/50" : undefined}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Icon className="h-5 w-5 text-primary" />
              {SERVICE_SCRIPT_KIND_LABELS[group.kind]}
            </CardTitle>
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
      </CardHeader>
      <CardContent>
        {resolved.script ? (
          <div className="whitespace-pre-wrap rounded-lg border border-border/70 bg-muted/30 p-4 text-base leading-7 text-foreground">
            {resolved.script.body}
          </div>
        ) : (
          <p className="text-muted-foreground">
            Your admin hasn't sent the {SERVICE_SCRIPT_KIND_LABELS[group.kind].toLowerCase()} script for this date yet.
          </p>
        )}
      </CardContent>
    </Card>
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
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Scripts couldn't be loaded. Pull to refresh, or check back in a moment.
          </CardContent>
        </Card>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-muted-foreground">
            You're not scheduled for announcements or closing prayer on an upcoming date.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
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
