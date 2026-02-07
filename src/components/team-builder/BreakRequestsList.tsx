import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Coffee, X, Check, Loader2, Clock } from "lucide-react";
import {
  BreakRequest,
  useCancelBreakRequest,
  useReviewBreakRequest,
} from "@/hooks/useBreakRequests";

interface BreakRequestsListProps {
  requests: BreakRequest[];
  isAdmin?: boolean;
  emptyMessage?: string;
}

const STATUS_CONFIG = {
  pending: {
    label: "Pending",
    variant: "secondary" as const,
    icon: Clock,
  },
  approved: {
    label: "Approved",
    variant: "default" as const,
    icon: Check,
  },
  denied: {
    label: "Denied",
    variant: "destructive" as const,
    icon: X,
  },
};

export function BreakRequestsList({
  requests,
  isAdmin = false,
  emptyMessage = "No break requests",
}: BreakRequestsListProps) {
  const cancelRequest = useCancelBreakRequest();
  const reviewRequest = useReviewBreakRequest();

  if (requests.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-8 text-center">
          <Coffee className="h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {requests.map((request) => {
        const statusConfig = STATUS_CONFIG[request.status];
        const StatusIcon = statusConfig.icon;

        return (
          <Card key={request.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {isAdmin && request.user_name && (
                      <span className="font-medium truncate">
                        {request.user_name}
                      </span>
                    )}
                    <span className="text-sm text-muted-foreground">
                      {request.period_name || "Trimester"}
                    </span>
                    <Badge variant={statusConfig.variant} className="gap-1">
                      <StatusIcon className="h-3 w-3" />
                      {statusConfig.label}
                    </Badge>
                  </div>
                  {request.reason && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {request.reason}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">
                    Submitted {format(new Date(request.created_at), "MMM d, yyyy")}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {/* User can cancel pending requests */}
                  {!isAdmin && request.status === "pending" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => cancelRequest.mutate(request.id)}
                      disabled={cancelRequest.isPending}
                    >
                      {cancelRequest.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <X className="h-4 w-4" />
                      )}
                      Cancel
                    </Button>
                  )}

                  {/* Admin can approve/deny pending requests */}
                  {isAdmin && request.status === "pending" && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          reviewRequest.mutate({
                            requestId: request.id,
                            status: "denied",
                          })
                        }
                        disabled={reviewRequest.isPending}
                      >
                        Deny
                      </Button>
                      <Button
                        size="sm"
                        onClick={() =>
                          reviewRequest.mutate({
                            requestId: request.id,
                            status: "approved",
                          })
                        }
                        disabled={reviewRequest.isPending}
                      >
                        {reviewRequest.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4 mr-1" />
                        )}
                        Approve
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
