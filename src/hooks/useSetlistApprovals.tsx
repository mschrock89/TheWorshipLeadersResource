import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useToast } from "./use-toast";
import { generateServiceFlowFromTemplate } from "./useServiceFlow";

// Kyle Elkins' user ID - the designated approver
export const APPROVER_USER_ID = "22c10f05-955a-498c-b18f-2ac570868b35";

export interface SetlistApproval {
  id: string;
  draft_set_id: string;
  submitted_by: string;
  submitted_at: string;
  approver_id: string | null;
  status: "pending" | "approved" | "rejected";
  notes: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface PendingApproval extends SetlistApproval {
  draft_set: {
    id: string;
    campus_id: string;
    plan_date: string;
    ministry_type: string;
    custom_service_id: string | null;
    status: string;
    notes: string | null;
    campuses: { name: string } | null;
    custom_services?: { service_name: string } | null;
  };
  submitter: { full_name: string | null; avatar_url: string | null } | null;
  songs: {
    id: string;
    sequence_order: number;
    song_key: string | null;
    vocalist_id: string | null;
    song: { title: string; author: string | null } | null;
    vocalist: { full_name: string | null } | null;
  }[];
}

// Check if the current user is an approver (Kyle Elkins only)
export function useIsApprover() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ["is-approver", user?.id],
    queryFn: async () => {
      if (!user?.id) return false;
      
      // Only Kyle Elkins can approve setlists
      return user.id === APPROVER_USER_ID;
    },
    enabled: !!user?.id,
  });
}

