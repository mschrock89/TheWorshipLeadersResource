import { useState } from "react";
import { Link } from "react-router-dom";
import { useSwapRequests, useDeleteSwapRequest } from "@/hooks/useSwapRequests";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ArrowLeftRight, ArrowRight, Trash2, UserPlus } from "lucide-react";
import { format } from "date-fns";
import { parseLocalDate } from "@/lib/utils";

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getStatusColor(status: string) {
  switch (status) {
    case "pending":
      return "bg-yellow-500/20 text-yellow-600 border-yellow-500/30";
    case "accepted":
      return "bg-green-500/20 text-green-600 border-green-500/30";
    case "declined":
      return "bg-red-500/20 text-red-600 border-red-500/30";
    case "cancelled":
      return "bg-muted text-muted-foreground border-muted";
    default:
      return "bg-muted text-muted-foreground border-muted";
  }
}

export function SwapManagementWidget() {
  const { data: swapRequests, isLoading } = useSwapRequests();
  const deleteSwapRequest = useDeleteSwapRequest();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteSwapRequest.mutateAsync(id);
    } finally {
      setDeletingId(null);
    }
  };

  // Show recent swaps (last 10)
  const recentSwaps = swapRequests?.slice(0, 10) || [];
  const pendingCount = swapRequests?.filter((s) => s.status === "pending").length || 0;

  if (isLoading) {
    return (
      <Card className="col-span-full">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5 text-primary" />
            Swap Requests
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="col-span-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-primary/10 p-2">
            <ArrowLeftRight className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">Swap Requests</CardTitle>
            {pendingCount > 0 && (
              <p className="text-sm text-muted-foreground">
                {pendingCount} pending request{pendingCount !== 1 ? "s" : ""}
              </p>
            )}
          </div>
        </div>
        <Link to="/swaps">
          <Button variant="ghost" size="sm" className="gap-1">
            View All
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        {recentSwaps.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-6">
            No swap requests yet
          </p>
        ) : (
          <div className="space-y-3">
            {recentSwaps.map((swap) => (
              <div
                key={swap.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card/50 p-3"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarImage src={swap.requester?.avatar_url || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary text-xs">
                      {getInitials(swap.requester?.full_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">
                        {swap.requester?.full_name || "Unknown"}
                      </span>
                      {(swap as any).request_type === "fill_in" && (
                        <Badge variant="outline" className="text-xs border-blue-500/30 text-blue-600 bg-blue-500/10">
                          <UserPlus className="h-2.5 w-2.5 mr-0.5" />
                          Cover
                        </Badge>
                      )}
                      <Badge
                        variant="outline"
                        className={`text-xs ${getStatusColor(swap.status)}`}
                      >
                        {swap.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {format(parseLocalDate(swap.original_date), "MMM d, yyyy")} • {swap.position.replace(/_/g, " ")}
                    </p>
                  </div>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                      disabled={deletingId === swap.id}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Swap Request</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete this swap request from{" "}
                        <strong>{swap.requester?.full_name || "Unknown"}</strong>?
                        {swap.status === "accepted" && (
                          <span className="block mt-2 text-amber-600 dark:text-amber-400">
                            This will revert the schedule back to the original assignment.
                          </span>
                        )}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleDelete(swap.id)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
