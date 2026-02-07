import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Users, User, ArrowLeftRight, Loader2, UserPlus } from "lucide-react";
import { format, addDays, subDays } from "date-fns";
import { cn, parseLocalDate, isWeekend, getWeekendPairDate, formatDateForDB, formatPositionLabel } from "@/lib/utils";
import { useCreateSwapRequest, usePositionMembers, usePositionMembersForCover, useUserScheduledDates } from "@/hooks/useSwapRequests";
import { useAuth } from "@/hooks/useAuth";
import { useUserCampuses } from "@/hooks/useCampuses";
import { toast } from "sonner";

interface SwapRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  originalDate: Date;
  position: string;
  teamId: string;
  teamName: string;
  campusId?: string | null;
}

type RequestMode = "swap" | "fill_in";
type SwapType = "open" | "direct";
type Step = "mode" | "type" | "details";

export function SwapRequestDialog({
  open,
  onOpenChange,
  originalDate,
  position,
  teamId,
  teamName,
  campusId,
}: SwapRequestDialogProps) {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>("mode");
  const [requestMode, setRequestMode] = useState<RequestMode>("swap");
  const [swapType, setSwapType] = useState<SwapType>("open");
  const [targetUserId, setTargetUserId] = useState<string>("");
  const [swapDate, setSwapDate] = useState<Date | undefined>();
  const [message, setMessage] = useState("");

  const createSwapRequest = useCreateSwapRequest();
  
  // Fetch user's campuses to check if they have Saturday service
  const { data: userCampuses } = useUserCampuses(user?.id);
  
  // Use the provided campusId (from the schedule) or fall back to user's primary campus
  const effectiveCampusId = campusId || userCampuses?.[0]?.campuses?.id;
  
  // For SWAP requests: use the original position members query
  const { data: swapPositionMembers, isLoading: loadingSwapMembers } = usePositionMembers(
    position,
    user?.id,
    effectiveCampusId
  );
  
  // For COVER/FILL-IN requests: use campus-based query (no swap date needed)
  const { data: coverPositionMembers, isLoading: loadingCoverMembers } = usePositionMembersForCover(
    position,
    user?.id,
    effectiveCampusId
  );
  
  // Use the correct members list based on request mode
  const positionMembers = requestMode === "fill_in" ? coverPositionMembers : swapPositionMembers;
  const loadingMembers = requestMode === "fill_in" ? loadingCoverMembers : loadingSwapMembers;
  
  // Fetch ALL scheduled dates for the target user (across all their teams)
  const { data: targetScheduledDates } = useUserScheduledDates(
    targetUserId || undefined
  );
  
  // Check if user belongs to a campus with Saturday service
  const hasSaturdayService = userCampuses?.some(uc => uc.campuses?.has_saturday_service) ?? false;

  // Check if original date is a weekend
  const originalDateStr = formatDateForDB(originalDate);
  const isWeekendDate = isWeekend(originalDateStr);
  const pairDateStr = isWeekendDate ? getWeekendPairDate(originalDateStr) : null;
  
  // Format weekend display
  const formatWeekendDisplay = () => {
    if (!isWeekendDate || !pairDateStr) {
      return format(originalDate, "EEEE, MMMM d, yyyy");
    }
    const satDate = originalDate.getDay() === 6 ? originalDate : parseLocalDate(pairDateStr);
    return `Weekend of ${format(satDate, "MMMM d, yyyy")}`;
  };

  const handleClose = () => {
    onOpenChange(false);
    // Reset state after close animation
    setTimeout(() => {
      setStep("mode");
      setRequestMode("swap");
      setSwapType("open");
      setTargetUserId("");
      setSwapDate(undefined);
      setMessage("");
    }, 200);
  };

  const handleSubmit = async () => {
    try {
      await createSwapRequest.mutateAsync({
        original_date: format(originalDate, "yyyy-MM-dd"),
        swap_date: requestMode === "swap" && swapType === "direct" && swapDate ? format(swapDate, "yyyy-MM-dd") : null,
        target_user_id: swapType === "direct" ? targetUserId : null,
        position,
        team_id: teamId,
        message: message || null,
        request_type: requestMode,
      });

      const successMessage = requestMode === "fill_in"
        ? (swapType === "open" ? "Cover request posted to your position group!" : "Cover request sent!")
        : (swapType === "open" ? "Swap request posted to your position group!" : "Swap request sent!");
      
      toast.success(successMessage);
      handleClose();
    } catch (error) {
      toast.error("Failed to create request");
      console.error(error);
    }
  };

  // For cover requests, only need target user (no swap date needed)
  // For swap requests, open doesn't need anything; direct needs both user and date
  const canSubmit = requestMode === "fill_in"
    ? (swapType === "open" || (swapType === "direct" && targetUserId))
    : (swapType === "open" || (swapType === "direct" && targetUserId && swapDate));

  const getStepDescription = () => {
    if (step === "mode") {
      return "What kind of coverage do you need?";
    }
    if (step === "type") {
      return requestMode === "fill_in" 
        ? "Choose how you want to request a cover"
        : "Choose how you want to request a swap";
    }
    return swapType === "open"
      ? "Post a request to your position group"
      : requestMode === "fill_in"
        ? "Request someone specific to cover for you"
        : "Request a direct swap with someone";
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {requestMode === "fill_in" ? (
              <UserPlus className="h-5 w-5" />
            ) : (
              <ArrowLeftRight className="h-5 w-5" />
            )}
            {requestMode === "fill_in" ? "Request Cover" : "Request Swap"}
          </DialogTitle>
          <DialogDescription>{getStepDescription()}</DialogDescription>
        </DialogHeader>

        {/* Step 1: Choose Mode (Swap vs Cover) */}
        {step === "mode" && (
          <div className="space-y-4 py-4">
            <div className="rounded-lg border p-3 bg-muted/50">
              <p className="text-sm text-muted-foreground">
                You're scheduled to play the{" "}
                <span className="font-medium text-foreground">
                  {formatWeekendDisplay()}
                </span>{" "}
                with <span className="font-medium text-foreground">{teamName}</span> as{" "}
                <span className="font-medium text-foreground">{formatPositionLabel(position)}</span>
              </p>
            </div>

            <RadioGroup
              value={requestMode}
              onValueChange={(v) => setRequestMode(v as RequestMode)}
              className="space-y-3"
            >
              <div
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-colors",
                  requestMode === "swap" && "border-primary bg-primary/5"
                )}
                onClick={() => setRequestMode("swap")}
              >
                <RadioGroupItem value="swap" id="mode-swap" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="mode-swap" className="flex items-center gap-2 cursor-pointer">
                    <ArrowLeftRight className="h-4 w-4" />
                    Swap dates
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Trade your date with someone else's date
                  </p>
                </div>
              </div>

              <div
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-colors",
                  requestMode === "fill_in" && "border-primary bg-primary/5"
                )}
                onClick={() => setRequestMode("fill_in")}
              >
                <RadioGroupItem value="fill_in" id="mode-fill-in" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="mode-fill-in" className="flex items-center gap-2 cursor-pointer">
                    <UserPlus className="h-4 w-4" />
                    Ask someone to cover
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Have someone cover for you without trading dates
                  </p>
                </div>
              </div>
            </RadioGroup>
          </div>
        )}

        {/* Step 2: Choose Type (Open vs Direct) */}
        {step === "type" && (
          <div className="space-y-4 py-4">
            <RadioGroup
              value={swapType}
              onValueChange={(v) => setSwapType(v as SwapType)}
              className="space-y-3"
            >
              <div
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-colors",
                  swapType === "open" && "border-primary bg-primary/5"
                )}
                onClick={() => setSwapType("open")}
              >
                <RadioGroupItem value="open" id="open" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="open" className="flex items-center gap-2 cursor-pointer">
                    <Users className="h-4 w-4" />
                    Ask my position group
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Post a request that any {formatPositionLabel(position)} can accept
                  </p>
                </div>
              </div>

              <div
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-colors",
                  swapType === "direct" && "border-primary bg-primary/5"
                )}
                onClick={() => setSwapType("direct")}
              >
                <RadioGroupItem value="direct" id="direct" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="direct" className="flex items-center gap-2 cursor-pointer">
                    <User className="h-4 w-4" />
                    Request from specific person
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    {requestMode === "fill_in" 
                      ? "Ask a specific person to cover for you"
                      : "Propose a date swap with someone specific"}
                  </p>
                </div>
              </div>
            </RadioGroup>
          </div>
        )}

        {/* Step 3: Details - Open */}
        {step === "details" && swapType === "open" && (
          <div className="space-y-4 py-4">
            <div className="rounded-lg border p-3 bg-muted/50">
              <p className="text-sm">
                <span className="font-medium">{isWeekendDate ? "Weekend" : "Date"} you can't play:</span>{" "}
                {formatWeekendDisplay()}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="message">Message (optional)</Label>
              <Textarea
                id="message"
                placeholder={requestMode === "fill_in" 
                  ? "Add any details about why you need coverage..." 
                  : "Add any details about why you need to swap..."}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
              />
            </div>
          </div>
        )}

        {/* Step 4: Details - Direct */}
        {step === "details" && swapType === "direct" && (
          <div className="space-y-4 py-4">
            <div className="rounded-lg border p-3 bg-muted/50">
              <p className="text-sm">
                <span className="font-medium">{isWeekendDate ? "Weekend" : "Date"} you can't play:</span>{" "}
                {formatWeekendDisplay()}
              </p>
            </div>

            <div className="space-y-2">
              <Label>{requestMode === "fill_in" ? "Who do you want to ask for coverage?" : "Who do you want to swap with?"}</Label>
              {loadingMembers ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading...
                </div>
              ) : (
                <Select value={targetUserId} onValueChange={setTargetUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a person" />
                  </SelectTrigger>
                  <SelectContent>
                    {positionMembers
                      ?.filter(m => m.user_id)
                      .filter((m, i, arr) => arr.findIndex(x => x.user_id === m.user_id) === i)
                      .sort((a, b) => a.member_name.localeCompare(b.member_name))
                      .map((member) => (
                        <SelectItem key={member.user_id!} value={member.user_id!}>
                          <span className="flex items-center gap-2">
                            {member.member_name}
                            {member.isOnBreak && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400">
                                On Break
                              </span>
                            )}
                          </span>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Only show date picker for swap requests, not cover requests */}
            {requestMode === "swap" && <div className="space-y-2">
              <Label>Date you can play instead</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !swapDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {swapDate 
                      ? hasSaturdayService 
                        ? `Weekend of ${format(swapDate, "MMM d, yyyy")}`
                        : format(swapDate, "PPP") 
                      : "Pick a weekend"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={swapDate}
                    onSelect={(date) => {
                      if (!date) {
                        setSwapDate(undefined);
                        return;
                      }
                      // For Saturday service campuses, selecting Saturday or Sunday selects the Saturday
                      if (hasSaturdayService) {
                        const day = date.getDay();
                        if (day === 0) {
                          // Sunday selected - use the Saturday before
                          setSwapDate(subDays(date, 1));
                        } else if (day === 6) {
                          // Saturday selected
                          setSwapDate(date);
                        }
                      } else {
                        setSwapDate(date);
                      }
                    }}
                    className="p-3 pointer-events-auto"
                    disabled={(date) => {
                      // Disable dates before today
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      if (date < today) return true;
                      
                      // Disable the original date and its weekend pair
                      if (date.toDateString() === originalDate.toDateString()) return true;
                      if (pairDateStr) {
                        const pairDate = parseLocalDate(pairDateStr);
                        if (date.toDateString() === pairDate.toDateString()) return true;
                      }
                      
                      // Only allow weekend dates (Saturday = 6, Sunday = 0)
                      const day = date.getDay();
                      return day !== 0 && day !== 6;
                    }}
                    modifiers={{
                      scheduled:
                        targetScheduledDates?.map((d) => parseLocalDate(d.schedule_date)) || [],
                    }}
                    modifiersStyles={{
                      scheduled: {
                        backgroundColor: "hsl(var(--primary) / 0.2)",
                        borderRadius: "50%",
                      },
                    }}
                    initialFocus
                  />
                  <div className="p-3 border-t space-y-1">
                    {hasSaturdayService && (
                      <p className="text-xs text-muted-foreground">
                        Weekend dates are selected as a pair (Sat & Sun)
                      </p>
                    )}
                    {targetScheduledDates && targetScheduledDates.length > 0 && (
                      <div className="text-xs text-muted-foreground">
                        <span className="inline-block w-3 h-3 rounded-full bg-primary/20 mr-1" />
                        Highlighted dates are when they're scheduled
                      </div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>}

            <div className="space-y-2">
              <Label htmlFor="message-direct">Message (optional)</Label>
              <Textarea
                id="message-direct"
                placeholder="Add any details..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={2}
              />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {step === "type" && (
            <Button variant="ghost" onClick={() => setStep("mode")}>
              Back
            </Button>
          )}
          {step === "details" && (
            <Button variant="ghost" onClick={() => setStep("type")}>
              Back
            </Button>
          )}
          {step === "mode" ? (
            <Button onClick={() => setStep("type")}>Continue</Button>
          ) : step === "type" ? (
            <Button onClick={() => setStep("details")}>Continue</Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit || createSwapRequest.isPending}
            >
              {createSwapRequest.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                "Send Request"
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
