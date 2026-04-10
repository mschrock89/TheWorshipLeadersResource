import { useEffect, useMemo, useState } from "react";
import { X, Plus, User, Edit2, AlertTriangle, SplitSquareVertical } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { MINISTRY_TYPES } from "@/lib/constants";
import { TeamMemberAssignment } from "@/hooks/useTeamBuilder";

interface PositionSlotProps {
  label: string;
  memberName?: string;
  avatarUrl?: string | null;
  isEmpty: boolean;
  onRemove: () => void;
  onAdd: () => void;
  readOnly?: boolean;
  ministryTypes?: string[];
  onEditMinistry?: () => void;
  showMinistryBadges?: boolean;
  conflictDates?: string[];
  scheduleDates?: string[];
  dateOverrides?: Record<string, TeamMemberAssignment>;
  dateOverrideConflictDates?: Record<string, string[]>;
  onAssignDate?: (scheduleDate: string) => void;
  onRemoveDateOverride?: (scheduleDate: string) => void;
}

export function PositionSlot({
  label,
  memberName,
  avatarUrl,
  isEmpty,
  onRemove,
  onAdd,
  readOnly = false,
  ministryTypes = [],
  onEditMinistry,
  showMinistryBadges = true,
  conflictDates = [],
  scheduleDates = [],
  dateOverrides = {},
  dateOverrideConflictDates = {},
  onAssignDate,
  onRemoveDateOverride,
}: PositionSlotProps) {
  const [selectedView, setSelectedView] = useState<"all" | string>("all");
  const ministryBadges = showMinistryBadges
    ? ministryTypes.map((mt) => MINISTRY_TYPES.find((m) => m.value === mt)).filter(Boolean)
    : [];
  const hasWeekendSplit = scheduleDates.length > 0;

  useEffect(() => {
    if (selectedView !== "all" && !scheduleDates.includes(selectedView)) {
      setSelectedView("all");
    }
  }, [scheduleDates, selectedView]);

  const selectedOverride = selectedView !== "all" ? dateOverrides[selectedView] : undefined;
  const selectedMemberName = selectedOverride?.member_name || memberName;
  const selectedAvatarUrl = selectedOverride ? null : avatarUrl;
  const selectedConflictDates = useMemo(() => {
    if (selectedView === "all") {
      return conflictDates;
    }

    if (selectedOverride) {
      return dateOverrideConflictDates[selectedView] || [];
    }

    return conflictDates.includes(selectedView) ? [selectedView] : [];
  }, [conflictDates, dateOverrideConflictDates, selectedOverride, selectedView]);

  const hasConflicts = selectedConflictDates.length > 0;
  const isDateView = selectedView !== "all";
  const showSplitButton = isDateView && !!onAssignDate && !readOnly;
  const canRemoveCurrentSelection = isDateView
    ? !!selectedOverride && !!onRemoveDateOverride && !readOnly
    : !readOnly;

  const formatConflictDates = (dates: string[]) =>
    dates.map((date) => {
      try {
        return format(parseISO(date), "MMM d");
      } catch {
        return date;
      }
    }).join(", ");

  return (
    <div
      className={cn(
        "rounded-lg border p-2 transition-colors",
        isEmpty
          ? "border-dashed border-muted-foreground/30 bg-muted/30"
          : hasConflicts
          ? "border-amber-500/35 bg-amber-500/[0.04]"
          : "border-border bg-card"
      )}
    >
      {isEmpty ? (
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
            <User className="h-4 w-4 text-muted-foreground" />
          </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-muted-foreground">{label}</p>
              <p className="text-xs text-muted-foreground/60">Empty</p>
            </div>
          {!readOnly && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-primary hover:bg-primary/10"
              onClick={onAdd}
            >
              <Plus className="h-4 w-4" />
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {hasWeekendSplit && (
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                className={cn(
                  "rounded-md border px-2 py-1 text-[10px] font-medium transition-colors",
                  selectedView === "all"
                    ? "border-primary/50 bg-primary/10 text-foreground"
                    : "border-border bg-background text-muted-foreground hover:bg-muted/50",
                )}
                onClick={() => setSelectedView("all")}
              >
                All
              </button>
              {scheduleDates.map((date, index) => {
                const hasOverride = !!dateOverrides[date];
                const hasDateConflict =
                  (dateOverrideConflictDates[date]?.length || 0) > 0 ||
                  (!hasOverride && conflictDates.includes(date));

                return (
                  <button
                    key={date}
                    type="button"
                    className={cn(
                      "rounded-md border px-2 py-1 text-[10px] font-medium transition-colors",
                      selectedView === date
                        ? "border-primary/50 bg-primary/10 text-foreground"
                        : "border-border bg-background text-muted-foreground hover:bg-muted/50",
                      hasOverride && "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
                      hasDateConflict && "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
                    )}
                    onClick={() => setSelectedView(date)}
                    title={format(parseISO(date), "MMM d")}
                  >
                    {`W${index + 1}`}
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8">
              <AvatarImage src={selectedAvatarUrl || undefined} alt={selectedMemberName} />
              <AvatarFallback className="bg-primary/10 text-primary text-xs">
                {selectedMemberName?.split(" ").map((n) => n[0]).join("").slice(0, 2)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-medium truncate">{selectedMemberName}</p>
                <div className="flex-1" />
                {hasConflicts && (
                  <Badge
                    variant="outline"
                    className="h-5 gap-1 border-amber-500/40 bg-amber-500/8 px-1.5 text-[10px] font-medium text-amber-700 dark:text-amber-300"
                    title={`Blackout conflict on ${formatConflictDates(selectedConflictDates)}`}
                  >
                    <AlertTriangle className="h-3 w-3" />
                    Conflict
                  </Badge>
                )}
                {ministryBadges.map((badge) => (
                  <span
                    key={badge!.value}
                    className={cn(
                      "text-[10px] font-medium px-1 py-0.5 rounded text-white flex-shrink-0",
                      badge!.color
                    )}
                    title={badge!.label}
                  >
                    {badge!.shortLabel}
                  </span>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {label}
                {isDateView && (
                  <span className="ml-1">
                    · {selectedOverride ? `Split for ${format(parseISO(selectedView), "MMM d")}` : format(parseISO(selectedView), "MMM d")}
                  </span>
                )}
              </p>
            </div>
            {!readOnly && onEditMinistry && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:bg-muted"
                onClick={onEditMinistry}
                title="Edit ministries"
              >
                <Edit2 className="h-3.5 w-3.5" />
              </Button>
            )}
            {showSplitButton && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-primary hover:bg-primary/10"
                onClick={() => onAssignDate?.(selectedView)}
              >
                <SplitSquareVertical className="mr-1 h-3.5 w-3.5" />
                {selectedOverride ? "Change" : "Split"}
              </Button>
            )}
            {canRemoveCurrentSelection && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:bg-destructive/10"
                onClick={() => {
                  if (isDateView && selectedOverride) {
                    onRemoveDateOverride?.(selectedView);
                    return;
                  }
                  onRemove();
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          {hasConflicts && (
            <div className="flex items-start gap-2 rounded-md bg-amber-500/8 px-2 py-1.5 text-[11px] text-amber-700/90 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-300" />
              <p className="leading-relaxed">
                <span className="font-medium text-amber-700 dark:text-amber-300">Blackout dates:</span>{" "}
                {formatConflictDates(selectedConflictDates)}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
