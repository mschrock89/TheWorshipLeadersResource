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
import { Send, Loader2, Users, AlertTriangle, Clock, Undo2 } from "lucide-react";
import { useCanPublishSetlistDirectly, useSubmitForApproval, useWithdrawSetlistSubmission } from "@/hooks/useSetlistApprovals";
import { SongAvailability } from "@/hooks/useSetPlanner";
import { useScheduledTeamForDate } from "@/hooks/useScheduledTeamForDate";
import { useTeamRosterForDate } from "@/hooks/useTeamRosterForDate";
import { supabase } from "@/integrations/supabase/client";
import { isNetworkWideMinistryType, isSessionSetMinistryType, normalizeSessionSetMinistryType } from "@/lib/constants";
import { format } from "date-fns";

interface PublishSetlistDialogProps {
  draftSetId?: string;
  songs: SongAvailability[];
  targetDate: Date;
  ministryType: string;
  campusId: string | null;
  customServiceId?: string;
  customServiceName?: string;
  assignedMemberCount?: number;
  onPublished?: () => void;
}

export function PublishSetlistDialog({
  draftSetId,
  songs,
  targetDate,
  ministryType,
  campusId,
  customServiceId,
  customServiceName,
  assignedMemberCount,
  onPublished,
}: PublishSetlistDialogProps) {
  const [open, setOpen] = useState(false);
  const [existingPublishedCount, setExistingPublishedCount] = useState(0);
  const [checkingExisting, setCheckingExisting] = useState(false);
  const [isPendingApproval, setIsPendingApproval] = useState(false);
  const submitForApproval = useSubmitForApproval();
  const withdrawSubmission = useWithdrawSetlistSubmission();
  const { data: canPublishDirectly = false } = useCanPublishSetlistDirectly(ministryType);
  const rosterMinistryType = normalizeSessionSetMinistryType(ministryType) || ministryType;
  const usesCustomServiceRoster = Boolean(customServiceId) && !isSessionSetMinistryType(ministryType);

  // Scheduled Team Builder rotation is only for regular services / camp sessions.
  const { data: scheduledTeam } = useScheduledTeamForDate(
    usesCustomServiceRoster ? null : targetDate,
    usesCustomServiceRoster ? null : campusId,
    usesCustomServiceRoster ? null : rosterMinistryType,
  );
  const { data: roster } = useTeamRosterForDate(
    usesCustomServiceRoster ? null : targetDate,
    usesCustomServiceRoster ? undefined : scheduledTeam?.teamId,
    usesCustomServiceRoster ? undefined : rosterMinistryType,
    usesCustomServiceRoster ? undefined : campusId
  );
  const planDate = format(targetDate, "yyyy-MM-dd");
  const { data: customServiceMeta } = useQuery({
    queryKey: ["publish-custom-service-meta", customServiceId],
    enabled: usesCustomServiceRoster && !!customServiceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("custom_services")
        .select("service_name, service_date, repeats_weekly")
        .eq("id", customServiceId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const { data: customAssignedCount = 0 } = useQuery({
    queryKey: [
      "custom-service-assignment-count",
      customServiceId,
      planDate,
      customServiceMeta?.service_date ?? null,
    ],
    enabled: usesCustomServiceRoster && !!customServiceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("custom_service_assignments")
        .select("user_id, assignment_date")
        .eq("custom_service_id", customServiceId!);

      if (error) throw error;
      const rows = data || [];
      const forPlanDate = rows.filter((row) => row.assignment_date === planDate);
      const fallbackDate = customServiceMeta?.service_date;
      const forServiceDate = fallbackDate
        ? rows.filter((row) => row.assignment_date === fallbackDate)
        : [];
      const effectiveRows =
        forPlanDate.length > 0 ? forPlanDate : forServiceDate.length > 0 ? forServiceDate : rows;
      return new Set(effectiveRows.map((row) => row.user_id)).size;
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

  const teamMemberCount = usesCustomServiceRoster
    ? Math.max(customAssignedCount, assignedMemberCount ?? 0)
    : (roster?.length || 0);
  const recipientLabel = usesCustomServiceRoster ? "assigned custom service members" : "scheduled team members";
  const teamLabel = usesCustomServiceRoster
    ? (customServiceName || customServiceMeta?.service_name || "Custom service team")
    : scheduledTeam?.teamName;

  // Check for existing in-progress draft sets when dialog opens
  useEffect(() => {
    const networkWide = isNetworkWideMinistryType(ministryType);
    if (open && draftSetId && (campusId || networkWide)) {
      setCheckingExisting(true);
      const planDate = format(targetDate, "yyyy-MM-dd");
      
      let existingQuery = supabase
        .from("draft_sets")
        .select("id")
        .eq("ministry_type", ministryType)
        .eq("plan_date", planDate)
        .in("status", ["draft", "pending_approval"])
        .neq("id", draftSetId)

      // Network Wide sets (campus_id IS NULL, e.g. Student Camp) are shared.
      existingQuery = networkWide
        ? existingQuery.is("campus_id", null)
        : existingQuery.eq("campus_id", campusId as string);
      
      if (customServiceId) {
        existingQuery = existingQuery.eq("custom_service_id", customServiceId);
      } else {
        existingQuery = existingQuery.is("custom_service_id", null);
      }

      existingQuery.then(({ data }) => {
          setExistingPublishedCount(data?.length || 0);
          setCheckingExisting(false);
        });
    }
  }, [open, draftSetId, campusId, ministryType, targetDate, customServiceId]);

  const handleSubmit = async () => {
    if (!draftSetId) return;

    if (usesCustomServiceRoster && customServiceId) {
      const { error: linkError } = await supabase
        .from("draft_sets")
        .update({ custom_service_id: customServiceId })
        .eq("id", draftSetId);
      if (linkError) {
        console.error("Failed to link draft set to custom service:", linkError);
      }
    }
    
    const result = await submitForApproval.mutateAsync(draftSetId);
    setIsPendingApproval(!result?.autoPublished);
    setOpen(false);
    onPublished?.();
  };

  const handleUndoSubmission = async () => {
    if (!draftSetId) return;

    await withdrawSubmission.mutateAsync(draftSetId);
    setIsPendingApproval(false);
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
        {canPublishDirectly ? "Publish Setlist" : "Submit for Approval"}
      </Button>
    );
  }

  // Show pending state if already submitted for approval
  if (isPendingApproval) {
    return (
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled
          className="gap-2 border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400"
        >
          <Clock className="h-4 w-4" />
          Pending Approval
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleUndoSubmission}
          disabled={withdrawSubmission.isPending}
          className="gap-2"
        >
          {withdrawSubmission.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Undoing...
            </>
          ) : (
            <>
              <Undo2 className="h-4 w-4" />
              Undo Submission
            </>
          )}
        </Button>
      </div>
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
          {canPublishDirectly ? "Publish Setlist" : "Submit for Approval"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-600" />
            {canPublishDirectly ? "Publish Setlist" : "Submit for Approval"}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              {existingPublishedCount > 0 && !checkingExisting && (
                <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 flex items-start gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-amber-700 dark:text-amber-400">
                    <span className="font-medium">
                      {existingPublishedCount} older draft version{existingPublishedCount > 1 ? 's' : ''} will be replaced.
                    </span>
                    <p className="text-amber-600 dark:text-amber-500 mt-1">
                      Published/approved sets will not be deleted.
                    </p>
                  </div>
                </div>
              )}

              <p>
                {canPublishDirectly ? (
                  <>
                    This will publish the setlist immediately and send push notifications to all{" "}
                    {recipientLabel}.
                  </>
                ) : (
                  <>
                    This will submit the setlist to the designated approver for review.
                    Once approved, push notifications will be sent to all{" "}
                    {recipientLabel}.
                  </>
                )}
              </p>
              
              <div className="rounded-lg border bg-muted/50 p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Users className="h-4 w-4" />
                  <span>
                    {teamMemberCount} team members will be notified {canPublishDirectly ? "right away" : "after approval"}
                  </span>
                </div>
                
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium">{songs.length} songs</span> in this set
                </div>
                
                {teamLabel && (
                  <div className="text-sm text-muted-foreground">
                    Team: <span className="font-medium">{teamLabel}</span>
                  </div>
                )}
              </div>

              <p className="text-sm text-muted-foreground">
                {canPublishDirectly
                  ? "Publishing will make the setlist visible to volunteers immediately."
                  : "You'll be notified when the setlist is approved or if revisions are needed."}
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
                {canPublishDirectly ? "Publishing..." : "Submitting..."}
              </>
            ) : existingPublishedCount > 0 ? (
              <>
                <Send className="mr-2 h-4 w-4" />
                {canPublishDirectly ? "Replace & Publish" : "Replace & Submit"}
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                {canPublishDirectly ? "Publish Setlist" : "Submit for Approval"}
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
