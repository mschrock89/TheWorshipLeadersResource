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
import { useCreateBreakRequest, useRotationPeriodsForUser } from "@/hooks/useBreakRequests";
import { useAuth } from "@/hooks/useAuth";
import { useUserCampuses } from "@/hooks/useCampuses";
import { useUserCampusMinistryPositions } from "@/hooks/useCampusMinistryPositions";
import { Loader2 } from "lucide-react";

interface DashboardBreakRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

  const handleSubmit = async () => {
    if (!matchingPeriod) return;

    await createBreakRequest.mutateAsync({
      rotationPeriodId: matchingPeriod.id,
      reason: reason || undefined,
      requestType: requestType as "need_break" | "willing_break",
      ministryType: ministryType || undefined,
    });

    // Reset form and close dialog
    setRequestType("need_break");
    setCampusId("");
    setMinistryType("");
    setTrimester("");
    setYear(currentYear.toString());
    setReason("");
    onOpenChange(false);
  };

  const canSubmit =
    requestType && campusId && trimester && year && matchingPeriod;

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
                <SelectValue placeholder={!campusId ? "Select campus first" : "Select ministry"} />
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

          {/* Reason (optional) */}
          <div className="space-y-2">
            <Label htmlFor="reason">Reason (optional)</Label>
            <Textarea
              id="reason"
              placeholder="Any additional notes..."
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
