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
import { CalendarIcon, Users, User, ArrowLeftRight, Loader2, CalendarDays, UserPlus, Info } from "lucide-react";
import { format, subDays } from "date-fns";
import { cn, parseLocalDate, groupByWeekend, isWeekend, WeekendGroup, getWeekendPairDate, formatPositionLabel } from "@/lib/utils";
import { useCreateSwapRequest, usePositionMembersForDate, usePositionMembersForCover, useUserScheduledDates, useOpenRequestRecipients } from "@/hooks/useSwapRequests";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfiles";
import { useMyTeamAssignments, MyScheduledDate } from "@/hooks/useMyTeamAssignments";
import { useUserCampuses } from "@/hooks/useCampuses";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface NewSwapRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type RequestMode = "swap" | "fill_in";
type SwapType = "open" | "direct";
type Step = "select-date" | "mode" | "type" | "details";

// Define vocalist positions
const VOCALIST_POSITIONS = ['vocalist', 'lead_vocals', 'harmony_vocals', 'background_vocals'];

export function NewSwapRequestDialog({
  open,
  onOpenChange,
}: NewSwapRequestDialogProps) {
  const { user } = useAuth();
  const { scheduledDates, assignments, isLoading: loadingDates } = useMyTeamAssignments();
  
  // Get current user's profile for gender
  const { data: userProfile } = useProfile(user?.id);
  const userGender = (userProfile as any)?.gender || null;
  
  const [step, setStep] = useState<Step>("select-date");
  const [requestMode, setRequestMode] = useState<RequestMode>("swap");
  const [selectedWeekend, setSelectedWeekend] = useState<WeekendGroup<MyScheduledDate> | null>(null);
  const [swapType, setSwapType] = useState<SwapType>("open");
  const [targetUserId, setTargetUserId] = useState<string>("");
  const [swapDate, setSwapDate] = useState<Date | undefined>();
  const [message, setMessage] = useState("");

  const createSwapRequest = useCreateSwapRequest();
  
  // Fetch user's campuses to check if they have Saturday service
  const { data: userCampuses } = useUserCampuses(user?.id);
  
  // Use the first item in the weekend group for position/team info
  const selectedSchedule = selectedWeekend?.items[0] || null;
  
  // Check if user has ANY vocalist position across all their assignments
  // If so, prioritize vocalist for swap matching regardless of what position they're scheduled for on this date
  const userHasVocalistPosition = assignments.some(a => VOCALIST_POSITIONS.includes(a.position));
  
  // Determine the position to use for swap matching:
  // - If user has a vocalist position (anywhere), use "vocalist" for matching
  // - Otherwise, use their scheduled position for this date
  const swapMatchPosition = userHasVocalistPosition ? "vocalist" : (selectedSchedule?.position || "");
  
  // Determine if we should apply gender-based filtering (only for vocalist swaps)
  const isVocalistSwap = userHasVocalistPosition;
  
  // For direct swaps, the "who" list must depend on the date you're swapping to.
  const swapToDateStr = swapDate ? format(swapDate, "yyyy-MM-dd") : undefined;

  // For SWAP requests: use date-based query (they must be scheduled on the swap-to date)
  const { data: swapPositionMembers, isLoading: loadingSwapMembers } = usePositionMembersForDate(
    swapMatchPosition,
    swapToDateStr,
    user?.id,
    selectedSchedule?.campusId || undefined,
    selectedSchedule?.rotationPeriodId || undefined,
    selectedSchedule?.ministryType || undefined,
    isVocalistSwap ? userGender : undefined
  );

  // For COVER/FILL-IN requests: use campus-based query (no swap date needed, just same campus)
  const { data: coverPositionMembers, isLoading: loadingCoverMembers } = usePositionMembersForCover(
    swapMatchPosition,
    user?.id,
    selectedSchedule?.campusId || undefined,
    selectedSchedule?.rotationPeriodId || undefined,
    selectedSchedule?.ministryType || undefined,
    isVocalistSwap ? userGender : undefined
  );

  // Use the correct members list based on request mode
  const positionMembers = requestMode === "fill_in" ? coverPositionMembers : swapPositionMembers;
  const loadingMembers = requestMode === "fill_in" ? loadingCoverMembers : loadingSwapMembers;

  // Fetch ALL scheduled dates for the target user (across all their teams)
  // so we can highlight when they're available/busy
  const { data: targetScheduledDates } = useUserScheduledDates(
    targetUserId || undefined
  );

  // Fetch eligible recipients for open requests (same position + same campus)
  const { data: openRequestRecipients, isLoading: loadingRecipients } = useOpenRequestRecipients(
    selectedSchedule?.position,
    user?.id,
    step === "type" || (step === "details" && swapType === "open")
  );
  
  // Check if user belongs to a campus with Saturday service
  const hasSaturdayService = userCampuses?.some(uc => uc.campuses?.has_saturday_service) ?? false;

  // Filter to only show future dates, grouped by weekend
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const upcomingDates = scheduledDates
    .map((s) => ({ ...s, localDate: parseLocalDate(s.scheduleDate) }))
    .filter((s) => s.localDate >= startOfToday)
    .sort((a, b) => a.localDate.getTime() - b.localDate.getTime());

  // Group by weekend
  const weekendGroups = groupByWeekend(upcomingDates);

  const handleClose = () => {
    onOpenChange(false);
    // Reset state after close animation
    setTimeout(() => {
      setStep("select-date");
      setRequestMode("swap");
      setSelectedWeekend(null);
      setSwapType("open");
      setTargetUserId("");
      setSwapDate(undefined);
      setMessage("");
    }, 200);
  };

  const handleSelectWeekend = (group: WeekendGroup<MyScheduledDate>) => {
    setSelectedWeekend(group);
    setStep("mode");
  };

  // Format weekend display label
  const formatWeekendLabel = (group: WeekendGroup<MyScheduledDate>) => {
    const satDate = parseLocalDate(group.saturdayDate);
    const isWeekendGroup = isWeekend(group.saturdayDate) && group.saturdayDate !== group.sundayDate;
    
    if (isWeekendGroup) {
      return `Weekend of ${format(satDate, "MMMM d, yyyy")}`;
    }
    return format(satDate, "EEEE, MMMM d, yyyy");
  };

  const handleSubmit = async () => {
    if (!selectedSchedule) return;

    try {
      await createSwapRequest.mutateAsync({
        original_date: selectedSchedule.scheduleDate,
        swap_date: requestMode === "swap" && swapType === "direct" && swapDate ? format(swapDate, "yyyy-MM-dd") : null,
        target_user_id: swapType === "direct" ? targetUserId : null,
        position: selectedSchedule.position,
        team_id: selectedSchedule.teamId,
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

  // For fill-in requests, only need target user (no swap date needed)
  // For swap requests, open doesn't need anything; direct needs both user and date
  const canSubmit = requestMode === "fill_in"
    ? (swapType === "open" || (swapType === "direct" && targetUserId))
    : (swapType === "open" || (swapType === "direct" && targetUserId && swapDate));

  const getStepDescription = () => {
    if (step === "select-date") {
      return "Select which date you need coverage for";
    }
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
            {step === "select-date" ? "Request Coverage" : requestMode === "fill_in" ? "Request Cover" : "Request Swap"}
          </DialogTitle>
          <DialogDescription>{getStepDescription()}</DialogDescription>
        </DialogHeader>

        {/* Step 1: Select Date */}
        {step === "select-date" && (
          <div className="space-y-4 py-4">
            {loadingDates ? (
              <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading your schedule...
              </div>
            ) : weekendGroups.length === 0 ? (
              <div className="py-8 text-center">
                <CalendarDays className="mx-auto h-12 w-12 text-muted-foreground/50" />
                <p className="mt-4 text-sm text-muted-foreground">
                  You don't have any upcoming weekends to swap
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {weekendGroups.map((group) => {
                  const firstItem = group.items[0];
                  const isWeekendGroup = isWeekend(group.saturdayDate) && group.saturdayDate !== group.sundayDate;
                  
                  return (
                    <button
                      key={group.weekendKey}
                      onClick={() => handleSelectWeekend(group)}
                      className="w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted/50"
                      style={{
                        borderColor: `${firstItem.teamColor}40`,
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-foreground">
                            {formatWeekendLabel(group)}
                          </p>
                          {isWeekendGroup && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Sat {format(parseLocalDate(group.saturdayDate), "MMM d")} & Sun {format(parseLocalDate(group.sundayDate), "MMM d")}
                            </p>
                          )}
                          <div className="mt-1 flex items-center gap-2">
                            <span
                              className="inline-block h-2 w-2 rounded-full"
                              style={{ backgroundColor: firstItem.teamColor }}
                            />
                            <span className="text-sm text-muted-foreground">
                              {firstItem.teamName} • {formatPositionLabel(firstItem.position)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Choose Mode (Swap vs Fill-In) */}
        {step === "mode" && selectedSchedule && selectedWeekend && (
          <div className="space-y-4 py-4">
            <div className="rounded-lg border p-3 bg-muted/50">
              <p className="text-sm text-muted-foreground">
                You're scheduled to play the{" "}
                <span className="font-medium text-foreground">
                  {formatWeekendLabel(selectedWeekend)}
                </span>{" "}
                with <span className="font-medium text-foreground">{selectedSchedule.teamName}</span> as{" "}
                <span className="font-medium text-foreground">{formatPositionLabel(selectedSchedule.position)}</span>
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

        {/* Step 3: Choose Type (Open vs Direct) */}
        {step === "type" && selectedSchedule && selectedWeekend && (
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
                    Post a request that any {formatPositionLabel(selectedSchedule.position)} can accept
                  </p>
                  {/* Show recipient preview when open is selected */}
                  {swapType === "open" && (
                    <div className="mt-3 pt-3 border-t border-border/50">
                      <p className="text-xs font-medium text-muted-foreground mb-2">
                        Will be sent to {loadingRecipients ? "..." : `${openRequestRecipients?.length || 0}`} team members:
                      </p>
                      {loadingRecipients ? (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Loading...
                        </div>
                      ) : openRequestRecipients && openRequestRecipients.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {openRequestRecipients.slice(0, 8).map((recipient) => (
                            <div
                              key={recipient.id}
                              className="flex items-center gap-1.5 bg-muted rounded-full px-2 py-0.5"
                            >
                              <Avatar className="h-4 w-4">
                                <AvatarImage src={recipient.avatar_url || undefined} />
                                <AvatarFallback className="text-[8px]">
                                  {recipient.full_name?.charAt(0) || "?"}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-xs">{recipient.full_name?.split(" ")[0]}</span>
                            </div>
                          ))}
                          {openRequestRecipients.length > 8 && (
                            <span className="text-xs text-muted-foreground self-center">
                              +{openRequestRecipients.length - 8} more
                            </span>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          No other {formatPositionLabel(selectedSchedule.position)} players found at your campus
                        </p>
                      )}
                    </div>
                  )}
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
        {step === "details" && swapType === "open" && selectedSchedule && selectedWeekend && (
          <div className="space-y-4 py-4">
            <div className="rounded-lg border p-3 bg-muted/50">
              <p className="text-sm">
                <span className="font-medium">Weekend you can't play:</span>{" "}
                {formatWeekendLabel(selectedWeekend)}
              </p>
            </div>

            {/* Recipients preview */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Sending to ({openRequestRecipients?.length || 0} members)
              </Label>
              {loadingRecipients ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading recipients...
                </div>
              ) : openRequestRecipients && openRequestRecipients.length > 0 ? (
                <div className="flex flex-wrap gap-2 p-3 rounded-lg border bg-muted/30 max-h-32 overflow-y-auto">
                  {openRequestRecipients.map((recipient) => (
                    <div
                      key={recipient.id}
                      className="flex items-center gap-2 bg-background rounded-full px-2.5 py-1 border"
                    >
                      <Avatar className="h-5 w-5">
                        <AvatarImage src={recipient.avatar_url || undefined} />
                        <AvatarFallback className="text-[10px]">
                          {recipient.full_name?.charAt(0) || "?"}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm">{recipient.full_name}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <Alert className="bg-amber-500/10 border-amber-500/30">
                  <Info className="h-4 w-4 text-amber-500" />
                  <AlertDescription className="text-xs text-amber-600 dark:text-amber-400">
                    No other {formatPositionLabel(selectedSchedule.position)} players found at your campus. 
                    Consider asking someone specific instead.
                  </AlertDescription>
                </Alert>
              )}
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
        {step === "details" && swapType === "direct" && selectedSchedule && selectedWeekend && (
          <div className="space-y-4 py-4">
            <div className="rounded-lg border p-3 bg-muted/50">
              <p className="text-sm">
                <span className="font-medium">Weekend you can't play:</span>{" "}
                {formatWeekendLabel(selectedWeekend)}
              </p>
            </div>

            {/* Gender-based swap info for vocalists */}
            {isVocalistSwap && (
              <Alert className="bg-blue-500/10 border-blue-500/30">
                <Info className="h-4 w-4 text-blue-500" />
                <AlertDescription className="text-xs text-blue-600 dark:text-blue-400">
                  Vocalist {requestMode === "fill_in" ? "fill-ins" : "swaps"} are limited to same-gender team members
                  {!userGender && " (set your gender in your profile to see matching members)"}
                </AlertDescription>
              </Alert>
            )}

            {/* Date picker - only for swaps, not fill-ins */}
            {requestMode === "swap" && (
              <div className="space-y-2">
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
                        
                        // Disable the original weekend
                        if (selectedSchedule) {
                          const originalLocal = parseLocalDate(selectedSchedule.scheduleDate);
                          if (date.toDateString() === originalLocal.toDateString()) return true;
                          
                          // Also disable the weekend pair date
                          const pairDateStr = getWeekendPairDate(selectedSchedule.scheduleDate);
                          if (pairDateStr) {
                            const pairDate = parseLocalDate(pairDateStr);
                            if (date.toDateString() === pairDate.toDateString()) return true;
                          }
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
              </div>
            )}

            <div className="space-y-2">
              <Label>
                {requestMode === "fill_in" ? "Who do you want to ask?" : "Who do you want to swap with?"}
              </Label>
              {loadingMembers ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading...
                </div>
              ) : positionMembers?.filter(m => m.user_id).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No available team members found for this position
                  {isVocalistSwap && userGender && " with matching gender"}
                </p>
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
                            {isVocalistSwap && !member.gender && (
                              <span className="text-xs text-muted-foreground">(gender not set)</span>
                            )}
                          </span>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
            </div>

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
          {step !== "select-date" && (
            <Button
              variant="ghost"
              onClick={() => {
                if (step === "details") {
                  setStep("type");
                } else if (step === "type") {
                  setStep("mode");
                } else {
                  setStep("select-date");
                  setSelectedWeekend(null);
                  setRequestMode("swap");
                }
              }}
            >
              Back
            </Button>
          )}
          {step === "select-date" ? (
            <Button variant="ghost" onClick={handleClose}>
              Cancel
            </Button>
          ) : step === "mode" ? (
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
