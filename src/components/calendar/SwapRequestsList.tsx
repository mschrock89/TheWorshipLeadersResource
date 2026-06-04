import { useState } from "react";
import { format } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Check, X, Clock, ArrowLeftRight, Users, User, Loader2, UserPlus, Ban } from "lucide-react";
import {
  useSwapRequests,
  useRespondToSwapRequest,
  useDismissedSwapRequests,
  useDismissSwapRequest,
  useUserScheduledDates,
  SwapRequest,
} from "@/hooks/useSwapRequests";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { parseLocalDate, isWeekend, getWeekendPairDate, getWeekendKey, formatPositionLabel } from "@/lib/utils";
import { isVideoPosition } from "@/lib/constants";

// Format date with weekend grouping. When `dateSpecific` is set (e.g. Video, where
// Saturday and Sunday are different teams), show the exact date instead of the weekend.
function formatSwapDate(dateStr: string, dateSpecific = false): string {
  const isWeekendDate = isWeekend(dateStr);
  const date = parseLocalDate(dateStr);
  
  if (isWeekendDate && !dateSpecific) {
    const pairDateStr = getWeekendPairDate(dateStr);
    if (pairDateStr) {
      // Show "Jan 11 wknd" format for weekends
      const satDate = date.getDay() === 6 ? date : parseLocalDate(pairDateStr);
      return `${format(satDate, "MMM d")} wknd`;
    }
  }
  return format(date, "MMM d");
}

interface SwapRequestGroup {
  key: string;
  representative: SwapRequest;
  requests: SwapRequest[];
}

// Group weekend cover requests (Sat + Sun) for the same requester/position/team
// into a single entry. Weekend Worship is covered by the same person across both
// days, so the days are accepted/declined/cancelled together.
function groupSwapRequests(requests: SwapRequest[]): SwapRequestGroup[] {
  const groups = new Map<string, SwapRequestGroup>();
  const order: string[] = [];

  for (const request of requests) {
    const isFillIn = request.request_type === "fill_in" || !request.swap_date;
    // Video teams differ between Saturday and Sunday, so keep video requests date-specific.
    const key =
      isFillIn && isWeekend(request.original_date) && !isVideoPosition(request.position)
        ? `weekend|${getWeekendKey(request.original_date)}|${request.requester_id}|${request.position}|${request.team_id}|${request.target_user_id ?? "open"}|${request.status}`
        : `single|${request.id}`;

    const existing = groups.get(key);
    if (existing) {
      existing.requests.push(request);
    } else {
      groups.set(key, { key, representative: request, requests: [request] });
      order.push(key);
    }
  }

  return order.map((k) => groups.get(k)!);
}

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function SwapRequestCard({
  group,
  currentUserId,
  onRespond,
  onDismiss,
  isResponding,
  isDismissing,
}: {
  group: SwapRequestGroup;
  currentUserId: string;
  onRespond: (group: SwapRequestGroup, action: "accept" | "decline" | "cancel") => void;
  onDismiss: (group: SwapRequestGroup) => void;
  isResponding: boolean;
  isDismissing: boolean;
}) {
  const request = group.representative;
  const isRequester = request.requester_id === currentUserId;
  const isTarget = request.target_user_id === currentUserId;
  const isOpenRequest = !request.target_user_id;
  const isFillIn = request.request_type === "fill_in";
  const isDateSpecific = isVideoPosition(request.position);
  const canAccept = !isRequester && request.status === "pending";
  const canCancel = isRequester && request.status === "pending";

  const statusColors = {
    pending: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
    accepted: "bg-green-500/10 text-green-600 border-green-500/20",
    declined: "bg-red-500/10 text-red-600 border-red-500/20",
    cancelled: "bg-muted text-muted-foreground",
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={request.requester?.avatar_url || ""} />
              <AvatarFallback>{getInitials(request.requester?.full_name)}</AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-base">
                {isRequester ? "Your Request" : request.requester?.full_name}
              </CardTitle>
              <CardDescription className="flex items-center gap-1">
                {isFillIn ? (
                  <>
                <UserPlus className="h-3 w-3" />
                    {isOpenRequest ? `Cover for ${formatPositionLabel(request.position)}` : "Direct cover"}
                  </>
                ) : isOpenRequest ? (
                  <>
                    <Users className="h-3 w-3" />
                    Open to {formatPositionLabel(request.position)}
                  </>
                ) : (
                  <>
                    <User className="h-3 w-3" />
                    Direct swap
                  </>
                )}
              </CardDescription>
            </div>
          </div>
          <Badge variant="outline" className={statusColors[request.status]}>
            {request.status === "pending" && <Clock className="h-3 w-3 mr-1" />}
            {request.status === "accepted" && <Check className="h-3 w-3 mr-1" />}
            {request.status === "declined" && <X className="h-3 w-3 mr-1" />}
            {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <div className="flex-1 rounded-lg bg-muted p-2 text-center">
            <p className="text-xs text-muted-foreground mb-1">
              {isFillIn ? "Needs coverage" : "Can't play"}
            </p>
            <p className="font-medium">{formatSwapDate(request.original_date, isDateSpecific)}</p>
          </div>
          {request.swap_date && !isFillIn && (
            <>
              <ArrowLeftRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 rounded-lg bg-muted p-2 text-center">
                <p className="text-xs text-muted-foreground mb-1">Can play</p>
                <p className="font-medium">{formatSwapDate(request.swap_date, isDateSpecific)}</p>
              </div>
            </>
          )}
        </div>

        {request.message && (
          <p className="text-sm text-muted-foreground italic">"{request.message}"</p>
        )}

        {request.status === "accepted" && request.accepted_by && (
          <div className="flex items-center gap-2 text-sm text-green-600">
            <Check className="h-4 w-4" />
            {isFillIn ? "Covered by" : "Accepted by"} {request.accepted_by.full_name}
          </div>
        )}

        {canAccept && (
          <div className="flex gap-2 pt-2">
            <Button
              size="sm"
              className="flex-1"
              onClick={() => onRespond(group, "accept")}
              disabled={isResponding || isDismissing}
            >
              {isResponding ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Check className="h-4 w-4 mr-1" />
                  Accept
                </>
              )}
            </Button>
            {isTarget ? (
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => onRespond(group, "decline")}
                disabled={isResponding || isDismissing}
              >
                <X className="h-4 w-4 mr-1" />
                Decline
              </Button>
            ) : isOpenRequest ? (
              <Button
                size="sm"
                variant="outline"
                className="flex-1 text-muted-foreground"
                onClick={() => onDismiss(group)}
                disabled={isResponding || isDismissing}
              >
                {isDismissing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Ban className="h-4 w-4 mr-1" />
                    Pass
                  </>
                )}
              </Button>
            ) : null}
          </div>
        )}

        {canCancel && (
          <Button
            size="sm"
            variant="ghost"
            className="w-full text-muted-foreground"
            onClick={() => onRespond(group, "cancel")}
            disabled={isResponding}
          >
            Cancel Request
          </Button>
        )}

        <p className="text-xs text-muted-foreground">
          {format(new Date(request.created_at), "MMM d, h:mm a")}
        </p>
      </CardContent>
    </Card>
  );
}

