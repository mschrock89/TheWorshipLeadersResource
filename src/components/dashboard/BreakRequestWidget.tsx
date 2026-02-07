import { useState } from "react";
import { Coffee, X, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useMyBreakRequests, useCancelBreakRequest } from "@/hooks/useBreakRequests";
import { DashboardBreakRequestDialog } from "./DashboardBreakRequestDialog";

export function BreakRequestWidget() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const { data: myRequests = [], isLoading } = useMyBreakRequests();
  const cancelBreakRequest = useCancelBreakRequest();

  const pendingRequests = myRequests.filter((r) => r.status === "pending");

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
            Request time off from your scheduled rotation
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Show pending requests */}
          {pendingRequests.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">
                Pending Requests
              </p>
              <div className="flex flex-col gap-2">
                {pendingRequests.map((req) => (
                  <div
                    key={req.id}
                    className="flex items-center justify-between gap-2 rounded-md border bg-muted/50 px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        {req.period_name || "Unknown Period"}
                      </Badge>
                      {req.request_type === "willing_break" && (
                        <span className="text-xs text-muted-foreground">(Willing)</span>
                      )}
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
                ))}
              </div>
            </div>
          )}

          <Button
            onClick={() => setDialogOpen(true)}
            variant="outline"
            className="w-full"
          >
            <Coffee className="mr-2 h-4 w-4" />
            Request Break
          </Button>
        </CardContent>
      </Card>

      <DashboardBreakRequestDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </>
  );
}
