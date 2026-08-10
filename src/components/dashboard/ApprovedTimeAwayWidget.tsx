import { useState } from "react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
  useMyBreakRequests,
} from "@/hooks/useBreakRequests";
import { CalendarDays, CheckCircle2, Coffee, Loader2, Pencil, ShieldCheck, Trash2 } from "lucide-react";
import { DashboardBreakRequestDialog } from "./DashboardBreakRequestDialog";

function formatDateLabel(date: string) {
  return format(new Date(`${date}T00:00:00`), "EEE, MMM d");
}

export function ApprovedTimeAwayWidget() {
  const { data: myRequests = [], isLoading } = useMyBreakRequests();
  const cancelBreakRequest = useCancelBreakRequest();
  const [editingRequest, setEditingRequest] = useState<BreakRequest | null>(null);
  const [deletingRequest, setDeletingRequest] = useState<BreakRequest | null>(null);

  const approvedRequests = myRequests.filter((request) => request.status === "approved");
  const approvedBreakRequests = approvedRequests.filter((request) => request.request_scope !== "blackout_dates");
  const approvedBlackoutRequests = approvedRequests.filter(
    (request) => request.request_scope === "blackout_dates" && request.blackout_dates?.length,
  );

  const handleDelete = async () => {
    if (!deletingRequest) return;
    await cancelBreakRequest.mutateAsync(deletingRequest.id);
    setDeletingRequest(null);
  };

  if (isLoading) {
    return (
      <Card className="border-muted">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            Approved Time Away
          </CardTitle>
          <CardDescription>Your approved breaks and blackout dates</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (approvedRequests.length === 0) {
    return (
      <Card className="border-muted">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            Approved Time Away
          </CardTitle>
          <CardDescription>Your approved breaks and blackout dates</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <CheckCircle2 className="h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">
              You don&apos;t have any approved break requests or blackout dates yet.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="border-muted">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              Approved Time Away
            </CardTitle>
            <Badge variant="secondary">{approvedRequests.length}</Badge>
          </div>
          <CardDescription>Your approved breaks and blackout dates — edit or remove anytime</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {approvedBreakRequests.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Coffee className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">Approved Break Requests</p>
              </div>

              <div className="space-y-2">
                {approvedBreakRequests.map((request) => {
                  const isWillingBreak = request.request_type === "willing_break";

                  return (
                    <div key={request.id} className="rounded-xl border bg-card/60 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="secondary">{request.period_name || "Rotation Period"}</Badge>
                            <Badge variant="outline">
                              {isWillingBreak ? "Willing break" : "Needs break"}
                            </Badge>
                          </div>

                          {request.reason ? (
                            <p className="mt-2 text-sm text-muted-foreground">{request.reason}</p>
                          ) : null}

                          <p className="mt-2 text-xs text-muted-foreground">
                            Approved request submitted {format(new Date(request.created_at), "MMM d, yyyy")}
                          </p>
                        </div>

                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground"
                            onClick={() => setEditingRequest(request)}
                            aria-label="Edit break request"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => setDeletingRequest(request)}
                            aria-label="Delete break request"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {approvedBlackoutRequests.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">Approved Blackout Dates</p>
              </div>

              <div className="space-y-2">
                {approvedBlackoutRequests.map((request) => (
                  <div key={request.id} className="rounded-xl border bg-card/60 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary">{request.period_name || "Rotation Period"}</Badge>
                          <Badge variant="outline">
                            {request.blackout_dates?.length || 0} blackout dates
                          </Badge>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {request.blackout_dates
                            ?.slice()
                            .sort()
                            .map((date) => (
                              <Badge key={date} variant="outline" className="bg-background">
                                {formatDateLabel(date)}
                              </Badge>
                            ))}
                        </div>

                        {request.reason ? (
                          <p className="mt-2 text-sm text-muted-foreground">{request.reason}</p>
                        ) : null}
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground"
                          onClick={() => setEditingRequest(request)}
                          aria-label="Edit blackout dates"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => setDeletingRequest(request)}
                          aria-label="Delete blackout dates"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

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
              {deletingRequest?.request_scope === "blackout_dates"
                ? "Delete blackout dates?"
                : "Delete break request?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deletingRequest?.request_scope === "blackout_dates"
                ? `This removes your blackout dates for ${deletingRequest.period_name || "this period"}. You can add new dates later.`
                : `This removes your approved break for ${deletingRequest?.period_name || "this period"}. You may be scheduled again after it is deleted.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelBreakRequest.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleDelete();
              }}
              disabled={cancelBreakRequest.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelBreakRequest.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
