import { useState } from "react";
import { format } from "date-fns";
import { parseLocalDate } from "@/lib/utils";
import {
  usePendingApprovals,
  useApproveSetlist,
  useRejectSetlist,
  useIsApprover,
  type PendingApproval,
} from "@/hooks/useSetlistApprovals";
import { useScheduledTeamForDate } from "@/hooks/useScheduledTeamForDate";
import { useTeamRosterForDate } from "@/hooks/useTeamRosterForDate";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Check,
  X,
  Music,
  Calendar,
  MapPin,
  Users,
  Clock,
  Loader2,
  FileCheck,
  Mic2,
} from "lucide-react";
import { Navigate } from "react-router-dom";

function getMinistryLabel(type: string): string {
  const labels: Record<string, string> = {
    adult: "Adult",
    student: "Student",
    kids: "Kids",
  };
  return labels[type] || type;
}

function ApprovalCard({ approval }: { approval: PendingApproval }) {
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectNotes, setRejectNotes] = useState("");
  
  const approveSetlist = useApproveSetlist();
  const rejectSetlist = useRejectSetlist();
  
  const planDate = parseLocalDate(approval.draft_set.plan_date);
  const { data: scheduledTeam } = useScheduledTeamForDate(planDate, approval.draft_set.campus_id);
  const { data: roster } = useTeamRosterForDate(
    planDate,
    scheduledTeam?.teamId,
    approval.draft_set.ministry_type,
    approval.draft_set.campus_id
  );

  const handleApprove = () => {
    approveSetlist.mutate({
      approvalId: approval.id,
      draftSetId: approval.draft_set_id,
    });
  };

  const handleReject = () => {
    rejectSetlist.mutate({
      approvalId: approval.id,
      draftSetId: approval.draft_set_id,
      notes: rejectNotes,
    });
    setShowRejectDialog(false);
    setRejectNotes("");
  };

  const isProcessing = approveSetlist.isPending || rejectSetlist.isPending;

  return (
    <>
      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Calendar className="h-4 w-4 text-primary" />
                {format(planDate, "EEEE, MMMM d, yyyy")}
              </CardTitle>
              <CardDescription className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="capitalize">
                  {getMinistryLabel(approval.draft_set.ministry_type)}
                </Badge>
                {approval.draft_set.campuses?.name && (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    {approval.draft_set.campuses.name}
                  </span>
                )}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="text-destructive border-destructive/50 hover:bg-destructive hover:text-destructive-foreground"
                onClick={() => setShowRejectDialog(true)}
                disabled={isProcessing}
              >
                {rejectSetlist.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <X className="h-4 w-4" />
                )}
                <span className="sr-only sm:not-sr-only sm:ml-1">Reject</span>
              </Button>
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700"
                onClick={handleApprove}
                disabled={isProcessing}
              >
                {approveSetlist.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                <span className="sr-only sm:not-sr-only sm:ml-1">Approve</span>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Submitter info */}
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Avatar className="h-6 w-6">
              <AvatarImage src={approval.submitter?.avatar_url || undefined} />
              <AvatarFallback className="text-xs">
                {approval.submitter?.full_name?.charAt(0) || "?"}
              </AvatarFallback>
            </Avatar>
            <span>
              Submitted by{" "}
              <span className="font-medium text-foreground">
                {approval.submitter?.full_name || "Unknown"}
              </span>
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {format(new Date(approval.submitted_at), "MMM d 'at' h:mm a")}
            </span>
          </div>

          {/* Songs */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Music className="h-4 w-4" />
              Songs ({approval.songs.length})
            </h4>
            <div className="rounded-lg border bg-muted/30 divide-y">
              {approval.songs.map((song, i) => (
                <div
                  key={song.id}
                  className="px-3 py-2 flex items-center gap-3"
                >
                  <span className="text-muted-foreground text-sm w-5">
                    {i + 1}.
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      {song.song?.title || "Unknown Song"}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {song.song?.author && (
                        <span className="truncate">{song.song.author}</span>
                      )}
                      {song.vocalist?.full_name && (
                        <span className="flex items-center gap-1 text-primary/80">
                          <Mic2 className="h-3 w-3" />
                          {song.vocalist.full_name}
                        </span>
                      )}
                    </div>
                  </div>
                  {song.song_key && (
                    <Badge variant="outline" className="text-xs">
                      {song.song_key}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Team info */}
          {scheduledTeam && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              <span>
                Team: <span className="font-medium">{scheduledTeam.teamName}</span>
              </span>
              <span className="text-xs">
                ({roster?.length || 0} members will be notified)
              </span>
            </div>
          )}

          {/* Notes if any */}
          {approval.draft_set.notes && (
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <p className="text-muted-foreground">{approval.draft_set.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reject Dialog */}
      <AlertDialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Return for Revision?</AlertDialogTitle>
            <AlertDialogDescription>
              This will return the setlist to the submitter for revision. You can
              optionally add notes explaining what needs to be changed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-4">
            <Label htmlFor="reject-notes">Notes (optional)</Label>
            <Textarea
              id="reject-notes"
              placeholder="e.g., Please add one more upbeat song..."
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReject}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Return for Revision
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default function Approvals() {
  const { data: isApprover, isLoading: isCheckingRole } = useIsApprover();
  const { data: approvals, isLoading } = usePendingApprovals();

  // Redirect non-approvers
  if (!isCheckingRole && isApprover === false) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="container max-w-3xl mx-auto px-4 py-6 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileCheck className="h-6 w-6 text-primary" />
          Setlist Approvals
        </h1>
        <p className="text-muted-foreground">
          Review and approve setlists before they're published to teams.
        </p>
      </div>

      {isLoading || isCheckingRole ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-32" />
              </CardHeader>
              <CardContent className="space-y-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-24 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : approvals && approvals.length > 0 ? (
        <div className="space-y-4">
          {approvals.map((approval) => (
            <ApprovalCard key={approval.id} approval={approval} />
          ))}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              <FileCheck className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-medium text-lg">No pending approvals</h3>
            <p className="text-muted-foreground text-sm mt-1">
              You're all caught up! Check back later for new submissions.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
