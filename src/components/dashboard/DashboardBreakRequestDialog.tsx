import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { RotationPeriod, useCreateBreakRequest, useRotationPeriodsForUser } from "@/hooks/useBreakRequests";
import { useAuth } from "@/hooks/useAuth";
import { useUserCampuses } from "@/hooks/useCampuses";
import { useUserCampusMinistryPositions } from "@/hooks/useCampusMinistryPositions";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { addDays, format, getDay, isAfter, isBefore, isWithinInterval, startOfDay, subDays } from "date-fns";

interface DashboardBreakRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMode?: "break" | "blackout";
}

const REQUEST_TYPES = [
  { value: "need_break", label: "I need a break" },
  { value: "willing_break", label: "Willing to take a break if you need it" },
];

const TRIMESTERS = [
  { value: "1", label: "Trimester 1" },
  { value: "2", label: "Trimester 2" },
  { value: "3", label: "Trimester 3" },
];

const MINISTRY_LABELS: Record<string, string> = {
  weekend: "Weekend Worship",
  weekend_team: "Weekend Worship",
  student: "Student",
  encounter: "Encounter",
  eon: "EON",
};

export function DashboardBreakRequestDialog({
  open,
  onOpenChange,
  initialMode = "break",
}: DashboardBreakRequestDialogProps) {
  const { user } = useAuth();
  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear + 1];

  const [requestType, setRequestType] = useState<string>("need_break");
  const [campusId, setCampusId] = useState<string>("");
  const [ministryType, setMinistryType] = useState<string>("");
  const [trimester, setTrimester] = useState<string>("");
  const [year, setYear] = useState<string>(currentYear.toString());
  const [requestScope, setRequestScope] = useState<string>(
    initialMode === "blackout" ? "blackout_dates" : "full_trimester"
  );
  const [blackoutDates, setBlackoutDates] = useState<Date[]>([]);
  const [reason, setReason] = useState("");

  // Fetch user's campuses
  const { data: userCampuses = [], isLoading: campusesLoading } = useUserCampuses(user?.id);

  // Fetch user's ministry positions to determine available ministries
  const { data: ministryPositions = [], isLoading: ministriesLoading } = useUserCampusMinistryPositions(user?.id);

  // Get unique ministries for selected campus
  const availableMinistries = useMemo(() => {
    if (!campusId) return [];
    const normalizedMinistries = new Set<string>();
    ministryPositions
      .filter((p) => p.campus_id === campusId)
      .forEach((p) => {
        const normalizedMinistry =
          p.ministry_type === "weekend" ? "weekend_team" : p.ministry_type;
        normalizedMinistries.add(normalizedMinistry);
      });
    return Array.from(normalizedMinistries);
  }, [ministryPositions, campusId]);

  const { data: rotationPeriods = [], isLoading: periodsLoading } =
    useRotationPeriodsForUser();

  const createBreakRequest = useCreateBreakRequest();
  const isBlackoutMode = requestType === "need_break" && requestScope === "blackout_dates";

  useEffect(() => {
    if (!open) return;

    setRequestType("need_break");
    setRequestScope(initialMode === "blackout" ? "blackout_dates" : "full_trimester");
    setBlackoutDates([]);
    setReason("");
  }, [initialMode, open]);

  useEffect(() => {
    if (initialMode !== "blackout" && requestType === "need_break" && requestScope !== "full_trimester") {
      setRequestScope("full_trimester");
      setBlackoutDates([]);
    }
  }, [initialMode, requestType, requestScope]);

  // Find matching rotation period based on selected campus, trimester, and year
  const matchingPeriod = useMemo(() => {
    if (!campusId || !trimester || !year) return null;
    return rotationPeriods.find(
      (p) =>
        p.campus_id === campusId &&
        p.trimester === parseInt(trimester) &&
        p.year === parseInt(year)
    );
  }, [rotationPeriods, campusId, trimester, year]);

  const campusRotationPeriods = useMemo(
    () => rotationPeriods.filter((period) => period.campus_id === campusId),
    [rotationPeriods, campusId]
  );

  const periodForDate = useCallback((date: Date): RotationPeriod | null =>
    campusRotationPeriods.find((period) =>
      isWithinInterval(startOfDay(date), {
        start: startOfDay(new Date(period.start_date)),
        end: startOfDay(new Date(period.end_date)),
      })
    ) || null,
  [campusRotationPeriods]);

  const blackoutMatchingPeriod = useMemo(() => {
    if (!campusId || blackoutDates.length === 0) return null;

    const matchedPeriods = blackoutDates
      .map((date) => periodForDate(date))
      .filter((period): period is RotationPeriod => Boolean(period));

    if (matchedPeriods.length !== blackoutDates.length) {
      return null;
    }

    const uniqueIds = new Set(matchedPeriods.map((period) => period.id));
    return uniqueIds.size === 1 ? matchedPeriods[0] : null;
  }, [blackoutDates, campusId, periodForDate]);

  const selectedPeriod = isBlackoutMode ? blackoutMatchingPeriod : matchingPeriod;

  // Reset ministry when campus changes
  const handleCampusChange = (value: string) => {
    setCampusId(value);
    setMinistryType("");
    setBlackoutDates([]);
  };

  const handleRequestScopeChange = (value: string) => {
    setRequestScope(value);
    if (value !== "blackout_dates") {
      setBlackoutDates([]);
    }
  };

  const calendarStartPeriod = useMemo(() => {
    if (!campusRotationPeriods.length) return null;
    const today = startOfDay(new Date());
    return (
      campusRotationPeriods.find((period) =>
        isAfter(startOfDay(new Date(period.end_date)), subDays(today, 1))
      ) || campusRotationPeriods[0]
    );
  }, [campusRotationPeriods]);

  const periodStart = selectedPeriod ? startOfDay(new Date(selectedPeriod.start_date)) : null;
  const periodEnd = selectedPeriod ? startOfDay(new Date(selectedPeriod.end_date)) : null;

  const getDateKey = (date: Date) => format(startOfDay(date), "yyyy-MM-dd");

  const disabledBlackoutDay = (date: Date) => {
    const day = startOfDay(date);
    const isWeekendDay = [0, 6].includes(getDay(day));

    if (!isWeekendDay || !campusId || campusRotationPeriods.length === 0) {
      return true;
    }

    return !campusRotationPeriods.some((period) =>
      isWithinInterval(day, {
        start: startOfDay(new Date(period.start_date)),
        end: startOfDay(new Date(period.end_date)),
      })
    );
  };

  const getWeekendDates = (date: Date) => {
    const day = startOfDay(date);
    const saturday = getDay(day) === 6 ? day : subDays(day, 1);
    const sunday = addDays(saturday, 1);

    return [saturday, sunday].filter((weekendDate) => !disabledBlackoutDay(weekendDate));
  };

  const handleBlackoutSelect = (_dates: Date[] | undefined, selectedDay: Date) => {
    const weekendDates = getWeekendDates(selectedDay);
    if (!weekendDates.length) return;

    setBlackoutDates((currentDates) => {
      const currentKeys = new Set(currentDates.map(getDateKey));
      const weekendKeys = weekendDates.map(getDateKey);
      const allSelected = weekendKeys.every((key) => currentKeys.has(key));

      if (allSelected) {
        return currentDates.filter((date) => !weekendKeys.includes(getDateKey(date)));
      }

      const mergedDates = [...currentDates];
      weekendDates.forEach((weekendDate) => {
        if (!currentKeys.has(getDateKey(weekendDate))) {
          mergedDates.push(weekendDate);
        }
      });

      return mergedDates
        .slice()
        .sort((a, b) => a.getTime() - b.getTime());
    });
  };

  const groupedBlackoutWeekends = blackoutDates
    .slice()
    .sort((a, b) => a.getTime() - b.getTime())
    .reduce<Array<{ key: string; saturday: Date | null; sunday: Date | null }>>((groups, date) => {
      const day = startOfDay(date);
      const saturday = getDay(day) === 6 ? day : subDays(day, 1);
      const key = getDateKey(saturday);
      const existingGroup = groups.find((group) => group.key === key);

      if (existingGroup) {
        if (getDay(day) === 6) {
          existingGroup.saturday = day;
        } else {
          existingGroup.sunday = day;
        }
        return groups;
      }

      groups.push({
        key,
        saturday: getDay(day) === 6 ? day : null,
        sunday: getDay(day) === 0 ? day : null,
      });
      return groups;
    }, []);

  const handleSubmit = async () => {
    if (!selectedPeriod) return;

    await createBreakRequest.mutateAsync({
      rotationPeriodId: selectedPeriod.id,
      reason: reason || undefined,
      requestType: requestType as "need_break" | "willing_break",
      requestScope: requestType === "need_break"
        ? (requestScope as "full_trimester" | "blackout_dates")
        : "full_trimester",
      blackoutDates:
        requestType === "need_break" && requestScope === "blackout_dates"
          ? blackoutDates.map((date) => format(date, "yyyy-MM-dd"))
          : undefined,
      ministryType: ministryType || undefined,
    });

    // Reset form and close dialog
    setRequestType("need_break");
    setCampusId("");
    setMinistryType("");
    setTrimester("");
    setYear(currentYear.toString());
    setRequestScope("full_trimester");
    setBlackoutDates([]);
    setReason("");
    onOpenChange(false);
  };

  const canSubmit =
    requestType &&
    campusId &&
    ministryType &&
    (isBlackoutMode || (trimester && year)) &&
    selectedPeriod &&
    (requestType !== "need_break" ||
      requestScope !== "blackout_dates" ||
      blackoutDates.length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {initialMode === "blackout" ? "Add Blackout Dates" : "Request a Break"}
          </DialogTitle>
          <DialogDescription>
            {initialMode === "blackout"
              ? "Add one or more dates when you already know you cannot serve."
              : "Let your team know if you need time off or are willing to step back if needed."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Request Type */}
          {initialMode === "blackout" ? (
            <div className="space-y-3">
              <Label>Request Type</Label>
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm font-medium">
                Blackout
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="request-type">Request Type</Label>
                <Select value={requestType} onValueChange={setRequestType}>
                  <SelectTrigger id="request-type">
                    <SelectValue placeholder="Select request type" />
                  </SelectTrigger>
                  <SelectContent>
                    {REQUEST_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

            </>
          )}

          {/* Campus */}
          <div className="space-y-2">
            <Label htmlFor="campus">Campus</Label>
            <Select value={campusId} onValueChange={handleCampusChange}>
              <SelectTrigger id="campus">
                <SelectValue placeholder={campusesLoading ? "Loading..." : "Select campus"} />
              </SelectTrigger>
              <SelectContent>
                {userCampuses.map((uc) => (
                  <SelectItem key={uc.campus_id} value={uc.campus_id}>
                    {uc.campuses?.name || "Unknown Campus"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Ministry */}
          <div className="space-y-2">
            <Label htmlFor="ministry">Ministry</Label>
            <Select value={ministryType} onValueChange={setMinistryType} disabled={!campusId}>
              <SelectTrigger id="ministry">
                <SelectValue
                  placeholder={
                    !campusId
                      ? "Select campus first"
                      : ministriesLoading
                        ? "Loading ministries..."
                        : "Select ministry"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {availableMinistries.map((m) => (
                  <SelectItem key={m} value={m}>
                    {MINISTRY_LABELS[m] || m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!isBlackoutMode && (
            <>
              <div className="space-y-2">
                <Label htmlFor="trimester">Trimester</Label>
                <Select value={trimester} onValueChange={setTrimester}>
                  <SelectTrigger id="trimester">
                    <SelectValue placeholder="Select trimester" />
                  </SelectTrigger>
                  <SelectContent>
                    {TRIMESTERS.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="year">Year</Label>
                <Select value={year} onValueChange={setYear}>
                  <SelectTrigger id="year">
                    <SelectValue placeholder="Select year" />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map((y) => (
                      <SelectItem key={y} value={y.toString()}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {!isBlackoutMode && campusId && trimester && year && !periodsLoading && !matchingPeriod && (
            <p className="text-sm text-destructive">
              No rotation period found for Trimester {trimester}, {year} at this
              campus.
            </p>
          )}

          {isBlackoutMode && campusId && !periodsLoading && campusRotationPeriods.length === 0 && (
            <p className="text-sm text-destructive">
              No rotation periods are available for this campus yet.
            </p>
          )}

          {isBlackoutMode && blackoutDates.length > 0 && !blackoutMatchingPeriod && (
            <p className="text-sm text-destructive">
              Please choose blackout dates from the same trimester.
            </p>
          )}

          {requestType === "need_break" && requestScope === "blackout_dates" && campusId && campusRotationPeriods.length > 0 && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Select blackout weekends</Label>
                <p className="text-sm text-muted-foreground">
                  Pick the weekends you already know you cannot serve. Only Saturdays
                  and Sundays in this trimester can be selected.
                </p>
              </div>
              <div className="rounded-lg border">
                <Calendar
                  className="mx-auto w-fit"
                  classNames={{
                    months: "flex justify-center",
                    month: "space-y-4",
                    table: "mx-auto border-collapse",
                    head_row: "grid grid-cols-7 gap-1",
                    row: "mt-2 grid grid-cols-7 gap-1",
                  }}
                  mode="multiple"
                  selected={blackoutDates}
                  onSelect={handleBlackoutSelect}
                  disabled={disabledBlackoutDay}
                  defaultMonth={blackoutDates[0] ?? (calendarStartPeriod ? new Date(calendarStartPeriod.start_date) : undefined)}
                  numberOfMonths={1}
                />
              </div>
              {blackoutDates.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {groupedBlackoutWeekends.map((weekend) => (
                    <Badge key={weekend.key} variant="secondary">
                      {weekend.saturday && weekend.sunday
                        ? `${format(weekend.saturday, "MMM d")} - ${format(weekend.sunday, "MMM d")}`
                        : format(weekend.saturday || weekend.sunday!, "EEE, MMM d")}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Reason (optional) */}
          <div className="space-y-2">
            <Label htmlFor="reason">Reason (optional)</Label>
            <Textarea
              id="reason"
              placeholder={
                requestType === "need_break" && requestScope === "blackout_dates"
                  ? "Optional note about these blackout weekends..."
                  : "Any additional notes..."
              }
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Exit
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || createBreakRequest.isPending}
          >
            {createBreakRequest.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
