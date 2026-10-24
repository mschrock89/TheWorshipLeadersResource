import { useEffect, useMemo, useState, type ReactNode } from "react";
import { X, Plus, User, Edit2, AlertTriangle, SplitSquareVertical, Minus } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/cn";
import { MINISTRY_TYPES } from "@/lib/constants";
import {
  isBlankTeamBuilderAssignment,
  isBlankTeamBuilderMemberName,
} from "@/lib/teamBuilderBlankSlot";
import { TeamMemberAssignment } from "@/hooks/useTeamBuilder";
import { assignmentsAreSamePerson, WeekendServiceDay } from "@/lib/weekendPositionSplit";

type WeekendDayOverrides = Partial<Record<WeekendServiceDay, TeamMemberAssignment>>;

function WeekendSplitMenu({
  trigger,
  saturdayAction,
  sundayAction,
  bothAction,
  onSaturday,
  onSunday,
  onBoth,
  extraItems,
}: {
  trigger: ReactNode;
  saturdayAction: string;
  sundayAction: string;
  bothAction: string;
  onSaturday: () => void;
  onSunday: () => void;
  onBoth: () => void;
  extraItems?: ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onSelect={onSaturday}>{saturdayAction}</DropdownMenuItem>
        <DropdownMenuItem onSelect={onSunday}>{sundayAction}</DropdownMenuItem>
        <DropdownMenuItem onSelect={onBoth}>{bothAction}</DropdownMenuItem>
        {extraItems}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

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
  onLeaveBlank?: () => void;
  onAssignDate?: (scheduleDate: string, serviceDay?: WeekendServiceDay) => void;
  onLeaveBlankDate?: (scheduleDate: string, serviceDay?: WeekendServiceDay) => void;
  onRemoveDateOverride?: (scheduleDate: string, serviceDay?: WeekendServiceDay) => void;
  weekendServiceDays?: Record<string, { saturday?: string; sunday?: string }>;
  weekendDayOverrides?: Record<string, WeekendDayOverrides>;
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
  onLeaveBlank,
  onAssignDate,
  onLeaveBlankDate,
  onRemoveDateOverride,
  weekendServiceDays = {},
  weekendDayOverrides = {},
}: PositionSlotProps) {
  const [selectedView, setSelectedView] = useState<"all" | string>("all");
  const firstOverrideDate = useMemo(
    () =>
      scheduleDates.find((date) => !!dateOverrides[date] || !!weekendDayOverrides[date]) ||
      Object.keys(dateOverrides)[0] ||
      Object.keys(weekendDayOverrides)[0],
    [dateOverrides, scheduleDates, weekendDayOverrides],
  );
  const hasAnyDateOverrides = !!firstOverrideDate;
  const ministryBadges = showMinistryBadges
    ? ministryTypes.map((mt) => MINISTRY_TYPES.find((m) => m.value === mt)).filter(Boolean)
    : [];
  const hasWeekendSplit = scheduleDates.length > 0;
  const effectiveSelectedView =
    isEmpty && selectedView === "all" && firstOverrideDate ? firstOverrideDate : selectedView;

  useEffect(() => {
    if (selectedView !== "all" && !scheduleDates.includes(selectedView)) {
      setSelectedView("all");
    }
  }, [scheduleDates, selectedView]);

  useEffect(() => {
    if (isEmpty && selectedView === "all" && firstOverrideDate) {
      setSelectedView(firstOverrideDate);
    }
  }, [firstOverrideDate, isEmpty, selectedView]);

  const selectedOverride =
    effectiveSelectedView !== "all" ? dateOverrides[effectiveSelectedView] : undefined;
  const selectedDayOverrides =
    effectiveSelectedView !== "all" ? weekendDayOverrides[effectiveSelectedView] : undefined;
  const selectedWeekendDays =
    effectiveSelectedView !== "all" ? weekendServiceDays[effectiveSelectedView] : undefined;
  const canSplitSelectedWeekend = !!(selectedWeekendDays?.saturday && selectedWeekendDays?.sunday);
  const selectedOverrideIsBlank = isBlankTeamBuilderAssignment(selectedOverride);
  const baseAssignmentIsBlank = effectiveSelectedView === "all" && isBlankTeamBuilderMemberName(memberName);
  const selectedAssignmentIsBlank = selectedOverrideIsBlank || baseAssignmentIsBlank;
  const effectiveIsEmpty = isEmpty && !hasAnyDateOverrides;
  const dayAssignmentLabel = (
    day: WeekendServiceDay,
    fallbackName?: string,
  ) => {
    const dayOverride = selectedDayOverrides?.[day];
    if (dayOverride) {
      return isBlankTeamBuilderAssignment(dayOverride) ? "No one assigned" : dayOverride.member_name;
    }
    if (selectedOverride) {
      return selectedOverrideIsBlank ? "No one assigned" : selectedOverride.member_name;
    }
    return fallbackName || memberName || "Open";
  };
  const saturdayLabel = canSplitSelectedWeekend ? dayAssignmentLabel("saturday") : undefined;
  const sundayLabel = canSplitSelectedWeekend ? dayAssignmentLabel("sunday") : undefined;
  const weekendDaysDiffer = !!(
    canSplitSelectedWeekend &&
    !assignmentsAreSamePerson(
      selectedDayOverrides?.saturday || selectedOverride || { user_id: null, member_name: memberName },
      selectedDayOverrides?.sunday || selectedOverride || { user_id: null, member_name: memberName },
    )
  );
  const selectedMemberName = selectedAssignmentIsBlank
    ? "No one assigned"
    : weekendDaysDiffer
      ? `${saturdayLabel} / ${sundayLabel}`
      : selectedOverride?.member_name || memberName;
  const selectedAvatarUrl = selectedOverride && !selectedOverrideIsBlank ? null : avatarUrl;
  const selectedConflictDates = useMemo(() => {
    if (effectiveSelectedView === "all") {
      return conflictDates;
    }

    if (selectedOverride) {
      return dateOverrideConflictDates[effectiveSelectedView] || [];
    }

    return conflictDates.includes(effectiveSelectedView) ? [effectiveSelectedView] : [];
  }, [conflictDates, dateOverrideConflictDates, effectiveSelectedView, selectedOverride]);

  const hasConflicts = selectedConflictDates.length > 0;
  const isDateView = effectiveSelectedView !== "all";
  const showSplitButton = isDateView && !!onAssignDate && !readOnly;
  const showBlankButton = isDateView && !!onLeaveBlankDate && !readOnly && !selectedOverrideIsBlank;
  const showFullBlankButton = !isDateView && !effectiveIsEmpty && !!onLeaveBlank && !readOnly && !baseAssignmentIsBlank;
  const hasSelectedDayOverride = !!(selectedDayOverrides?.saturday || selectedDayOverrides?.sunday);
  const canRemoveCurrentSelection = isDateView
    ? (!!selectedOverride || hasSelectedDayOverride) && !!onRemoveDateOverride && !readOnly
    : !readOnly;
  const canSplitWeekendDays = (date: string) => {
    const days = weekendServiceDays[date];
    return !!(days?.saturday && days?.sunday);
  };

  const formatConflictDates = (dates: string[]) =>
    dates.map((date) => {
      try {
        return format(parseISO(date), "MMM d");
      } catch {
        return date;
      }
    }).join(", ");

  const weekChipClass = (active: boolean, hasOverride = false, hasDateConflict = false) =>
    cn(
      "rounded px-2 py-1 text-[10px] font-medium transition-colors",
      active
        ? "bg-primary/15 text-foreground"
        : "bg-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground",
      hasOverride && !hasDateConflict && !active && "text-sky-600 dark:text-sky-300",
      hasOverride && !hasDateConflict && active && "bg-sky-500/15 text-sky-700 dark:text-sky-300",
      hasDateConflict && !active && "text-amber-600 dark:text-amber-300",
      hasDateConflict && active && "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    );

  return (
    <div
      className={cn(
        "py-2.5 transition-colors",
        hasConflicts && "bg-amber-500/[0.04]",
        (effectiveIsEmpty || selectedAssignmentIsBlank) && "opacity-80",
      )}
    >
      {effectiveIsEmpty ? (
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted/60">
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
                title="Assign for the full rotation"
              >
                <Plus className="h-4 w-4" />
              </Button>
            )}
          </div>

          {hasWeekendSplit && !readOnly && onAssignDate && (
            <div className="flex flex-wrap gap-1">
              {scheduleDates.map((date, index) => {
                const weekLabel = `W${index + 1}`;
                const dateLabel = format(parseISO(date), "MMM d");
                if (canSplitWeekendDays(date)) {
                  return (
                    <WeekendSplitMenu
                      key={date}
                      trigger={
                        <button
                          type="button"
                          className={cn(weekChipClass(false), "inline-flex items-center")}
                          title={`Assign ${dateLabel} for Saturday, Sunday, or both`}
                        >
                          <Plus className="mr-1 h-3 w-3" />
                          {weekLabel}
                        </button>
                      }
                      saturdayAction="Saturday"
                      sundayAction="Sunday"
                      bothAction="Both days"
                      onSaturday={() => onAssignDate(date, "saturday")}
                      onSunday={() => onAssignDate(date, "sunday")}
                      onBoth={() => onAssignDate(date)}
                    />
                  );
                }

                return (
                  <button
                    key={date}
                    type="button"
                    className={cn(weekChipClass(false), "inline-flex items-center")}
                    onClick={() => onAssignDate(date)}
                    title={`Assign only for ${dateLabel}`}
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    {weekLabel}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {hasWeekendSplit && (
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                className={weekChipClass(effectiveSelectedView === "all")}
                onClick={() => setSelectedView("all")}
              >
                All
              </button>
              {scheduleDates.map((date, index) => {
                const hasOverride = !!dateOverrides[date] || !!weekendDayOverrides[date];
                const hasDateConflict =
                  (dateOverrideConflictDates[date]?.length || 0) > 0 ||
                  (!hasOverride && conflictDates.includes(date));
                const daySplit = weekendDayOverrides[date];
                const daysDiffer = !!(
                  canSplitWeekendDays(date) &&
                  daySplit &&
                  !assignmentsAreSamePerson(daySplit.saturday, daySplit.sunday) &&
                  (daySplit.saturday || daySplit.sunday)
                );

                return (
                  <button
                    key={date}
                    type="button"
                    className={weekChipClass(
                      effectiveSelectedView === date,
                      hasOverride,
                      hasDateConflict,
                    )}
                    onClick={() => setSelectedView(date)}
                    title={
                      daysDiffer
                        ? `Saturday and Sunday are split · ${format(parseISO(date), "MMM d")}`
                        : format(parseISO(date), "MMM d")
                    }
                  >
                    {`W${index + 1}`}
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex items-center gap-3">
            {selectedAssignmentIsBlank ? (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted/60">
                <User className="h-4 w-4 text-muted-foreground" />
              </div>
            ) : (
              <Avatar className="h-8 w-8">
                <AvatarImage src={selectedAvatarUrl || undefined} alt={selectedMemberName} />
                <AvatarFallback className="bg-primary/10 text-primary text-xs">
                  {selectedMemberName?.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                </AvatarFallback>
              </Avatar>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p
                  className={cn(
                    "truncate text-sm font-medium",
                    selectedAssignmentIsBlank && "text-muted-foreground",
                  )}
                >
                  {selectedMemberName}
                </p>
                <div className="flex-1" />
                {hasConflicts && (
                  <span
                    className="inline-flex h-5 items-center gap-1 text-[10px] font-medium text-amber-700 dark:text-amber-300"
                    title={`Blackout conflict on ${formatConflictDates(selectedConflictDates)}`}
                  >
                    <AlertTriangle className="h-3 w-3" />
                    Conflict
                  </span>
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
                    · {weekendDaysDiffer
                      ? `Sat / Sun · ${format(parseISO(effectiveSelectedView), "MMM d")}`
                      : selectedOverrideIsBlank
                      ? `Blank for ${format(parseISO(effectiveSelectedView), "MMM d")}`
                      : selectedOverride
                      ? `Split for ${format(parseISO(effectiveSelectedView), "MMM d")}`
                      : format(parseISO(effectiveSelectedView), "MMM d")}
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
            {showFullBlankButton && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground hover:bg-muted"
                onClick={onLeaveBlank}
                title={`Leave ${label} blank for the full rotation`}
              >
                <Minus className="mr-1 h-3.5 w-3.5" />
                Blank
              </Button>
            )}
            {showSplitButton && canSplitSelectedWeekend && (
              <WeekendSplitMenu
                trigger={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-primary hover:bg-primary/10"
                  >
                    <SplitSquareVertical className="mr-1 h-3.5 w-3.5" />
                    Split
                  </Button>
                }
                saturdayAction={selectedDayOverrides?.saturday ? "Change Saturday" : "Saturday"}
                sundayAction={selectedDayOverrides?.sunday ? "Change Sunday" : "Sunday"}
                bothAction={selectedOverride ? "Change both days" : "Both days"}
                onSaturday={() => onAssignDate?.(effectiveSelectedView, "saturday")}
                onSunday={() => onAssignDate?.(effectiveSelectedView, "sunday")}
                onBoth={() => onAssignDate?.(effectiveSelectedView)}
                extraItems={
                  <>
                    {(selectedDayOverrides?.saturday || selectedDayOverrides?.sunday) && <DropdownMenuSeparator />}
                    {selectedDayOverrides?.saturday && onRemoveDateOverride && (
                      <DropdownMenuItem onSelect={() => onRemoveDateOverride(effectiveSelectedView, "saturday")}>
                        Clear Saturday
                      </DropdownMenuItem>
                    )}
                    {selectedDayOverrides?.sunday && onRemoveDateOverride && (
                      <DropdownMenuItem onSelect={() => onRemoveDateOverride(effectiveSelectedView, "sunday")}>
                        Clear Sunday
                      </DropdownMenuItem>
                    )}
                    {onLeaveBlankDate && !selectedOverrideIsBlank && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => onLeaveBlankDate(effectiveSelectedView, "saturday")}>
                          Leave Saturday open
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => onLeaveBlankDate(effectiveSelectedView, "sunday")}>
                          Leave Sunday open
                        </DropdownMenuItem>
                      </>
                    )}
                  </>
                }
              />
            )}
            {showSplitButton && !canSplitSelectedWeekend && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-primary hover:bg-primary/10"
                onClick={() => onAssignDate?.(effectiveSelectedView)}
              >
                <SplitSquareVertical className="mr-1 h-3.5 w-3.5" />
                {selectedOverrideIsBlank ? "Assign" : selectedOverride ? "Change" : "Split"}
              </Button>
            )}
            {showBlankButton && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground hover:bg-muted"
                onClick={() => onLeaveBlankDate?.(effectiveSelectedView)}
                title={`Leave ${label} blank for ${format(parseISO(effectiveSelectedView), "MMM d")}`}
              >
                <Minus className="mr-1 h-3.5 w-3.5" />
                Blank
              </Button>
            )}
            {canRemoveCurrentSelection && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:bg-destructive/10"
                title={
                  isDateView && (selectedOverride || hasSelectedDayOverride)
                    ? "Remove weekend split"
                    : "Remove assignment"
                }
                onClick={() => {
                  if (isDateView && (selectedOverride || hasSelectedDayOverride)) {
                    onRemoveDateOverride?.(effectiveSelectedView);
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
            <div className="flex items-start gap-2 pl-11 text-[11px] text-amber-700/90 dark:text-amber-200">
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
