import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Check, CheckCircle2, Clock, Loader2, Megaphone, X } from "lucide-react";
import { toast } from "sonner";
import { RefreshableContainer } from "@/components/layout/RefreshableContainer";
import { SendGapRequestDialog } from "@/components/gaps/SendGapRequestDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { useCapabilities } from "@/hooks/useCapabilities";
import {
  type GapRecipient,
  type GapRequest,
  isGapRequestClosed,
  useGapRequests,
  useRespondToGapRequest,
} from "@/hooks/useGapRequests";
import { CAPABILITIES } from "@/lib/capabilities";
import { getMinistryLabel, POSITION_SLOTS } from "@/lib/constants";
import { formatGapDates, formatGapPosition, gapRequestDates } from "@/lib/gapRequests";

function StatusBadge({ request }: { request: GapRequest }) {
  if (request.status === "filled") {
    return (
      <Badge variant="secondary" className="gap-1 text-xs">
        <CheckCircle2 className="h-3 w-3" />
        Filled
      </Badge>
    );
  }
  if (request.status === "cancelled") {
    return (
      <Badge variant="outline" className="text-xs text-muted-foreground">
        Cancelled
      </Badge>
    );
  }
  if (isGapRequestClosed(request)) {
    return (
      <Badge variant="outline" className="text-xs text-muted-foreground">
        Past
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 border-amber-300 text-xs text-amber-700 dark:border-amber-700 dark:text-amber-300">
      <Clock className="h-3 w-3" />
      Open
    </Badge>
  );
}

function slotLabel(request: GapRequest) {
  return POSITION_SLOTS.find((slot) => slot.slot === request.position_slot)?.label || formatGapPosition(request.position);
}

function GapSummary({ request }: { request: GapRequest }) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">{formatGapPosition(request.position)}</h3>
        {slotLabel(request) !== formatGapPosition(request.position) && (
          <Badge variant="outline" className="text-xs">
            {slotLabel(request)}
          </Badge>
        )}
        <StatusBadge request={request} />
      </div>
      <p className="mt-0.5 text-sm text-foreground">
        {formatGapDates(gapRequestDates(request), request.covers_weekend_pair ? "EEE, MMM d" : "EEEE, MMMM d")}
      </p>
      <p className="text-xs text-muted-foreground">
        {[request.campus_name, getMinistryLabel(request.ministry_type)].filter(Boolean).join(" · ")}
        {request.sender?.full_name ? ` · from ${request.sender.full_name}` : ""}
      </p>
      {request.message && <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{request.message}</p>}
    </div>
  );
}

