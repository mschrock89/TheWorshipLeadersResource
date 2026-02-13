import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { Button } from "@/components/ui/button";
import { Send, Loader2, Users, AlertTriangle, Clock } from "lucide-react";
import { useSubmitForApproval } from "@/hooks/useSetlistApprovals";
import { SongAvailability } from "@/hooks/useSetPlanner";
import { useScheduledTeamForDate } from "@/hooks/useScheduledTeamForDate";
import { useTeamRosterForDate } from "@/hooks/useTeamRosterForDate";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface PublishSetlistDialogProps {
  draftSetId?: string;
  songs: SongAvailability[];
  targetDate: Date;
  ministryType: string;
  campusId: string;
  customServiceId?: string;
  onPublished?: () => void;
}

export function PublishSetlistDialog({
  draftSetId,
  songs,
  targetDate,
  ministryType,
  campusId,
  customServiceId,
  onPublished,
}: PublishSetlistDialogProps) {
  const [open, setOpen] = useState(false);
  const [existingPublishedCount, setExistingPublishedCount] = useState(0);
  const [checkingExisting, setCheckingExisting] = useState(false);
  const [isPendingApproval, setIsPendingApproval] = useState(false);
  const submitForApproval = useSubmitForApproval();

  // Get scheduled team for this date (campus-specific)
  const { data: scheduledTeam } = useScheduledTeamForDate(targetDate, campusId);
  const { data: roster } = useTeamRosterForDate(
    targetDate,
    scheduledTeam?.teamId,
    ministryType,
    campusId
  );
  const planDate = format(targetDate, "yyyy-MM-dd");
  const { data: customAssignedCount = 0 } = useQuery({
    queryKey: ["custom-service-assignment-count", customServiceId, planDate],
    enabled: !!customServiceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("custom_service_assignments")
        .select("user_id")
        .eq("custom_service_id", customServiceId!)
        .eq("assignment_date", planDate);

      if (error) throw error;
      return new Set((data || []).map((row) => row.user_id)).size;
    },
  });

  // Check if the draft set is already pending approval
  useEffect(() => {
    if (draftSetId) {
      supabase
        .from("draft_sets")
        .select("status, submitted_for_approval_at")
        .eq("id", draftSetId)
        .single()
        .then(({ data }) => {
          if (data && data.submitted_for_approval_at && data.status === "draft") {
            setIsPendingApproval(true);
          } else {
            setIsPendingApproval(false);
          }
        });
    }
  }, [draftSetId]);

  const teamMemberCount = customServiceId ? customAssignedCount : (roster?.length || 0);

  // Check for existing sets (published or draft) when dialog opens
  useEffect(() => {
    if (open && draftSetId && campusId) {
      setCheckingExisting(true);
      const planDate = format(targetDate, "yyyy-MM-dd");
      
      supabase
        .from("draft_sets")
        .select("id")
        .eq("campus_id", campusId)
        .eq("ministry_type", ministryType)
        .eq("plan_date", planDate)
        .neq("id", draftSetId)
        .then(({ data }) => {
          setExistingPublishedCount(data?.length || 0);
          setCheckingExisting(false);
        });
    }
  }, [open, draftSetId, campusId, ministryType, targetDate]);

  const handleSubmit = async () => {
    if (!draftSetId) return;
    
    await submitForApproval.mutateAsync(draftSetId);
    setIsPendingApproval(true);
    setOpen(false);
    onPublished?.();
  };

  if (!draftSetId || songs.length === 0) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled
        className="gap-2"
      >
        <Send className="h-4 w-4" />
        Submit for Approval
      </Button>
    );
  }

  // Show pending state if already submitted for approval
  if (isPendingApproval) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled
        className="gap-2 border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400"
      >
        <Clock className="h-4 w-4" />
        Pending Approval
      </Button>
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant="default"
          size="sm"
          className="gap-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white shadow-lg"
        >
          <Send className="h-4 w-4" />
          Submit for Approval
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-600" />
            Submit for Approval
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              {existingPublishedCount > 0 && !checkingExisting && (
                <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 flex items-start gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-amber-700 dark:text-amber-400">
                    <span className="font-medium">
                      {existingPublishedCount} older set{existingPublishedCount > 1 ? 's' : ''} will be deleted.
                    </span>
                    <p className="text-amber-600 dark:text-amber-500 mt-1">
                      Duplicate sets for this date will be removed to keep things clean.
                    </p>
                  </div>
                </div>
              )}

              <p>
                This will submit the setlist to <span className="font-semibold">Kyle Elkins</span> for approval.
                Once approved, push notifications will be sent to all {customServiceId ? "assigned custom service members" : "scheduled team members"}.
              </p>
              
              <div className="rounded-lg border bg-muted/50 p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Users className="h-4 w-4" />
                  <span>{teamMemberCount} team members will be notified after approval</span>
                </div>
                
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium">{songs.length} songs</span> in this set
                </div>
                
                {scheduledTeam && (
                  <div className="text-sm text-muted-foreground">
                    Team: <span className="font-medium">{scheduledTeam.teamName}</span>
                  </div>
                )}
              </div>

              <p className="text-sm text-muted-foreground">
                You'll be notified when the setlist is approved or if revisions are needed.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleSubmit}
            disabled={submitForApproval.isPending || checkingExisting}
            className="bg-amber-600 hover:bg-amber-700"
          >
            {submitForApproval.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : existingPublishedCount > 0 ? (
              <>
                <Send className="mr-2 h-4 w-4" />
                Replace & Submit
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Submit for Approval
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
