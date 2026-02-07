import { useState } from "react";
import { format } from "date-fns";
import { CalendarX, AlertTriangle, Loader2, Music, FileText, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useCampuses } from "@/hooks/useCampuses";
import { useServicesToCancelOnDate, useCancelService } from "@/hooks/useCancelService";

interface CancelServiceDialogProps {
  trigger?: React.ReactNode;
}

export function CancelServiceDialog({ trigger }: CancelServiceDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedCampusId, setSelectedCampusId] = useState<string>("");
  const [step, setStep] = useState<'select' | 'confirm'>('select');

  const { data: campuses = [] } = useCampuses();
  const dateStr = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null;
  const { data: serviceData, isLoading: isLoadingServices } = useServicesToCancelOnDate(
    dateStr, 
    selectedCampusId || null
  );
  const cancelService = useCancelService();

  const hasDataToDelete = serviceData && (
    serviceData.draftSets.length > 0 || serviceData.servicePlans.length > 0
  );

  const handleProceedToConfirm = () => {
    if (hasDataToDelete) {
      setStep('confirm');
    }
  };

  const handleCancel = async () => {
    if (!serviceData) return;

    await cancelService.mutateAsync({
      draftSetIds: serviceData.draftSets.map(ds => ds.id),
      servicePlanIds: serviceData.servicePlans.map(sp => sp.id),
    });

    // Reset and close
    setOpen(false);
    setSelectedDate(undefined);
    setSelectedCampusId("");
    setStep('select');
  };

  const handleClose = () => {
    setOpen(false);
    // Reset state when closing
    setTimeout(() => {
      setSelectedDate(undefined);
      setSelectedCampusId("");
      setStep('select');
    }, 200);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) handleClose();
      else setOpen(true);
    }}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/10">
            <CalendarX className="h-4 w-4" />
            Cancel Service
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        {step === 'select' ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CalendarX className="h-5 w-5 text-destructive" />
                Cancel Service
              </DialogTitle>
              <DialogDescription>
                Select the date and campus of the canceled service. This will remove all setlists 
                and PCO-synced songs, making them available for scheduling again.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Campus Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Campus</label>
                <Select value={selectedCampusId} onValueChange={setSelectedCampusId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a campus" />
                  </SelectTrigger>
                  <SelectContent>
                    {campuses.map(campus => (
                      <SelectItem key={campus.id} value={campus.id}>
                        {campus.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Date Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Service Date</label>
                <div className="flex justify-center">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={setSelectedDate}
                    className="rounded-md border"
                    disabled={(date) => date > new Date()}
                  />
                </div>
              </div>

              {/* Preview of what will be deleted */}
              {selectedDate && selectedCampusId && (
                <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
                  <div className="text-sm font-medium">
                    {format(selectedDate, 'EEEE, MMMM d, yyyy')}
                  </div>

                  {isLoadingServices ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Checking for services...
                    </div>
                  ) : !hasDataToDelete ? (
                    <div className="text-sm text-muted-foreground">
                      No services found for this date and campus.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {serviceData.draftSets.length > 0 && (
                        <div className="flex items-center gap-2 text-sm">
                          <FileText className="h-4 w-4 text-amber-500" />
                          <span>
                            {serviceData.draftSets.length} setlist{serviceData.draftSets.length > 1 ? 's' : ''}
                          </span>
                          {serviceData.draftSets.map(ds => (
                            <Badge 
                              key={ds.id} 
                              variant={ds.status === 'published' ? 'default' : 'outline'}
                              className={ds.status === 'published' ? 'bg-green-600' : ''}
                            >
                              {ds.status} ({ds.songCount} songs)
                            </Badge>
                          ))}
                        </div>
                      )}

                      {serviceData.servicePlans.length > 0 && (
                        <div className="flex items-center gap-2 text-sm flex-wrap">
                          <Music className="h-4 w-4 text-blue-500" />
                          <span>
                            {serviceData.servicePlans.length} PCO service{serviceData.servicePlans.length > 1 ? 's' : ''}
                          </span>
                          {serviceData.servicePlans.map(sp => (
                            <Badge key={sp.id} variant="secondary">
                              {sp.serviceTypeName} ({sp.songCount} songs)
                            </Badge>
                          ))}
                        </div>
                      )}

                      <div className="text-sm font-medium text-green-600 pt-2 border-t">
                        ✓ {serviceData.totalSongs} songs will be freed for scheduling
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button 
                variant="destructive" 
                onClick={handleProceedToConfirm}
                disabled={!hasDataToDelete || isLoadingServices}
                className="gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Continue
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Confirm Cancellation
              </DialogTitle>
              <DialogDescription>
                This action cannot be undone. The following will be permanently deleted:
              </DialogDescription>
            </DialogHeader>

            <div className="py-4">
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
                <div className="font-medium">
                  {serviceData?.campusName} - {selectedDate && format(selectedDate, 'MMMM d, yyyy')}
                </div>

                <ul className="space-y-1 text-sm">
                  {serviceData && serviceData.draftSets.length > 0 && (
                    <li className="flex items-center gap-2">
                      <span className="text-destructive">•</span>
                      {serviceData.draftSets.length} setlist{serviceData.draftSets.length > 1 ? 's' : ''} 
                      {' '}with {serviceData.draftSets.reduce((sum, ds) => sum + ds.songCount, 0)} song assignments
                    </li>
                  )}
                  {serviceData && serviceData.servicePlans.length > 0 && (
                    <li className="flex items-center gap-2">
                      <span className="text-destructive">•</span>
                      {serviceData.servicePlans.length} PCO-synced service{serviceData.servicePlans.length > 1 ? 's' : ''} 
                      {' '}with {serviceData.servicePlans.reduce((sum, sp) => sum + sp.songCount, 0)} song records
                    </li>
                  )}
                </ul>

                <div className="text-sm text-muted-foreground pt-2 border-t border-destructive/20">
                  Songs will no longer count against rotation rules and can be scheduled again.
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('select')}>
                Back
              </Button>
              <Button 
                variant="destructive" 
                onClick={handleCancel}
                disabled={cancelService.isPending}
                className="gap-2"
              >
                {cancelService.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Canceling...
                  </>
                ) : (
                  <>
                    <CalendarX className="h-4 w-4" />
                    Cancel Service
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
