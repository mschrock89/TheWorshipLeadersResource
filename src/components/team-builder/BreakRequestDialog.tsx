import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Loader2, Coffee } from "lucide-react";
import { format, getDay, isAfter, isBefore, startOfDay } from "date-fns";
import { useCreateBreakRequest, useMyBreakRequests } from "@/hooks/useBreakRequests";

interface BreakRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  periods: Array<{
    id: string;
    name: string;
    is_active: boolean;
    start_date: string;
    end_date: string;
  }>;
}

const REQUEST_SCOPES = [
  {
    value: "full_trimester",
    label: "Entire trimester",
    description: "Ask to be off rotation for the whole trimester.",
  },
  {
    value: "blackout_dates",
    label: "Specific weekends",
    description: "Select the weekends you already know you cannot serve.",
  },
];

export function BreakRequestDialog({
  open,
  onOpenChange,
  periods,
}: BreakRequestDialogProps) {
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>("");
  const [requestScope, setRequestScope] = useState<string>("full_trimester");
  const [blackoutDates, setBlackoutDates] = useState<Date[]>([]);
  const [reason, setReason] = useState("");

  const createRequest = useCreateBreakRequest();
  const { data: myRequests = [] } = useMyBreakRequests();

  // Filter out periods that already have a request
  const availablePeriods = periods.filter(
    (p) => !myRequests.some((r) => r.rotation_period_id === p.id)
  );

  const selectedPeriod = useMemo(
    () => availablePeriods.find((period) => period.id === selectedPeriodId) || null,
    [availablePeriods, selectedPeriodId]
  );

  const periodStart = selectedPeriod ? startOfDay(new Date(selectedPeriod.start_date)) : null;
  const periodEnd = selectedPeriod ? startOfDay(new Date(selectedPeriod.end_date)) : null;

  const disabledBlackoutDay = (date: Date) => {
    const day = startOfDay(date);
    const isWeekendDay = [0, 6].includes(getDay(day));

    if (!isWeekendDay || !periodStart || !periodEnd) {
      return true;
    }

    return isBefore(day, periodStart) || isAfter(day, periodEnd);
  };

  const handleRequestScopeChange = (value: string) => {
    setRequestScope(value);
    if (value !== "blackout_dates") {
      setBlackoutDates([]);
    }
  };

  const handlePeriodChange = (value: string) => {
    setSelectedPeriodId(value);
    setBlackoutDates([]);
  };

  const handleSubmit = async () => {
    if (!selectedPeriodId) return;
    
    await createRequest.mutateAsync({
      rotationPeriodId: selectedPeriodId,
      requestScope: requestScope as "full_trimester" | "blackout_dates",
      blackoutDates:
        requestScope === "blackout_dates"
          ? blackoutDates.map((date) => format(date, "yyyy-MM-dd"))
          : undefined,
      reason: reason.trim() || undefined,
    });

    setSelectedPeriodId("");
    setRequestScope("full_trimester");
    setBlackoutDates([]);
    setReason("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Coffee className="h-5 w-5 text-primary" />
            Request Break
          </DialogTitle>
          <DialogDescription>
            Request to be placed on break for a specific trimester. Your worship pastor will review your request.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
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
                  htmlFor={`team-break-scope-${scope.value}`}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border p-3"
                >
                  <RadioGroupItem
                    id={`team-break-scope-${scope.value}`}
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

          <div className="space-y-2">
            <Label htmlFor="period">Trimester</Label>
            <Select value={selectedPeriodId} onValueChange={handlePeriodChange}>
              <SelectTrigger id="period">
                <SelectValue placeholder="Select a trimester" />
              </SelectTrigger>
              <SelectContent>
                {availablePeriods.length === 0 ? (
                  <p className="px-2 py-4 text-sm text-muted-foreground text-center">
                    No trimesters available
                  </p>
                ) : (
                  availablePeriods.map((period) => (
                    <SelectItem key={period.id} value={period.id}>
                      {period.name}
                      {period.is_active && " (Current)"}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {requestScope === "blackout_dates" && selectedPeriod && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Select blackout weekends</Label>
                <p className="text-sm text-muted-foreground">
                  Choose the Saturdays and Sundays in this trimester when you have a prior commitment.
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

          <div className="space-y-2">
            <Label htmlFor="reason">Reason (optional)</Label>
            <Textarea
              id="reason"
              placeholder={
                requestScope === "blackout_dates"
                  ? "Optional note about these blackout weekends..."
                  : "Let us know why you need a break..."
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
            disabled={
              !selectedPeriodId ||
              (requestScope === "blackout_dates" && blackoutDates.length === 0) ||
              createRequest.isPending
            }
          >
            {createRequest.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Submit Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
