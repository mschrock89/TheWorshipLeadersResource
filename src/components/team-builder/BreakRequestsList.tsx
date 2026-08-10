import { useState } from "react";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Coffee, X, Check, Loader2, Clock, Pencil, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  BreakRequest,
  useCancelBreakRequest,
  useReviewBreakRequest,
} from "@/hooks/useBreakRequests";
import { DashboardBreakRequestDialog } from "@/components/dashboard/DashboardBreakRequestDialog";

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
  const [editingRequest, setEditingRequest] = useState<BreakRequest | null>(null);
  const [deletingRequest, setDeletingRequest] = useState<BreakRequest | null>(null);

  const formatBlackoutDates = (dates: string[] | null | undefined) => {
    if (!dates?.length) return null;
    return dates
      .slice()
      .sort()
      .map((date) => format(new Date(`${date}T00:00:00`), "MMM d"))
      .join(", ");
  };

  const handleDelete = async () => {
    if (!deletingRequest) return;
    await cancelRequest.mutateAsync(deletingRequest.id);
    setDeletingRequest(null);
  };

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
    <>
      <div className="space-y-3">
        {requests.map((request) => {
          const statusConfig = STATUS_CONFIG[request.status];
          const StatusIcon = statusConfig.icon;
          const canManageOwn =
            !isAdmin && (request.status === "pending" || request.status === "approved");

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
                    {request.request_scope === "blackout_dates" && request.blackout_dates?.length ? (
                      <p className="text-sm text-muted-foreground mt-1">
                        Blackout weekends: {formatBlackoutDates(request.blackout_dates)}
                      </p>
                    ) : null}
                    <p className="text-xs text-muted-foreground mt-2">
                      Submitted {format(new Date(request.created_at), "MMM d, yyyy")}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {canManageOwn && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingRequest(request)}
                        >
                          <Pencil className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeletingRequest(request)}
                          disabled={cancelRequest.isPending}
                        >
                          {cancelRequest.isPending && deletingRequest?.id === request.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                          {request.status === "pending" ? "Cancel" : "Delete"}
                        </Button>
                      </>
                    )}

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

      <DashboardBreakRequestDialog
        open={!!editingRequest}
        onOpenChange={(open) => {
          if (!open) setEditingRequest(null);
        }}
        editingRequest={editingRequest}
        initialMode={editingRequest?.request_scope === "blackout_dates" ? "blackout" : "break"}
      />

      <AlertDialog
        open={!!deletingRequest}
        onOpenChange={(open) => {
          if (!open) setDeletingRequest(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deletingRequest?.status === "pending"
                ? "Cancel this request?"
                : deletingRequest?.request_scope === "blackout_dates"
                  ? "Delete blackout dates?"
                  : "Delete break request?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deletingRequest?.status === "pending"
                ? "This removes your pending request. You can submit a new one later."
                : deletingRequest?.request_scope === "blackout_dates"
                  ? `This removes your blackout dates for ${deletingRequest.period_name || "this period"}.`
                  : `This removes your approved break for ${deletingRequest?.period_name || "this period"}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelRequest.isPending}>Keep</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleDelete();
              }}
              disabled={cancelRequest.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelRequest.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {deletingRequest?.status === "pending" ? "Cancel request" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
