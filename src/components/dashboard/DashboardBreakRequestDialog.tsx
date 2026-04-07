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
import { format, isAfter, isWithinInterval, startOfDay, subDays } from "date-fns";
import { getMinistryLabel, normalizeWeekendWorshipMinistryType } from "@/lib/constants";

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

const NETWORK_WIDE_CAMPUS_ID = "network-wide";

export function DashboardBreakRequestDialog({
  open,
  onOpenChange,
  initialMode = "break",
}: DashboardBreakRequestDialogProps) {
  const { user } = useAuth();
  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear + 1];
  const isBlackoutDialog = initialMode === "blackout";

  const [requestType, setRequestType] = useState<string>("need_break");
  const [campusId, setCampusId] = useState<string>(isBlackoutDialog ? NETWORK_WIDE_CAMPUS_ID : "");
  const [ministryType, setMinistryType] = useState<string>("");
  const [trimester, setTrimester] = useState<string>("");
  const [year, setYear] = useState<string>(currentYear.toString());
  const [requestScope, setRequestScope] = useState<string>(
    isBlackoutDialog ? "blackout_dates" : "full_trimester"
  );
  const [blackoutDates, setBlackoutDates] = useState<Date[]>([]);
  const [reason, setReason] = useState("");

  const { data: userCampuses = [], isLoading: campusesLoading } = useUserCampuses(user?.id);
  const { data: ministryPositions = [], isLoading: ministriesLoading } = useUserCampusMinistryPositions(user?.id);
  const { data: rotationPeriods = [], isLoading: periodsLoading } = useRotationPeriodsForUser();

  const createBreakRequest = useCreateBreakRequest();
  const isBlackoutMode = requestType === "need_break" && requestScope === "blackout_dates";
  const normalizedCampusId = campusId === NETWORK_WIDE_CAMPUS_ID ? null : campusId || null;

  const availableMinistries = useMemo(() => {
    if (!campusId) return [];
    const normalizedMinistries = new Set<string>();
    ministryPositions
      .filter((p) => campusId === NETWORK_WIDE_CAMPUS_ID || p.campus_id === campusId)
      .forEach((p) => {
        const normalizedMinistry = normalizeWeekendWorshipMinistryType(p.ministry_type);
        if (normalizedMinistry) {
          normalizedMinistries.add(normalizedMinistry);
        }
      });
    return Array.from(normalizedMinistries);
  }, [campusId, ministryPositions]);

  useEffect(() => {
    if (!open) return;

    setRequestType("need_break");
    setCampusId(isBlackoutDialog ? NETWORK_WIDE_CAMPUS_ID : "");
    setMinistryType("");
    setTrimester("");
    setYear(currentYear.toString());
    setRequestScope(isBlackoutDialog ? "blackout_dates" : "full_trimester");
    setBlackoutDates([]);
    setReason("");
  }, [currentYear, isBlackoutDialog, open]);

  useEffect(() => {
    if (!isBlackoutDialog && requestType === "need_break" && requestScope !== "full_trimester") {
      setRequestScope("full_trimester");
      setBlackoutDates([]);
    }
  }, [isBlackoutDialog, requestScope, requestType]);

  const matchingPeriod = useMemo(() => {
    if (!campusId || !trimester || !year) return null;
    return rotationPeriods.find(
      (period) =>
        period.campus_id === normalizedCampusId &&
        period.trimester === parseInt(trimester) &&
        period.year === parseInt(year)
    ) || null;
  }, [campusId, normalizedCampusId, rotationPeriods, trimester, year]);

  const campusRotationPeriods = useMemo(
    () => rotationPeriods.filter((period) => period.campus_id === normalizedCampusId),
    [normalizedCampusId, rotationPeriods]
  );

  const periodForDate = useCallback((date: Date): RotationPeriod | null =>
    campusRotationPeriods.find((period) =>
      isWithinInterval(startOfDay(date), {
        start: startOfDay(new Date(period.start_date)),
        end: startOfDay(new Date(period.end_date)),
      })
    ) || null,
  [campusRotationPeriods]);

  const blackoutPeriodGroups = useMemo(() => {
    if (!isBlackoutMode || blackoutDates.length === 0) return [];

    const grouped = blackoutDates.reduce<Record<string, string[]>>((acc, date) => {
      const period = periodForDate(date);
      if (!period) return acc;

      const dateKey = format(startOfDay(date), "yyyy-MM-dd");
      if (!acc[period.id]) {
        acc[period.id] = [];
      }
      if (!acc[period.id].includes(dateKey)) {
        acc[period.id].push(dateKey);
      }
      return acc;
    }, {});

    return Object.entries(grouped).map(([rotationPeriodId, dates]) => ({
      rotationPeriodId,
      blackoutDates: dates.sort(),
    }));
  }, [blackoutDates, isBlackoutMode, periodForDate]);

  const handleCampusChange = (value: string) => {
    setCampusId(value);
    setMinistryType("");
    setBlackoutDates([]);
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

  const getDateKey = (date: Date) => format(startOfDay(date), "yyyy-MM-dd");

  const disabledBlackoutDay = (date: Date) => {
    const day = startOfDay(date);

    if (!campusId || campusRotationPeriods.length === 0) {
      return true;
    }

    return !campusRotationPeriods.some((period) =>
      isWithinInterval(day, {
        start: startOfDay(new Date(period.start_date)),
        end: startOfDay(new Date(period.end_date)),
      })
    );
  };

  const handleBlackoutSelect = (_dates: Date[] | undefined, selectedDay: Date) => {
    const day = startOfDay(selectedDay);
    if (disabledBlackoutDay(day)) return;

    setBlackoutDates((currentDates) => {
      const currentKeys = new Set(currentDates.map(getDateKey));
      const dayKey = getDateKey(day);

      if (currentKeys.has(dayKey)) {
        return currentDates.filter((date) => getDateKey(date) !== dayKey);
      }

      return [...currentDates, day].sort((a, b) => a.getTime() - b.getTime());
    });
  };

  const groupedBlackoutDates = blackoutDates
    .slice()
    .sort((a, b) => a.getTime() - b.getTime())
    .map((date) => ({ key: getDateKey(date), date }));

  const handleSubmit = async () => {
    if (isBlackoutMode && blackoutPeriodGroups.length === 0) return;
    if (!isBlackoutMode && !matchingPeriod) return;

    await createBreakRequest.mutateAsync({
      rotationPeriodId: isBlackoutMode ? blackoutPeriodGroups[0].rotationPeriodId : matchingPeriod!.id,
      reason: reason || undefined,
      requestType: requestType as "need_break" | "willing_break",
      requestScope: requestType === "need_break"
        ? (requestScope as "full_trimester" | "blackout_dates")
        : "full_trimester",
      blackoutDates:
        requestType === "need_break" && requestScope === "blackout_dates"
          ? blackoutDates.map((date) => format(date, "yyyy-MM-dd"))
          : undefined,
      ministryType: isBlackoutDialog ? undefined : ministryType || undefined,
      blackoutPeriodGroups: isBlackoutMode ? blackoutPeriodGroups : undefined,
    });

    setRequestType("need_break");
    setCampusId(isBlackoutDialog ? NETWORK_WIDE_CAMPUS_ID : "");
    setMinistryType("");
    setTrimester("");
    setYear(currentYear.toString());
    setRequestScope(isBlackoutDialog ? "blackout_dates" : "full_trimester");
    setBlackoutDates([]);
    setReason("");
    onOpenChange(false);
  };

  const canSubmit =
    requestType &&
    (isBlackoutDialog || (campusId && ministryType)) &&
    (isBlackoutMode || (trimester && year)) &&
    (isBlackoutMode ? blackoutPeriodGroups.length > 0 : matchingPeriod) &&
    (requestType !== "need_break" ||
      requestScope !== "blackout_dates" ||
      blackoutDates.length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isBlackoutDialog ? "Add Blackout Dates" : "Request a Break"}
          </DialogTitle>
          <DialogDescription>
            {isBlackoutDialog
              ? "Add dates when you already know you cannot serve. These blackout dates will apply across campuses and ministries."
              : "Let your team know if you need time off or are willing to step back if needed."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {isBlackoutDialog ? (
            <div className="space-y-3">
              <Label>Request Type</Label>
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm font-medium">
                Blackout
              </div>
            </div>
          ) : (
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
          )}

          {!isBlackoutDialog && (
            <>
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
                    {availableMinistries.map((ministry) => (
                      <SelectItem key={ministry} value={ministry}>
                        {getMinistryLabel(ministry)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {!isBlackoutMode && campusId && trimester && year && !periodsLoading && !matchingPeriod && (
            <p className="text-sm text-destructive">
              No rotation period found for Trimester {trimester}, {year} at this campus.
            </p>
          )}

          {isBlackoutMode && !periodsLoading && campusRotationPeriods.length === 0 && (
            <p className="text-sm text-destructive">
              No blackout-date ranges are available yet.
            </p>
          )}

          {!isBlackoutMode && (
            <>
              <div className="space-y-2">
                <Label htmlFor="trimester">Trimester</Label>
                <Select value={trimester} onValueChange={setTrimester}>
                  <SelectTrigger id="trimester">
                    <SelectValue placeholder="Select trimester" />
                  </SelectTrigger>
                  <SelectContent>
                    {TRIMESTERS.map((trimesterOption) => (
                      <SelectItem key={trimesterOption.value} value={trimesterOption.value}>
                        {trimesterOption.label}
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
                    {years.map((yearOption) => (
                      <SelectItem key={yearOption} value={yearOption.toString()}>
                        {yearOption}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {isBlackoutMode && campusRotationPeriods.length > 0 && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Select blackout dates</Label>
                <p className="text-sm text-muted-foreground">
                  Pick any dates you already know you cannot serve. These will
                  apply across campuses and ministries.
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
                  {groupedBlackoutDates.map((entry) => (
                    <Badge key={entry.key} variant="secondary">
                      {format(entry.date, "EEE, MMM d")}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="reason">Reason (optional)</Label>
            <Textarea
              id="reason"
              placeholder={
                isBlackoutMode
                  ? "Optional note about these blackout dates..."
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