export function SwapRequestsList() {
  const { user } = useAuth();
  const { data: requests, isLoading } = useSwapRequests();
  const { data: dismissedIds, isLoading: dismissalsLoading } = useDismissedSwapRequests();
  const { data: scheduledDates, isLoading: scheduledDatesLoading } = useUserScheduledDates(user?.id);
  const respondToRequest = useRespondToSwapRequest();
  const dismissRequest = useDismissSwapRequest();
  const [reciprocalSwapRequest, setReciprocalSwapRequest] = useState<SwapRequest | null>(null);
  const [selectedSwapDate, setSelectedSwapDate] = useState("");

  const reciprocalDateOptions = (scheduledDates || [])
    .filter((date) => date.schedule_date !== reciprocalSwapRequest?.original_date)
    .filter((date, index, dates) => dates.findIndex((entry) => entry.schedule_date === date.schedule_date) === index);

  const handleRespond = async (group: SwapRequestGroup, action: "accept" | "decline" | "cancel") => {
    const request = group.representative;
    if (action === "accept" && request.request_type === "swap" && !request.swap_date) {
      const firstAvailableDate = (scheduledDates || []).find((date) => date.schedule_date !== request.original_date);
      setSelectedSwapDate(firstAvailableDate?.schedule_date || "");
      setReciprocalSwapRequest(request);
      return;
    }

    try {
      // Weekend cover requests cover both days, so respond to every request in the group.
      await Promise.all(
        group.requests.map((r) => respondToRequest.mutateAsync({ requestId: r.id, action })),
      );
      toast.success(
        action === "accept"
          ? "Swap request accepted!"
          : action === "decline"
          ? "Swap request declined"
          : "Swap request cancelled"
      );
    } catch (error) {
      toast.error("Failed to respond to request");
      console.error(error);
    }
  };

  const handleConfirmReciprocalSwap = async () => {
    if (!reciprocalSwapRequest || !selectedSwapDate) {
      toast.error("Choose the date they will cover for you");
      return;
    }

    try {
      await respondToRequest.mutateAsync({
        requestId: reciprocalSwapRequest.id,
        action: "accept",
        swapDate: selectedSwapDate,
      });
      toast.success("Swap request accepted!");
      setReciprocalSwapRequest(null);
      setSelectedSwapDate("");
    } catch (error) {
      toast.error("Failed to respond to request");
      console.error(error);
    }
  };

  const handleDismiss = async (group: SwapRequestGroup) => {
    try {
      await Promise.all(group.requests.map((r) => dismissRequest.mutateAsync(r.id)));
    } catch (error) {
      console.error(error);
    }
  };

  if (isLoading || dismissalsLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Filter out dismissed requests from incoming
  const incomingRequests = requests?.filter(
    (r) =>
      r.status === "pending" &&
      r.requester_id !== user?.id &&
      !dismissedIds?.has(r.id)
  ) || [];

  const outgoingRequests = requests?.filter(
    (r) => r.requester_id === user?.id
  ) || [];

  const pendingOutgoing = outgoingRequests.filter((r) => r.status === "pending");
  const resolvedOutgoing = outgoingRequests.filter((r) => r.status !== "pending");

  const groupedIncoming = groupSwapRequests(incomingRequests);
  const groupedPendingOutgoing = groupSwapRequests(pendingOutgoing);
  const groupedResolvedOutgoing = groupSwapRequests(resolvedOutgoing);

  return (
    <>
      <Tabs defaultValue="incoming" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="incoming" className="relative">
            Incoming
            {groupedIncoming.length > 0 && (
              <Badge
                variant="destructive"
                className="ml-2 h-5 min-w-5 px-1.5 text-xs"
              >
                {groupedIncoming.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="outgoing">
            My Requests
            {groupedPendingOutgoing.length > 0 && (
              <Badge
                variant="secondary"
                className="ml-2 h-5 min-w-5 px-1.5 text-xs"
              >
                {groupedPendingOutgoing.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="incoming" className="mt-4 space-y-3">
          {groupedIncoming.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <ArrowLeftRight className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No incoming swap requests</p>
            </div>
          ) : (
            groupedIncoming.map((group) => (
              <SwapRequestCard
                key={group.key}
                group={group}
                currentUserId={user?.id || ""}
                onRespond={handleRespond}
                onDismiss={handleDismiss}
                isResponding={respondToRequest.isPending}
                isDismissing={dismissRequest.isPending}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="outgoing" className="mt-4 space-y-4">
          {outgoingRequests.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <ArrowLeftRight className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>You haven't made any swap requests</p>
            </div>
          ) : (
            <>
              {groupedPendingOutgoing.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground">Pending</h3>
                  {groupedPendingOutgoing.map((group) => (
                    <SwapRequestCard
                      key={group.key}
                      group={group}
                      currentUserId={user?.id || ""}
                      onRespond={handleRespond}
                      onDismiss={handleDismiss}
                      isResponding={respondToRequest.isPending}
                      isDismissing={dismissRequest.isPending}
                    />
                  ))}
                </div>
              )}
              {groupedResolvedOutgoing.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground">Past Requests</h3>
                  {groupedResolvedOutgoing.slice(0, 5).map((group) => (
                    <SwapRequestCard
                      key={group.key}
                      group={group}
                      currentUserId={user?.id || ""}
                      onRespond={handleRespond}
                      onDismiss={handleDismiss}
                      isResponding={respondToRequest.isPending}
                      isDismissing={dismissRequest.isPending}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      <Dialog
        open={!!reciprocalSwapRequest}
        onOpenChange={(open) => {
          if (!open) {
            setReciprocalSwapRequest(null);
            setSelectedSwapDate("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Choose Your Swap Date</DialogTitle>
            <DialogDescription>
              Select the date {reciprocalSwapRequest?.requester?.full_name || "they"} will cover for you.
            </DialogDescription>
          </DialogHeader>

          <Select
            value={selectedSwapDate}
            onValueChange={setSelectedSwapDate}
            disabled={scheduledDatesLoading || reciprocalDateOptions.length === 0}
          >
            <SelectTrigger>
              <SelectValue placeholder={scheduledDatesLoading ? "Loading dates..." : "Select a date"} />
            </SelectTrigger>
            <SelectContent>
              {reciprocalDateOptions.map((date) => (
                <SelectItem key={`${date.team_id}-${date.schedule_date}`} value={date.schedule_date}>
                  {formatSwapDate(date.schedule_date, isVideoPosition(reciprocalSwapRequest?.position))}
                  {date.worship_teams?.name ? ` - ${date.worship_teams.name}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {reciprocalDateOptions.length === 0 && !scheduledDatesLoading && (
            <p className="text-sm text-muted-foreground">
              You do not have an upcoming scheduled date to offer for this swap.
            </p>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setReciprocalSwapRequest(null);
                setSelectedSwapDate("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmReciprocalSwap}
              disabled={!selectedSwapDate || respondToRequest.isPending}
            >
              {respondToRequest.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Accept Swap"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
