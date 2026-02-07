import { useState } from "react";
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
import { Loader2, Coffee } from "lucide-react";
import { useCreateBreakRequest, useMyBreakRequests } from "@/hooks/useBreakRequests";

interface BreakRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  periods: Array<{ id: string; name: string; is_active: boolean }>;
}

export function BreakRequestDialog({
  open,
  onOpenChange,
  periods,
}: BreakRequestDialogProps) {
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>("");
  const [reason, setReason] = useState("");

  const createRequest = useCreateBreakRequest();
  const { data: myRequests = [] } = useMyBreakRequests();

  // Filter out periods that already have a request
  const availablePeriods = periods.filter(
    (p) => !myRequests.some((r) => r.rotation_period_id === p.id)
  );

  const handleSubmit = async () => {
    if (!selectedPeriodId) return;
    
    await createRequest.mutateAsync({
      rotationPeriodId: selectedPeriodId,
      reason: reason.trim() || undefined,
    });

    setSelectedPeriodId("");
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
          <div className="space-y-2">
            <Label htmlFor="period">Trimester</Label>
            <Select value={selectedPeriodId} onValueChange={setSelectedPeriodId}>
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

          <div className="space-y-2">
            <Label htmlFor="reason">Reason (optional)</Label>
            <Textarea
              id="reason"
              placeholder="Let us know why you need a break..."
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
            disabled={!selectedPeriodId || createRequest.isPending}
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