// Fetch pending approvals for the approver
export function usePendingApprovals() {
  const { user } = useAuth();
  const { data: isApprover } = useIsApprover();

  return useQuery({
    queryKey: ["pending-approvals"],
    queryFn: async (): Promise<PendingApproval[]> => {
      if (!user?.id) return [];

      // Get all pending approvals
      const { data: approvals, error } = await supabase
        .from("setlist_approvals")
        .select(`
          id,
          draft_set_id,
          submitted_by,
          submitted_at,
          approver_id,
          status,
          notes,
          reviewed_at,
          created_at
        `)
        .eq("status", "pending")
        .order("submitted_at", { ascending: false });

      if (error) throw error;
      if (!approvals?.length) return [];

      // Get draft set details
      const draftSetIds = approvals.map(a => a.draft_set_id);
      const { data: draftSets } = await supabase
        .from("draft_sets")
        .select(`
          id,
          campus_id,
          plan_date,
          ministry_type,
          custom_service_id,
          status,
          notes,
          campuses(name),
          custom_services(service_name)
        `)
        .in("id", draftSetIds);

      // Get submitter profiles
      const submitterIds = [...new Set(approvals.map(a => a.submitted_by))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", submitterIds);

      // Get songs for each draft set with vocalist info
      const { data: allSongs } = await supabase
        .from("draft_set_songs")
        .select(`
          id,
          draft_set_id,
          sequence_order,
          song_key,
          vocalist_id,
          songs(title, author),
          profiles:vocalist_id(full_name)
        `)
        .in("draft_set_id", draftSetIds)
        .order("sequence_order");

      const draftSetMap = new Map((draftSets || []).map(ds => [ds.id, ds]));
      const profileMap = new Map((profiles || []).map(p => [p.id, p]));

      const normalized = approvals.map(approval => ({
        ...approval,
        status: approval.status as "pending" | "approved" | "rejected",
        draft_set: draftSetMap.get(approval.draft_set_id) || {
          id: approval.draft_set_id,
          campus_id: "",
          plan_date: "",
          ministry_type: "",
          custom_service_id: null,
          status: "",
          notes: null,
          campuses: null,
          custom_services: null,
        },
        submitter: profileMap.get(approval.submitted_by) || null,
        songs: (allSongs || [])
          .filter(s => s.draft_set_id === approval.draft_set_id)
          .map(s => ({
            id: s.id,
            sequence_order: s.sequence_order,
            song_key: s.song_key,
            vocalist_id: s.vocalist_id,
            song: s.songs as { title: string; author: string | null } | null,
            vocalist: s.profiles as { full_name: string | null } | null,
          })),
      }));

      // Keep only valid pending draft-set records and hide stale duplicates.
      // If multiple pending records exist for the same campus/date/ministry/service context,
      // keep the most recently submitted one.
      const deduped = new Map<string, PendingApproval>();
      for (const item of normalized) {
        if (!item.draft_set?.id) continue;
        if (item.draft_set.status !== "pending_approval") continue;
        const key = [
          item.draft_set.campus_id,
          item.draft_set.plan_date,
          item.draft_set.ministry_type,
          item.draft_set.custom_service_id || "none",
        ].join("|");
        const existing = deduped.get(key);
        if (!existing || new Date(item.submitted_at).getTime() > new Date(existing.submitted_at).getTime()) {
          deduped.set(key, item as PendingApproval);
        }
      }

      return Array.from(deduped.values()).sort(
        (a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime(),
      );
    },
    enabled: !!user?.id && isApprover === true,
  });
}

// Get pending approval count for badge display
export function usePendingApprovalCount() {
  const { data: isApprover } = useIsApprover();

  return useQuery({
    queryKey: ["pending-approval-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("setlist_approvals")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");

      if (error) throw error;
      return count || 0;
    },
    enabled: isApprover === true,
    refetchInterval: 30000, // Refetch every 30 seconds
  });
}

// Submit a setlist for approval
export function useSubmitForApproval() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (draftSetId: string) => {
      if (!user?.id) throw new Error("Not authenticated");

      // First, get the details of this set to find replaceable draft duplicates
      const { data: thisSet, error: fetchError } = await supabase
        .from("draft_sets")
        .select("campus_id, ministry_type, plan_date, custom_service_id")
        .eq("id", draftSetId)
        .single();

      if (fetchError) throw fetchError;

      // Only clean up other in-progress drafts in the same service context.
      // Never auto-delete already published/approved sets.
      let duplicateQuery = supabase
        .from("draft_sets")
        .select("id")
        .eq("campus_id", thisSet.campus_id)
        .eq("ministry_type", thisSet.ministry_type)
        .eq("plan_date", thisSet.plan_date)
        .in("status", ["draft", "pending_approval"])
        .neq("id", draftSetId);

      if (thisSet.custom_service_id) {
        duplicateQuery = duplicateQuery.eq("custom_service_id", thisSet.custom_service_id);
      } else {
        duplicateQuery = duplicateQuery.is("custom_service_id", null);
      }

      const { data: duplicateSets } = await duplicateQuery;

      const deletedCount = duplicateSets?.length || 0;

      if (deletedCount > 0) {
        const idsToDelete = duplicateSets.map(s => s.id);
        await supabase
          .from("draft_sets")
          .delete()
          .in("id", idsToDelete);
      }

      // Update draft set status to pending_approval
      const { error: updateError } = await supabase
        .from("draft_sets")
        .update({
          status: "pending_approval",
          submitted_for_approval_at: new Date().toISOString(),
        })
        .eq("id", draftSetId);

      if (updateError) throw updateError;

      // Create approval record
      const { error: approvalError } = await supabase
        .from("setlist_approvals")
        .insert({
          draft_set_id: draftSetId,
          submitted_by: user.id,
        });

      if (approvalError) throw approvalError;

      // Send push notification to Kyle
      try {
        await supabase.functions.invoke("send-push-notification", {
          body: {
            title: "Setlist Pending Approval",
            message: `A setlist for ${thisSet.plan_date} needs your approval`,
            url: "/approvals",
            userIds: [APPROVER_USER_ID],
          },
        });
      } catch (e) {
        console.error("Failed to send approval notification:", e);
      }

      return { deletedCount };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["draft-sets"] });
      queryClient.invalidateQueries({ queryKey: ["pending-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["pending-approval-count"] });
      
      let description = "Kyle Elkins has been notified and will review it shortly.";
      if (data?.deletedCount > 0) {
        description += ` (Cleaned up ${data.deletedCount} old version${data.deletedCount > 1 ? 's' : ''})`;
      }
      
      toast({
        title: "Setlist submitted for approval",
        description,
      });
    },
    onError: (error) => {
      toast({
        title: "Error submitting for approval",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

// Approve a setlist
export function useApproveSetlist() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ approvalId, draftSetId }: { approvalId: string; draftSetId: string }) => {
      if (!user?.id) throw new Error("Not authenticated");

      // Update approval record
      const { error: approvalError } = await supabase
        .from("setlist_approvals")
        .update({
          status: "approved",
          approver_id: user.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", approvalId);

      if (approvalError) throw approvalError;

      // Update draft set to published
      const { data: draftSet, error: updateError } = await supabase
        .from("draft_sets")
        .update({
          status: "published",
          published_at: new Date().toISOString(),
          approved_by: user.id,
          approved_at: new Date().toISOString(),
        })
        .eq("id", draftSetId)
        .select("campus_id, ministry_type, plan_date")
        .single();

      if (updateError) throw updateError;

      // Get songs for service flow generation
      const { data: songs } = await supabase
        .from("draft_set_songs")
        .select(`
          id,
          song_id,
          song_key,
          vocalist_id,
          songs(id, title)
        `)
        .eq("draft_set_id", draftSetId)
        .order("sequence_order", { ascending: true });

      // Generate service flow from template (or just songs if no template)
      try {
        await generateServiceFlowFromTemplate({
          campusId: draftSet.campus_id,
          ministryType: draftSet.ministry_type,
          serviceDate: draftSet.plan_date,
          draftSetId,
          createdBy: user.id,
          songs: (songs || []).map((s) => ({
            id: s.song_id,
            title: (s.songs as { id: string; title: string } | null)?.title || "Unknown Song",
            key: s.song_key,
            vocalistId: s.vocalist_id,
          })),
        });
      } catch (e) {
        console.error("Failed to generate service flow:", e);
        // Don't throw - setlist is still published even if service flow fails
      }

      // Notify the team
      const response = await supabase.functions.invoke("notify-setlist-published", {
        body: { draftSetId },
      });

      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["draft-sets"] });
      queryClient.invalidateQueries({ queryKey: ["published-setlists"] });
      queryClient.invalidateQueries({ queryKey: ["approver-published-setlists"] });
      queryClient.invalidateQueries({ queryKey: ["pending-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["pending-approval-count"] });
      queryClient.invalidateQueries({ queryKey: ["service-flow"] });
      queryClient.invalidateQueries({ queryKey: ["service-flow-items"] });
      
      toast({
        title: "Setlist approved & published!",
        description: data?.teamMembersNotified 
          ? `${data.teamMembersNotified} team members have been notified.`
          : "The team has been notified.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error approving setlist",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

// Reject a setlist
export function useRejectSetlist() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ approvalId, draftSetId, notes }: { approvalId: string; draftSetId: string; notes?: string }) => {
      if (!user?.id) throw new Error("Not authenticated");

      // Update approval record
      const { error: approvalError } = await supabase
        .from("setlist_approvals")
        .update({
          status: "rejected",
          approver_id: user.id,
          reviewed_at: new Date().toISOString(),
          notes: notes || null,
        })
        .eq("id", approvalId);

      if (approvalError) throw approvalError;

      // Update draft set back to draft status
      const { error: updateError } = await supabase
        .from("draft_sets")
        .update({
          status: "draft",
          submitted_for_approval_at: null,
        })
        .eq("id", draftSetId);

      if (updateError) throw updateError;

      // Get the submitter to notify them
      const { data: approval } = await supabase
        .from("setlist_approvals")
        .select("submitted_by")
        .eq("id", approvalId)
        .single();

      if (approval?.submitted_by) {
        try {
          await supabase.functions.invoke("send-push-notification", {
            body: {
              title: "Setlist Needs Revision",
              message: notes || "Your setlist was returned for revision",
              url: "/set-planner",
              userIds: [approval.submitted_by],
            },
          });
        } catch (e) {
          console.error("Failed to send rejection notification:", e);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["draft-sets"] });
      queryClient.invalidateQueries({ queryKey: ["pending-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["pending-approval-count"] });
      queryClient.invalidateQueries({ queryKey: ["approver-published-setlists"] });
      
      toast({
        title: "Setlist returned for revision",
        description: "The submitter has been notified.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error rejecting setlist",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
