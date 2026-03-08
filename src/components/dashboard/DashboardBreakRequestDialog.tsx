import { useState, useMemo } from "react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Calendar } from "@/components/ui/calendar";
import { useCreateBreakRequest, useRotationPeriodsForUser } from "@/hooks/useBreakRequests";
import { useAuth } from "@/hooks/useAuth";
import { useUserCampuses } from "@/hooks/useCampuses";
import { useUserCampusMinistryPositions } from "@/hooks/useCampusMinistryPositions";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { format, getDay, isAfter, isBefore, startOfDay } from "date-fns";

interface DashboardBreakRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const REQUEST_TYPES = [
  { value: "need_break", label: "I need a break" },
  { value: "willing_break", label: "Willing to take a break if you need it" },
];

const REQUEST_SCOPES = [
  {
    value: "full_trimester",
    label: "Entire trimester",
    description: "Ask to step out for the full trimester rotation.",
  },
  {
    value: "blackout_dates",
    label: "Specific weekends",
    description: "Mark weekend dates when you already have a prior commitment.",
  },
];

const TRIMESTERS = [
  { value: "1", label: "Trimester 1" },
  { value: "2", label: "Trimester 2" },
  { value: "3", label: "Trimester 3" },
];

const MINISTRY_LABELS: Record<string, string> = {
  weekend: "Weekend",
  student: "Student",
  encounter: "Encounter",
  eon: "EON",
};

export function DashboardBreakRequestDialog({
  open,
  onOpenChange,
}: DashboardBreakRequestDialogProps) {
  const { user } = useAuth();
  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear + 1];

  const [requestType, setRequestType] = useState<string>("need_break");
  const [campusId, setCampusId] = useState<string>("");
  const [ministryType, setMinistryType] = useState<string>("");
  const [trimester, setTrimester] = useState<string>("");
  const [year, setYear] = useState<string>(currentYear.toString());
  const [requestScope, setRequestScope] = useState<string>("full_trimester");
  const [blackoutDates, setBlackoutDates] = useState<Date[]>([]);
  const [reason, setReason] = useState("");

  // Fetch user's campuses
  const { data: userCampuses = [], isLoading: campusesLoading } = useUserCampuses(user?.id);

  // Fetch user's ministry positions to determine available ministries
  const { data: ministryPositions = [], isLoading: ministriesLoading } = useUserCampusMinistryPositions(user?.id);

  // Get unique ministries for selected campus
  const availableMinistries = useMemo(() => {
    if (!campusId) return [];
    const ministries = new Set<string>();
    ministryPositions
      .filter((p) => p.campus_id === campusId)
      .forEach((p) => ministries.add(p.ministry_type));
    return Array.from(ministries);
  }, [ministryPositions, campusId]);

  const { data: rotationPeriods = [], isLoading: periodsLoading } =
    useRotationPeriodsForUser();

  const createBreakRequest = useCreateBreakRequest();

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

  // Reset ministry when campus changes
  const handleCampusChange = (value: string) => {
    setCampusId(value);
    setMinistryType("");
  };

  const handleRequestScopeChange = (value: string) => {
    setRequestScope(value);
    if (value !== "blackout_dates") {
      setBlackoutDates([]);
    }
  };

  const periodStart = matchingPeriod ? startOfDay(new Date(matchingPeriod.start_date)) : null;
  const periodEnd = matchingPeriod ? startOfDay(new Date(matchingPeriod.end_date)) : null;

  const disabledBlackoutDay = (date: Date) => {
    const day = startOfDay(date);
    const isWeekendDay = [0, 6].includes(getDay(day));

    if (!isWeekendDay || !periodStart || !periodEnd) {
      return true;
    }

    return isBefore(day, periodStart) || isAfter(day, periodEnd);
  };

  const handleSubmit = async () => {
    if (!matchingPeriod) return;

    await createBreakRequest.mutateAsync({
      rotationPeriodId: matchingPeriod.id,
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
    trimester &&
    year &&
    matchingPeriod &&
    (requestType !== "need_break" ||
      requestScope !== "blackout_dates" ||
      blackoutDates.length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Request a Break</DialogTitle>
          <DialogDescription>
            Let your team know if you need time off or are willing to step back
            if needed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Request Type */}
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

          {requestType === "need_break" && (
            <div className="space-y-3">
              <Label>Break Type</Label>
              <RadioGroup
                value={requestScope}
                onValueChange={handleRequestScopeChange}
                className="grid gap-3"
              >
                {REQUEST_SCOPES.map((scope) => (
                  <label
                    key={scope.value}
                    htmlFor={`request-scope-${scope.value}`}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border p-3"
                  >
                    <RadioGroupItem
                      id={`request-scope-${scope.value}`}
                      value={scope.value}
                      className="mt-0.5"
                    />
                    <div className="space-y-1">
                      <div className="font-medium">{scope.label}</div>
                      <p className="text-sm text-muted-foreground">
                        {scope.description}
                      </p>
                    </div>
                  </label>
                ))}
              </RadioGroup>
            </div>
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
            <Label htmlFor="ministry">Ministry (optional)</Label>
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

          {/* Trimester */}
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

          {/* Year */}
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

          {/* Show message if no matching period */}
          {campusId && trimester && year && !periodsLoading && !matchingPeriod && (
            <p className="text-sm text-destructive">
              No rotation period found for Trimester {trimester}, {year} at this
              campus.
            </p>
          )}

          {requestType === "need_break" && requestScope === "blackout_dates" && matchingPeriod && (
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
                  mode="multiple"
                  selected={blackoutDates}
                  onSelect={(dates) => setBlackoutDates(dates || [])}
                  disabled={disabledBlackoutDay}
                  defaultMonth={periodStart ?? undefined}
                  numberOfMonths={1}
                />
              </div>
              {blackoutDates.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {blackoutDates
                    .slice()
                    .sort((a, b) => a.getTime() - b.getTime())
                    .map((date) => (
                      <Badge key={date.toISOString()} variant="secondary">
                        {format(date, "EEE, MMM d")}
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
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || createBreakRequest.isPending}
          >
            {createBreakRequest.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Submit Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
