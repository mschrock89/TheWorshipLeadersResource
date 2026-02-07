import { Coffee, Clock, Check, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BreakRequest, useReviewBreakRequest } from "@/hooks/useBreakRequests";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";

interface BreakRequestsWidgetProps {
  requests: BreakRequest[];
  periodName?: string;
  ministryFilter?: string;
}

const REQUEST_TYPE_LABELS = {
  need_break: "Needs Break",
  willing_break: "Willing to Break",
};

export function BreakRequestsWidget({
  requests,
  periodName,
  ministryFilter,
}: BreakRequestsWidgetProps) {
  const reviewRequest = useReviewBreakRequest();

  // Filter by ministry if specified
  const filteredRequests = ministryFilter && ministryFilter !== "all"
    ? requests.filter(r => !r.ministry_type || r.ministry_type === ministryFilter)
    : requests;

  const pendingRequests = filteredRequests.filter(r => r.status === "pending");
  const approvedRequests = filteredRequests.filter(r => r.status === "approved");
  const deniedRequests = filteredRequests.filter(r => r.status === "denied");

  const totalCount = filteredRequests.length;

  if (totalCount === 0) {
    return (
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Coffee className="h-4 w-4 text-muted-foreground" />
            <span>Break Requests</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm text-muted-foreground">
            No break requests for {periodName || "this trimester"}.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Coffee className="h-4 w-4 text-muted-foreground" />
          <span>Break Requests</span>
          <Badge variant="secondary">{totalCount}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <Tabs defaultValue="pending" className="w-full">
          <TabsList className="w-full grid grid-cols-3 h-9">
            <TabsTrigger value="pending" className="text-xs gap-1">
              <Clock className="h-3 w-3" />
              Pending
              {pendingRequests.length > 0 && (
                <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs">
                  {pendingRequests.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="approved" className="text-xs gap-1">
              <Check className="h-3 w-3" />
              Approved
              {approvedRequests.length > 0 && (
                <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs">
                  {approvedRequests.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="denied" className="text-xs gap-1">
              <X className="h-3 w-3" />
              Denied
              {deniedRequests.length > 0 && (
                <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs">
                  {deniedRequests.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="mt-3 space-y-2">
            {pendingRequests.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No pending requests.</p>
            ) : (
              pendingRequests.map(request => (
                <RequestCard
                  key={request.id}
                  request={request}
                  onApprove={() => reviewRequest.mutate({ requestId: request.id, status: "approved" })}
                  onDeny={() => reviewRequest.mutate({ requestId: request.id, status: "denied" })}
                  isLoading={reviewRequest.isPending}
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="approved" className="mt-3 space-y-2">
            {approvedRequests.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No approved requests.</p>
            ) : (
              approvedRequests.map(request => (
                <RequestCard key={request.id} request={request} />
              ))
            )}
          </TabsContent>

          <TabsContent value="denied" className="mt-3 space-y-2">
            {deniedRequests.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No denied requests.</p>
            ) : (
              deniedRequests.map(request => (
                <RequestCard key={request.id} request={request} />
              ))
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

interface RequestCardProps {
  request: BreakRequest;
  onApprove?: () => void;
  onDeny?: () => void;
  isLoading?: boolean;
}

function RequestCard({ request, onApprove, onDeny, isLoading }: RequestCardProps) {
  const requestTypeLabel = REQUEST_TYPE_LABELS[request.request_type] || request.request_type;

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border p-2.5 text-sm">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium truncate">{request.user_name}</span>
          <Badge variant="outline" className="text-xs">
            {requestTypeLabel}
          </Badge>
          {request.ministry_type && (
            <Badge variant="secondary" className="text-xs capitalize">
              {request.ministry_type}
            </Badge>
          )}
        </div>
        {request.reason && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{request.reason}</p>
        )}
        <p className="text-xs text-muted-foreground mt-1">
          {format(new Date(request.created_at), "MMM d, yyyy")}
        </p>
      </div>

      {onApprove && onDeny && (
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={onDeny}
            disabled={isLoading}
          >
            Deny
          </Button>
          <Button
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={onApprove}
            disabled={isLoading}
          >
            {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
            Approve
          </Button>
        </div>
      )}
    </div>
  );
}