function InviteCard({ request, highlighted }: { request: GapRequest; highlighted?: boolean }) {
  const { user } = useAuth();
  const respond = useRespondToGapRequest();
  const closed = isGapRequestClosed(request);
  const confirmedMe = request.status === "filled" && request.filled_by_user_id === user?.id;
  const senderFirstName = request.sender?.full_name?.split(" ")[0] || "Your pastor";

  const answer = (action: "yes" | "no") =>
    respond.mutate(
      { gapRequestId: request.id, action },
      {
        onSuccess: () =>
          toast.success(
            action === "yes"
              ? `Thanks! ${senderFirstName} will let you know if you're approved.`
              : "Got it, thanks for letting us know.",
          ),
        onError: (error) => toast.error(error.message),
      },
    );

  return (
    <Card className={highlighted ? "border-primary ring-1 ring-primary" : undefined}>
      <CardContent className="space-y-3 p-4">
        <GapSummary request={request} />

        {confirmedMe ? (
          <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
            You're approved and on the schedule. Thank you for serving!
          </p>
        ) : closed ? (
          <p className="text-sm text-muted-foreground">
            {request.status === "filled"
              ? "This spot has been filled. Thanks for being available!"
              : request.status === "cancelled"
                ? "This request was cancelled."
                : "This date has passed."}
          </p>
        ) : (
          <>
            {request.my_response === "yes" && (
              <p className="text-sm text-muted-foreground">
                You said yes. Waiting on {senderFirstName} to approve. More than one person may have offered.
              </p>
            )}
            {request.my_response === "no" && (
              <p className="text-sm text-muted-foreground">You said you can't serve. You can change your answer.</p>
            )}
            <div className="flex gap-2">
              <Button
                className="flex-1 gap-1.5"
                variant={request.my_response === "yes" ? "default" : "outline"}
                disabled={respond.isPending}
                onClick={() => answer("yes")}
              >
                {respond.isPending && respond.variables?.action === "yes" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Yes, I can serve
              </Button>
              <Button
                className="flex-1 gap-1.5"
                variant={request.my_response === "no" ? "secondary" : "outline"}
                disabled={respond.isPending}
                onClick={() => answer("no")}
              >
                {respond.isPending && respond.variables?.action === "no" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <X className="h-4 w-4" />
                )}
                No, I can't
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function RecipientRow({
  recipient,
  action,
}: {
  recipient: GapRecipient;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <span className="truncate text-sm">{recipient.profile?.full_name || "Unknown"}</span>
      {action}
    </div>
  );
}

function ManageCard({ request, highlighted }: { request: GapRequest; highlighted?: boolean }) {
  const respond = useRespondToGapRequest();
  const [showOthers, setShowOthers] = useState(false);
  const closed = isGapRequestClosed(request);

  const yes = request.recipients.filter((recipient) => recipient.response === "yes");
  const no = request.recipients.filter((recipient) => recipient.response === "no");
  const pending = request.recipients.filter((recipient) => recipient.response === "pending");
  const filledBy = request.recipients.find((recipient) => recipient.user_id === request.filled_by_user_id);

  const approve = (recipient: GapRecipient) => {
    const name = recipient.profile?.full_name || "this volunteer";
    const when = formatGapDates(gapRequestDates(request));
    const others = yes.length > 1 ? ` The other ${yes.length - 1} who said yes will be told the spot is filled.` : "";
    if (
      !window.confirm(
        `Approve ${name} for ${slotLabel(request)} on ${when}? They'll replace whoever is in that slot on the scheduled team's roster.${others}`,
      )
    ) {
      return;
    }
    respond.mutate(
      { gapRequestId: request.id, action: "confirm", userId: recipient.user_id },
      {
        onSuccess: (result) => {
          if (result?.scheduleError) {
            toast.warning(`${name} is approved`, { description: result.scheduleError });
          } else {
            toast.success(
              `${name} added to ${result?.teamName || "the team"} for ${formatGapDates(result?.slottedDates || [])}`,
            );
          }
        },
        onError: (error) => toast.error(error.message),
      },
    );
  };

  const cancel = () => {
    if (!window.confirm("Cancel this gap request? Anyone who said yes will be told they're not needed.")) return;
    respond.mutate(
      { gapRequestId: request.id, action: "cancel" },
      {
        onSuccess: () => toast.success("Gap request cancelled"),
        onError: (error) => toast.error(error.message),
      },
    );
  };

  return (
    <Card className={highlighted ? "border-primary ring-1 ring-primary" : undefined}>
      <CardContent className="space-y-3 p-4">
        <GapSummary request={request} />

        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="secondary">{yes.length} yes</Badge>
          <Badge variant="outline">{no.length} no</Badge>
          <Badge variant="outline">{pending.length} waiting</Badge>
        </div>

        {request.status === "filled" && filledBy && (
          <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
            Filled by {filledBy.profile?.full_name || "a volunteer"}
            {request.slotted_dates.length > 0 && (
              <span className="block text-xs font-normal">
                Added to the roster for {formatGapDates(request.slotted_dates)}
              </span>
            )}
          </p>
        )}
        {request.status === "filled" && request.slotted_dates.length === 0 && (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            They weren't added to a roster automatically. Add them in Team Builder.
          </p>
        )}

        {yes.length > 0 && (
          <div className="rounded-lg border p-2">
            <p className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {closed ? "Said yes" : "Said yes · waiting on your approval"}
            </p>
            <div className="divide-y px-1">
              {yes.map((recipient) => (
                <RecipientRow
                  key={recipient.id}
                  recipient={recipient}
                  action={
                    !closed && (
                      <Button size="sm" className="h-7 gap-1" disabled={respond.isPending} onClick={() => approve(recipient)}>
                        <Check className="h-3.5 w-3.5" />
                        Approve
                      </Button>
                    )
                  }
                />
              ))}
            </div>
          </div>
        )}

        {(no.length > 0 || pending.length > 0) && (
          <div>
            <Button variant="link" size="sm" className="h-auto px-0" onClick={() => setShowOthers((value) => !value)}>
              {showOthers ? "Hide" : "Show"} everyone else ({no.length + pending.length})
            </Button>
            {showOthers && (
              <div className="mt-1 divide-y rounded-lg border px-3 py-1">
                {[...no, ...pending].map((recipient) => (
                  <RecipientRow
                    key={recipient.id}
                    recipient={recipient}
                    action={
                      <span className="text-xs text-muted-foreground">
                        {recipient.response === "no" ? "Can't serve" : "No answer yet"}
                      </span>
                    }
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {!closed && (
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" className="text-muted-foreground" disabled={respond.isPending} onClick={cancel}>
              Cancel request
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{children}</p>;
}

function sortOpenFirst(requests: GapRequest[]) {
  return [...requests].sort((a, b) => {
    const aClosed = isGapRequestClosed(a) ? 1 : 0;
    const bClosed = isGapRequestClosed(b) ? 1 : 0;
    if (aClosed !== bClosed) return aClosed - bClosed;
    return aClosed ? b.schedule_date.localeCompare(a.schedule_date) : a.schedule_date.localeCompare(b.schedule_date);
  });
}

export default function GapRequests() {
  const { id: focusedId } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { can } = useCapabilities();
  const { data: requests = [], isLoading } = useGapRequests();
  const respond = useRespondToGapRequest();
  const [sendOpen, setSendOpen] = useState(false);
  const handledRespondParam = useRef(false);

  const canSend = can(CAPABILITIES.MANAGE_TEAM) || can(CAPABILITIES.ADMIN_FULL);
  const invites = useMemo(() => sortOpenFirst(requests.filter((request) => request.my_response !== null)), [requests]);
  const managed = useMemo(() => sortOpenFirst(requests.filter((request) => request.can_manage)), [requests]);
  const focused = focusedId ? requests.find((request) => request.id === focusedId) : undefined;

  // Yes / No buttons on the push open /gaps/:id?respond=yes|no; record that answer once.
  useEffect(() => {
    const answer = searchParams.get("respond");
    if (handledRespondParam.current || !focused || (answer !== "yes" && answer !== "no")) return;
    handledRespondParam.current = true;
    setSearchParams({}, { replace: true });

    if (focused.my_response === null) return;
    if (isGapRequestClosed(focused)) {
      toast.info(focused.status === "filled" ? "This spot has already been filled. Thank you!" : "This request is closed.");
      return;
    }
    respond.mutate(
      { gapRequestId: focused.id, action: answer },
      {
        onSuccess: () =>
          toast.success(answer === "yes" ? "Thanks! You said yes. You'll hear back if you're approved." : "Got it, thanks for letting us know."),
        onError: (error) => toast.error(error.message),
      },
    );
  }, [focused, respond, searchParams, setSearchParams]);

  const defaultTab = invites.some((request) => !isGapRequestClosed(request)) || !canSend ? "invites" : "sent";

  return (
    <RefreshableContainer queryKeys={[["gap-requests"]]}>
      <div className="container mx-auto max-w-2xl px-4 py-6">
        {focusedId && (
          <Button asChild variant="ghost" className="mb-3 -ml-2 gap-2 text-muted-foreground hover:text-foreground">
            <Link to="/gaps">
              <ArrowLeft className="h-4 w-4" />
              All gap requests
            </Link>
          </Button>
        )}

        <div className="mb-6 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-primary/10 p-2">
              <Megaphone className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Gap Requests</h1>
              <p className="text-sm text-muted-foreground">Open spots that need someone to step in</p>
            </div>
          </div>
          {canSend && (
            <Button className="shrink-0 gap-1.5" onClick={() => setSendOpen(true)}>
              <Megaphone className="h-4 w-4" />
              <span className="hidden sm:inline">Send Gap Request</span>
              <span className="sm:hidden">Send</span>
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-36 w-full" />
            <Skeleton className="h-36 w-full" />
          </div>
        ) : focusedId ? (
          focused ? (
            focused.can_manage && focused.my_response === null ? (
              <ManageCard request={focused} highlighted />
            ) : (
              <InviteCard request={focused} highlighted />
            )
          ) : (
            <EmptyState>This gap request is no longer available.</EmptyState>
          )
        ) : canSend ? (
          <Tabs defaultValue={defaultTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="invites">Asked of me</TabsTrigger>
              <TabsTrigger value="sent">Sent</TabsTrigger>
            </TabsList>
            <TabsContent value="invites" className="space-y-3">
              {invites.length === 0 ? (
                <EmptyState>No one has asked you to fill a gap.</EmptyState>
              ) : (
                invites.map((request) => <InviteCard key={request.id} request={request} />)
              )}
            </TabsContent>
            <TabsContent value="sent" className="space-y-3">
              {managed.length === 0 ? (
                <EmptyState>
                  Nothing sent yet. When a regular volunteer can't cover a date, send a gap request to everyone in that
                  position.
                </EmptyState>
              ) : (
                managed.map((request) => <ManageCard key={request.id} request={request} />)
              )}
            </TabsContent>
          </Tabs>
        ) : invites.length === 0 ? (
          <EmptyState>No one has asked you to fill a gap.</EmptyState>
        ) : (
          <div className="space-y-3">
            {invites.map((request) => (
              <InviteCard key={request.id} request={request} />
            ))}
          </div>
        )}
      </div>

      {canSend && <SendGapRequestDialog open={sendOpen} onOpenChange={setSendOpen} />}
    </RefreshableContainer>
  );
}
