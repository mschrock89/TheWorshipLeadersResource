import { useState } from "react";
import { format } from "date-fns";
import { Coffee, X, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useMyBreakRequests, useCancelBreakRequest } from "@/hooks/useBreakRequests";
import { DashboardBreakRequestDialog } from "./DashboardBreakRequestDialog";

export function BreakRequestWidget() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"break" | "blackout">("break");
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const { data: myRequests = [], isLoading } = useMyBreakRequests();
  const cancelBreakRequest = useCancelBreakRequest();

  const pendingRequests = myRequests.filter((r) => r.status === "pending");

  const formatBlackoutSummary = (dates: string[] | null | undefined) => {
    if (!dates?.length) return null;
    const sortedDates = dates.slice().sort();
    const preview = sortedDates.slice(0, 2).map((date) => format(new Date(`${date}T00:00:00`), "MMM d"));
    return sortedDates.length > 2
      ? `${preview.join(", ")} +${sortedDates.length - 2} more`
      : preview.join(", ");
  };

  const handleCancel = async (requestId: string) => {
    setCancellingId(requestId);
    try {
      await cancelBreakRequest.mutateAsync(requestId);
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <>
      <Card className="border-muted">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Coffee className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Need a Break?</CardTitle>
          </div>
          <CardDescription>
            Request time off from your scheduled rotation or add blackout dates
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Show pending requests */}
          {pendingRequests.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">
                Pending Requests
              </p>
              <div className="flex flex-col gap-2">
                {pendingRequests.map((req) => {
                  const isBlackoutRequest = req.request_scope === "blackout_dates";
                  const isWillingBreak = req.request_type === "willing_break";

                  return (
                    <div
                      key={req.id}
                      className="flex items-center justify-between gap-2 rounded-md border bg-muted/50 px-3 py-2"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary" className="text-xs">
                            {req.period_name || "Unknown Period"}
                          </Badge>
                          {isBlackoutRequest ? (
                            <Badge variant="outline" className="text-xs">
                              {req.blackout_dates?.length || 0} blackout dates
                            </Badge>
                          ) : null}
                          {isWillingBreak ? (
                            <span className="text-xs text-muted-foreground">(Willing)</span>
                          ) : null}
                        </div>
                        {isBlackoutRequest ? (
                          <p className="text-xs text-muted-foreground">
                            {formatBlackoutSummary(req.blackout_dates)}
                          </p>
                        ) : null}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={() => handleCancel(req.id)}
                        disabled={cancellingId === req.id}
                      >
                        {cancellingId === req.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <X className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              onClick={() => {
                setDialogMode("break");
                setDialogOpen(true);
              }}
              variant="outline"
              className="w-full"
            >
              <Coffee className="mr-2 h-4 w-4" />
              Request Break
            </Button>
            <Button
              onClick={() => {
                setDialogMode("blackout");
                setDialogOpen(true);
              }}
              variant="outline"
              className="w-full"
            >
              Blackout Dates
            </Button>
          </div>
        </CardContent>
      </Card>

      <DashboardBreakRequestDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initialMode={dialogMode}
      />
    </>
  );
}
