import { format } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, X, Clock, ArrowLeftRight, Users, User, Loader2, UserPlus, Ban } from "lucide-react";
import { useSwapRequests, useRespondToSwapRequest, useDismissedSwapRequests, useDismissSwapRequest, SwapRequest } from "@/hooks/useSwapRequests";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { parseLocalDate, isWeekend, getWeekendPairDate, formatPositionLabel } from "@/lib/utils";

// Format date with weekend grouping
function formatSwapDate(dateStr: string): string {
  const isWeekendDate = isWeekend(dateStr);
  const date = parseLocalDate(dateStr);
  
  if (isWeekendDate) {
    const pairDateStr = getWeekendPairDate(dateStr);
    if (pairDateStr) {
      // Show "Jan 11 wknd" format for weekends
      const satDate = date.getDay() === 6 ? date : parseLocalDate(pairDateStr);
      return `${format(satDate, "MMM d")} wknd`;
    }
  }
  return format(date, "MMM d");
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
  request,
  currentUserId,
  onRespond,
  onDismiss,
  isResponding,
  isDismissing,
}: {
  request: SwapRequest;
  currentUserId: string;
  onRespond: (id: string, action: "accept" | "decline" | "cancel") => void;
  onDismiss: (id: string) => void;
  isResponding: boolean;
  isDismissing: boolean;
}) {
  const isRequester = request.requester_id === currentUserId;
  const isTarget = request.target_user_id === currentUserId;
  const isOpenRequest = !request.target_user_id;
  const isFillIn = request.request_type === "fill_in";
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
            <p className="font-medium">{formatSwapDate(request.original_date)}</p>
          </div>
          {request.swap_date && !isFillIn && (
            <>
              <ArrowLeftRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 rounded-lg bg-muted p-2 text-center">
                <p className="text-xs text-muted-foreground mb-1">Can play</p>
                <p className="font-medium">{formatSwapDate(request.swap_date)}</p>
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
              onClick={() => onRespond(request.id, "accept")}
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
                onClick={() => onRespond(request.id, "decline")}
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
                onClick={() => onDismiss(request.id)}
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
            onClick={() => onRespond(request.id, "cancel")}
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
  const respondToRequest = useRespondToSwapRequest();
  const dismissRequest = useDismissSwapRequest();

  const handleRespond = async (requestId: string, action: "accept" | "decline" | "cancel") => {
    try {
      await respondToRequest.mutateAsync({ requestId, action });
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

  const handleDismiss = async (requestId: string) => {
    try {
      await dismissRequest.mutateAsync(requestId);
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

  return (
    <Tabs defaultValue="incoming" className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="incoming" className="relative">
          Incoming
          {incomingRequests.length > 0 && (
            <Badge
              variant="destructive"
              className="ml-2 h-5 min-w-5 px-1.5 text-xs"
            >
              {incomingRequests.length}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="outgoing">
          My Requests
          {pendingOutgoing.length > 0 && (
            <Badge
              variant="secondary"
              className="ml-2 h-5 min-w-5 px-1.5 text-xs"
            >
              {pendingOutgoing.length}
            </Badge>
          )}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="incoming" className="mt-4 space-y-3">
        {incomingRequests.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <ArrowLeftRight className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No incoming swap requests</p>
          </div>
        ) : (
          incomingRequests.map((request) => (
            <SwapRequestCard
              key={request.id}
              request={request}
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
            {pendingOutgoing.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground">Pending</h3>
                {pendingOutgoing.map((request) => (
                  <SwapRequestCard
                    key={request.id}
                    request={request}
                    currentUserId={user?.id || ""}
                    onRespond={handleRespond}
                    onDismiss={handleDismiss}
                    isResponding={respondToRequest.isPending}
                    isDismissing={dismissRequest.isPending}
                  />
                ))}
              </div>
            )}
            {resolvedOutgoing.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground">Past Requests</h3>
                {resolvedOutgoing.slice(0, 5).map((request) => (
                  <SwapRequestCard
                    key={request.id}
                    request={request}
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
  );
}
