import { Link } from "react-router-dom";
import { ChevronRight, Heart, Megaphone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMyServiceScriptGroups } from "@/hooks/useServiceScripts";
import {
  formatScriptWeekendLabel,
  isWeekendDate,
  monthStartForDate,
  resolveEffectiveScript,
  SERVICE_SCRIPT_KIND_LABELS,
} from "@/lib/serviceScripts";

const KIND_ICONS = {
  announcement: Megaphone,
  closing_prayer: Heart,
} as const;

export function ServiceScriptWidget() {
  const { groups, scripts, isLoading, error } = useMyServiceScriptGroups();
  const upcoming = groups.slice(0, 2);

  if (isLoading || error || upcoming.length === 0) return null;

  return (
    <Card className="mb-8 border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-lg">Your scripts</CardTitle>
          <Link to="/my-scripts" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
            View all
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {upcoming.map((group) => {
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
            : group.weekendKey;
          const preview = resolved.script?.body.trim();

          return (
            <Link
              key={group.key}
              to={`/my-scripts?campus=${group.campusId}&kind=${group.kind}&weekend=${group.weekendKey}&month=${monthStartForDate(group.weekendKey)}`}
              className="block rounded-lg border border-border/70 p-3 transition-colors hover:bg-muted/40"
            >
              <div className="flex items-center gap-2 font-medium">
                <Icon className="h-4 w-4 text-primary" />
                {SERVICE_SCRIPT_KIND_LABELS[group.kind]}
                <span className="text-sm font-normal text-muted-foreground">{dateLabel}</span>
              </div>
              <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                {preview || "The script hasn't been sent yet."}
              </p>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
