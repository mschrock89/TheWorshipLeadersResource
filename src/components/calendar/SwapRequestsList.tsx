import { useState } from "react";
import { format } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
import { Check, X, Clock, ArrowLeftRight, Users, User, Loader2, UserPlus, Ban, Trash2, Pencil } from "lucide-react";
import {
  useDeleteSwapRequest,
  useOpenRequestRecipients,
  usePositionMembersForDate,
  useSwapRequests,
  useRespondToSwapRequest,
  useDismissedSwapRequests,
  useDismissSwapRequest,
  useUpdateSwapParticipants,
  useUserScheduledDates,
  SwapParticipantRole,
  SwapRequest,
} from "@/hooks/useSwapRequests";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { toast } from "sonner";
import { parseLocalDate, isWeekend, getWeekendPairDate, getWeekendKey, formatPositionLabel } from "@/lib/utils";
import { isVideoPosition } from "@/lib/constants";
import { getCurrentResourceAppKey, hasStudentAppAdminRole } from "@/lib/resourceApp";

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

interface SwapParticipantEdit {
  group: SwapRequestGroup;
  participantRole: SwapParticipantRole;
}

interface ParticipantCandidate {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
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
  onDelete,
  onEditParticipant,
  isResponding,
  isDismissing,
  isDeleting,
  managementMode = false,
}: {
  group: SwapRequestGroup;
  currentUserId: string;
  onRespond: (group: SwapRequestGroup, action: "accept" | "decline" | "cancel") => void;
  onDismiss: (group: SwapRequestGroup) => void;
  onDelete?: (group: SwapRequestGroup) => void;
  onEditParticipant?: (group: SwapRequestGroup, participantRole: SwapParticipantRole) => void;
  isResponding: boolean;
  isDismissing: boolean;
  isDeleting?: boolean;
  managementMode?: boolean;
}) {
  const request = group.representative;
  const isRequester = request.requester_id === currentUserId;
  const isTarget = request.target_user_id === currentUserId;
  const isOpenRequest = !request.target_user_id;
  const isFillIn = request.request_type === "fill_in";
  const isDateSpecific = isVideoPosition(request.position);
  const canAccept = !managementMode && !isRequester && request.status === "pending";
  const canCancel = !managementMode && isRequester && request.status === "pending";
  const counterpart = request.accepted_by || request.target_user;
  const counterpartLabel = request.accepted_by
    ? isFillIn
      ? "Covered by"
      : "Accepted by"
    : request.target_user
      ? isFillIn
        ? "Requested from"
        : "Swap with"
      : "Open request";

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
          <div className="min-w-0">
            <div>
              <CardTitle className="text-base">
                {formatPositionLabel(request.position)} {isFillIn ? "Cover Request" : "Swap Request"}
              </CardTitle>
              <CardDescription className="flex items-center gap-1">
                {isFillIn ? (
                  <>
                    <UserPlus className="h-3 w-3" />
                    {isOpenRequest ? "Open cover request" : "Direct cover"}
                  </>
                ) : isOpenRequest ? (
                  <>
                    <Users className="h-3 w-3" />
                    Open swap request
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
          <div className="flex shrink-0 items-center gap-1">
            <Badge variant="outline" className={statusColors[request.status]}>
              {request.status === "pending" && <Clock className="h-3 w-3 mr-1" />}
              {request.status === "accepted" && <Check className="h-3 w-3 mr-1" />}
              {request.status === "declined" && <X className="h-3 w-3 mr-1" />}
              {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
            </Badge>
            {onDelete && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={isDeleting}
                    aria-label={`Delete swap request from ${request.requester?.full_name || "unknown user"}`}
                  >
                    {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Swap Request</AlertDialogTitle>
                    <AlertDialogDescription>
                      Permanently delete {group.requests.length > 1 ? "these grouped requests" : "this request"} from{" "}
                      <strong>{request.requester?.full_name || "Unknown user"}</strong>?
                      {request.status === "accepted" && (
                        <span className="mt-2 block text-amber-600 dark:text-amber-400">
                          This will revert the schedule to the original assignment.
                        </span>
                      )}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => onDelete(group)}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-lg border bg-muted/30 p-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarImage src={request.requester?.avatar_url || ""} />
              <AvatarFallback className="text-xs">{getInitials(request.requester?.full_name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground">Requested by</p>
              <p className="truncate text-sm font-medium">{request.requester?.full_name || "Unknown user"}</p>
            </div>
            {onEditParticipant && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="ml-auto h-7 w-7 shrink-0"
                onClick={() => onEditParticipant(group, "requester")}
                aria-label={`Change requester from ${request.requester?.full_name || "unknown user"}`}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <ArrowLeftRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          {counterpart ? (
            <div className="flex min-w-0 items-center gap-2">
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarImage src={counterpart.avatar_url || ""} />
                <AvatarFallback className="text-xs">{getInitials(counterpart.full_name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground">{counterpartLabel}</p>
                <p className="truncate text-sm font-medium">{counterpart.full_name || "Unknown user"}</p>
              </div>
              {onEditParticipant && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="ml-auto h-7 w-7 shrink-0"
                  onClick={() => onEditParticipant(group, "counterpart")}
                  aria-label={`Change ${counterpartLabel.toLowerCase()} from ${counterpart.full_name || "unknown user"}`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ) : (
            <div className="flex min-w-0 items-center gap-2">
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground">{counterpartLabel}</p>
                <p className="truncate text-sm font-medium">Anyone eligible</p>
              </div>
              {onEditParticipant && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="ml-auto h-7 w-7 shrink-0"
                  onClick={() => onEditParticipant(group, "counterpart")}
                  aria-label="Assign a user to this open request"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          )}
        </div>

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
  const { data: userRoles = [] } = useUserRoles(user?.id);
  const { data: requests, isLoading } = useSwapRequests();
  const { data: dismissedIds, isLoading: dismissalsLoading } = useDismissedSwapRequests();
  const { data: scheduledDates, isLoading: scheduledDatesLoading } = useUserScheduledDates(user?.id);
  const respondToRequest = useRespondToSwapRequest();
  const dismissRequest = useDismissSwapRequest();
  const deleteRequest = useDeleteSwapRequest();
  const updateParticipants = useUpdateSwapParticipants();
  const [deletingGroupKey, setDeletingGroupKey] = useState<string | null>(null);
  const [participantEdit, setParticipantEdit] = useState<SwapParticipantEdit | null>(null);
  const [selectedParticipantId, setSelectedParticipantId] = useState("");
  const [reciprocalSwapRequest, setReciprocalSwapRequest] = useState<SwapRequest | null>(null);
  const [selectedSwapDate, setSelectedSwapDate] = useState("");
  const roleNames = userRoles.map(({ role }) => role);
  const canDeleteRequests =
    roleNames.some((role) =>
      ["admin", "campus_admin", "campus_worship_pastor", "video_director", "production_manager"].includes(role),
    ) || hasStudentAppAdminRole(roleNames, getCurrentResourceAppKey());
  const participantEditRequest = participantEdit?.group.representative;
  const isEditingRequester = participantEdit?.participantRole === "requester";
  const isEditingCounterpart = participantEdit?.participantRole === "counterpart";
  const currentParticipantId = isEditingRequester
    ? participantEditRequest?.requester_id
    : participantEditRequest?.accepted_by_id || participantEditRequest?.target_user_id || undefined;
  const participantEditLabel = isEditingRequester
    ? "Requester"
    : participantEditRequest?.status === "accepted"
      ? participantEditRequest.request_type === "fill_in"
        ? "Covering User"
        : "Swap Partner"
      : "Requested User";

  const {
    data: originalDateMembers = [],
    isLoading: originalDateMembersLoading,
  } = usePositionMembersForDate(
    participantEditRequest?.position || "",
    isEditingRequester ? participantEditRequest?.original_date : undefined,
  );
  const {
    data: eligibleCounterparts = [],
    isLoading: eligibleCounterpartsLoading,
  } = useOpenRequestRecipients(
    participantEditRequest?.position,
    participantEditRequest?.requester_id,
    undefined,
    undefined,
    undefined,
    true,
    true,
    isEditingCounterpart,
  );
  const {
    data: reciprocalDateMembers = [],
    isLoading: reciprocalDateMembersLoading,
  } = usePositionMembersForDate(
    participantEditRequest?.position || "",
    isEditingCounterpart && participantEditRequest?.request_type === "swap"
      ? participantEditRequest.swap_date || undefined
      : undefined,
    participantEditRequest?.requester_id,
  );

  const currentCounterpart = participantEditRequest?.accepted_by || participantEditRequest?.target_user;
  const currentParticipant = isEditingRequester ? participantEditRequest?.requester : currentCounterpart;
  const otherParticipantId = isEditingRequester
    ? currentCounterpart?.id
    : participantEditRequest?.requester_id;
  const eligibleCounterpartIds = new Set(eligibleCounterparts.map((candidate) => candidate.id));
  const participantCandidatesById = new Map<string, ParticipantCandidate>();

  if (isEditingRequester && participantEditRequest) {
    originalDateMembers
      .filter((member) => member.user_id && member.team_id === participantEditRequest.team_id)
      .forEach((member) => {
        participantCandidatesById.set(member.user_id!, {
          id: member.user_id!,
          full_name: member.member_name,
          avatar_url: null,
        });
      });
  } else if (isEditingCounterpart && participantEditRequest) {
    if (participantEditRequest.request_type === "swap" && participantEditRequest.swap_date) {
      reciprocalDateMembers
        .filter((member) => member.user_id && eligibleCounterpartIds.has(member.user_id))
        .forEach((member) => {
          participantCandidatesById.set(member.user_id!, {
            id: member.user_id!,
            full_name: member.member_name,
            avatar_url: null,
          });
        });
    } else {
      eligibleCounterparts.forEach((candidate) => {
        participantCandidatesById.set(candidate.id, {
          id: candidate.id,
          full_name: candidate.full_name,
          avatar_url: candidate.avatar_url,
        });
      });
    }
  }

  if (currentParticipant) {
    participantCandidatesById.set(currentParticipant.id, currentParticipant);
  }

  const participantCandidates = [...participantCandidatesById.values()]
    .filter((candidate) => candidate.id !== otherParticipantId)
    .sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
  const participantCandidatesLoading = isEditingRequester
    ? originalDateMembersLoading
    : eligibleCounterpartsLoading ||
      (participantEditRequest?.request_type === "swap" && !!participantEditRequest.swap_date && reciprocalDateMembersLoading);

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

  const handleDelete = async (group: SwapRequestGroup) => {
    setDeletingGroupKey(group.key);
    try {
      await deleteRequest.mutateAsync(group.requests.map((request) => request.id));
    } finally {
      setDeletingGroupKey(null);
    }
  };

  const handleOpenParticipantEdit = (group: SwapRequestGroup, participantRole: SwapParticipantRole) => {
    const request = group.representative;
    const currentId = participantRole === "requester"
      ? request.requester_id
      : request.accepted_by_id || request.target_user_id || "";
    setSelectedParticipantId(currentId);
    setParticipantEdit({ group, participantRole });
  };

  const handleSaveParticipant = async () => {
    if (!participantEdit || !selectedParticipantId) return;

    try {
      await updateParticipants.mutateAsync({
        requestIds: participantEdit.group.requests.map((request) => request.id),
        participantRole: participantEdit.participantRole,
        userId: selectedParticipantId,
      });
      setParticipantEdit(null);
      setSelectedParticipantId("");
    } catch {
      // The mutation provides the user-facing error message.
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
  const groupedManageable = groupSwapRequests(requests || []);

  return (
    <>
      <Tabs defaultValue="incoming" className="w-full">
        <TabsList className={`grid w-full ${canDeleteRequests ? "grid-cols-3" : "grid-cols-2"}`}>
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
          {canDeleteRequests && (
            <TabsTrigger value="manage">
              Manage
              {groupedManageable.length > 0 && (
                <Badge variant="secondary" className="ml-2 h-5 min-w-5 px-1.5 text-xs">
                  {groupedManageable.length}
                </Badge>
              )}
            </TabsTrigger>
          )}
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

        {canDeleteRequests && (
          <TabsContent value="manage" className="mt-4 space-y-3">
            {groupedManageable.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                <ArrowLeftRight className="mx-auto mb-2 h-8 w-8 opacity-50" />
                <p>No swap requests to manage</p>
              </div>
            ) : (
              groupedManageable.map((group) => (
                <SwapRequestCard
                  key={group.key}
                  group={group}
                  currentUserId={user?.id || ""}
                  onRespond={handleRespond}
                  onDismiss={handleDismiss}
                  onDelete={handleDelete}
                  onEditParticipant={handleOpenParticipantEdit}
                  isResponding={respondToRequest.isPending}
                  isDismissing={dismissRequest.isPending}
                  isDeleting={deletingGroupKey === group.key}
                  managementMode
                />
              ))
            )}
          </TabsContent>
        )}

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

      <Dialog
        open={!!participantEdit}
        onOpenChange={(open) => {
          if (!open) {
            setParticipantEdit(null);
            setSelectedParticipantId("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Change {participantEditLabel}
            </DialogTitle>
            <DialogDescription>
              Select an eligible {formatPositionLabel(participantEditRequest?.position || "team member")}. This will
              update {participantEdit?.group.requests.length === 1 ? "the request" : "both grouped weekend requests"}
              {participantEditRequest?.status === "accepted" ? " and the active schedule" : ""}.
            </DialogDescription>
          </DialogHeader>

          <Command className="rounded-md border">
            <CommandInput placeholder="Search team members..." />
            <CommandList>
              <CommandEmpty>
                {participantCandidatesLoading ? "Loading eligible team members..." : "No eligible team members found."}
              </CommandEmpty>
              <CommandGroup>
                {participantCandidates.map((candidate) => (
                  <CommandItem
                    key={candidate.id}
                    value={`${candidate.full_name || "Unknown user"} ${candidate.id}`}
                    onSelect={() => setSelectedParticipantId(candidate.id)}
                  >
                    <Avatar className="mr-2 h-7 w-7">
                      <AvatarImage src={candidate.avatar_url || ""} />
                      <AvatarFallback className="text-[10px]">{getInitials(candidate.full_name)}</AvatarFallback>
                    </Avatar>
                    <span className="truncate">{candidate.full_name || "Unknown user"}</span>
                    <Check
                      className={`ml-auto h-4 w-4 ${selectedParticipantId === candidate.id ? "opacity-100" : "opacity-0"}`}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setParticipantEdit(null);
                setSelectedParticipantId("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveParticipant}
              disabled={
                !selectedParticipantId ||
                selectedParticipantId === currentParticipantId ||
                updateParticipants.isPending
              }
            >
              {updateParticipants.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Change"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
