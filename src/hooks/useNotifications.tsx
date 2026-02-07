import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { parseLocalDate } from "@/lib/utils";

export type NotificationType = 
  | "swap_request" 
  | "swap_accepted" 
  | "swap_declined" 
  | "new_set" 
  | "new_event"
  | "pending_approval"
  | "approval_status"
  | "setlist_confirmed";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  link?: string;
  swapRequestId?: string;
}

export function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [readIdsLoaded, setReadIdsLoaded] = useState(false);
  const readIdsRef = useRef<Set<string>>(new Set());
  
  // Keep ref in sync with state
  useEffect(() => {
    readIdsRef.current = readIds;
  }, [readIds]);

  // Fetch read notification IDs from database
  useEffect(() => {
    if (!user) {
      setReadIdsLoaded(false);
      return;
    }
    
    const loadReadIds = async () => {
      setReadIdsLoaded(false); // Reset while loading
      const { data } = await supabase
        .from("notification_read_status")
        .select("notification_id")
        .eq("user_id", user.id);
      
      const ids = new Set((data || []).map(r => r.notification_id));
      setReadIds(ids);
      readIdsRef.current = ids;
      setReadIdsLoaded(true); // Mark as loaded
    };
    
    loadReadIds();
  }, [user]);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;

    // Use the ref to get current read IDs
    const currentReadIds = readIdsRef.current;
    
    setIsLoading(true);
    try {
      // Fetch all notification sources in PARALLEL
      const [memberResult, incomingResult, resolvedResult, newSetsResult, newEventsResult, userCampusesResult, pendingApprovalsResult, approvalStatusResult, userDraftSetsResult] = await Promise.all([
        // Get user's positions
        supabase
          .from("team_members")
          .select("position, team_id")
          .eq("user_id", user.id),
        // Incoming swap requests
        supabase
          .from("swap_requests")
          .select(`
            id,
            original_date,
            status,
            created_at,
            position,
            target_user_id,
            requester:profiles!swap_requests_requester_id_fkey(full_name)
          `)
          .eq("status", "pending")
          .neq("requester_id", user.id)
          .order("created_at", { ascending: false })
          .limit(10),
        // Resolved requests (user's own)
        supabase
          .from("swap_requests")
          .select(`
            id,
            original_date,
            status,
            resolved_at,
            position,
            accepted_by:profiles!swap_requests_accepted_by_id_fkey(full_name)
          `)
          .eq("requester_id", user.id)
          .in("status", ["accepted", "declined"])
          .order("resolved_at", { ascending: false })
          .limit(10),
        // New draft sets (published in last 7 days)
        supabase
          .from("draft_sets")
          .select(`
            id,
            plan_date,
            updated_at,
            ministry_type,
            campus_id,
            campuses:campuses(name)
          `)
          .eq("status", "published")
          .gte("updated_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
          .order("updated_at", { ascending: false })
          .limit(10),
        // New calendar events (created in last 7 days, for upcoming dates)
        supabase
          .from("events")
          .select(`
            id,
            title,
            event_date,
            created_at,
            campus_id,
            campuses:campuses(name)
          `)
          .gte("event_date", new Date().toISOString().split("T")[0])
          .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
          .order("created_at", { ascending: false })
          .limit(10),
        // User's campuses for filtering
        supabase
          .from("user_campuses")
          .select("campus_id")
          .eq("user_id", user.id),
        // Pending approvals (for Kyle/approvers)
        supabase
          .from("setlist_approvals")
          .select(`
            id,
            submitted_at,
            draft_set_id
          `)
          .eq("status", "pending")
          .order("submitted_at", { ascending: false })
          .limit(10),
        // Approval status changes for user's submitted setlists
        supabase
          .from("setlist_approvals")
          .select(`
            id,
            status,
            reviewed_at,
            notes,
            draft_set_id
          `)
          .eq("submitted_by", user.id)
          .in("status", ["approved", "rejected"])
          .gte("reviewed_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
          .order("reviewed_at", { ascending: false })
          .limit(10),
        // Draft sets created by this user (to find their confirmations)
        supabase
          .from("draft_sets")
          .select("id, plan_date, campus_id, ministry_type, campuses:campuses(name)")
          .eq("created_by", user.id)
          .eq("status", "published")
          .gte("plan_date", new Date().toISOString().split("T")[0])
      ]);

      const positions = memberResult.data?.map((m) => m.position) || [];
      const userCampusIds = userCampusesResult.data?.map((uc) => uc.campus_id) || [];
      const incomingRequests = incomingResult.data || [];
      const resolvedRequests = resolvedResult.data || [];
      const newSets = newSetsResult.data || [];
      const newEvents = newEventsResult.data || [];
      const pendingApprovals = pendingApprovalsResult.data || [];
      const approvalStatuses = approvalStatusResult.data || [];
      const userDraftSets = userDraftSetsResult.data || [];

      // Check if user is an approver (Kyle Elkins only)
      const isApprover = user.id === "22c10f05-955a-498c-b18f-2ac570868b35";

      const notifs: Notification[] = [];

      // Process incoming swap requests
      incomingRequests.forEach((req) => {
        const isTargetedAtMe = req.target_user_id === user.id;
        const isOpenForMyPosition = !req.target_user_id && positions.includes(req.position);
        
        if (isTargetedAtMe || isOpenForMyPosition) {
          const requesterName = req.requester?.full_name || "Someone";
          const notifId = `incoming-${req.id}`;
          notifs.push({
            id: notifId,
            type: "swap_request",
            title: "Swap Request",
            message: isTargetedAtMe
              ? `${requesterName} wants to swap dates with you`
              : `${requesterName} needs coverage on ${parseLocalDate(req.original_date).toLocaleDateString()}`,
            timestamp: req.created_at,
            read: currentReadIds.has(notifId),
            link: "/swaps",
            swapRequestId: req.id,
          });
        }
      });

      // Process resolved requests
      resolvedRequests.forEach((req) => {
        const accepterName = req.accepted_by?.full_name || "Someone";
        const notifId = `resolved-${req.id}`;
        notifs.push({
          id: notifId,
          type: req.status === "accepted" ? "swap_accepted" : "swap_declined",
          title: req.status === "accepted" ? "Swap Accepted" : "Swap Declined",
          message: req.status === "accepted"
            ? `${accepterName} will cover your date on ${parseLocalDate(req.original_date).toLocaleDateString()}`
            : `Your swap request for ${parseLocalDate(req.original_date).toLocaleDateString()} was declined`,
          timestamp: req.resolved_at || req.original_date,
          read: currentReadIds.has(notifId),
          link: "/swaps",
          swapRequestId: req.id,
        });
      });

      // Process new sets - filter by user's campuses
      newSets.forEach((set) => {
        if (userCampusIds.includes(set.campus_id)) {
          const campusName = (set.campuses as { name: string } | null)?.name || "";
          const notifId = `set-${set.id}`;
          notifs.push({
            id: notifId,
            type: "new_set",
            title: "New Set Published",
            message: `${campusName ? campusName + " - " : ""}${set.ministry_type} set for ${parseLocalDate(set.plan_date).toLocaleDateString()}`,
            timestamp: set.updated_at,
            read: currentReadIds.has(notifId),
            link: `/my-setlists?setId=${set.id}`,
          });
        }
      });

      // Process new events - filter by user's campuses
      newEvents.forEach((event) => {
        if (!event.campus_id || userCampusIds.includes(event.campus_id)) {
          const campusName = (event.campuses as { name: string } | null)?.name || "";
          const notifId = `event-${event.id}`;
          notifs.push({
            id: notifId,
            type: "new_event",
            title: "New Event",
            message: `${event.title}${campusName ? ` - ${campusName}` : ""} on ${parseLocalDate(event.event_date).toLocaleDateString()}`,
            timestamp: event.created_at || new Date().toISOString(),
            read: currentReadIds.has(notifId),
            link: "/calendar",
          });
        }
      });

      // Process pending approvals (only for Kyle Elkins)
      if (isApprover) {
        pendingApprovals.forEach((approval) => {
          const notifId = `approval-pending-${approval.id}`;
          notifs.push({
            id: notifId,
            type: "pending_approval",
            title: "Setlist Pending Approval",
            message: "A setlist needs your review and approval",
            timestamp: approval.submitted_at,
            read: currentReadIds.has(notifId),
            link: "/approvals",
          });
        });
      }

      // Process approval status updates (for submitters)
      approvalStatuses.forEach((approval) => {
        const notifId = `approval-status-${approval.id}`;
        const isApprovedStatus = approval.status === "approved";
        notifs.push({
          id: notifId,
          type: "approval_status",
          title: isApprovedStatus ? "Setlist Approved" : "Revision Needed",
          message: isApprovedStatus 
            ? "Your setlist has been approved and the team has been notified"
            : approval.notes || "Your setlist needs revisions",
          timestamp: approval.reviewed_at || new Date().toISOString(),
          read: currentReadIds.has(notifId),
          link: isApprovedStatus ? "/my-setlists" : "/set-planner",
        });
      });

      // Fetch setlist confirmations for user's created setlists
      if (userDraftSets.length > 0) {
        const draftSetIds = userDraftSets.map(ds => ds.id);
        const { data: confirmations } = await supabase
          .from("setlist_confirmations")
          .select(`
            id,
            draft_set_id,
            user_id,
            confirmed_at
          `)
          .in("draft_set_id", draftSetIds)
          .neq("user_id", user.id)
          .gte("confirmed_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
          .order("confirmed_at", { ascending: false })
          .limit(20);

        if (confirmations && confirmations.length > 0) {
          const confirmerIds = [...new Set(confirmations.map(c => c.user_id))];
          const { data: confirmerProfiles } = await supabase
            .from("profiles")
            .select("id, full_name")
            .in("id", confirmerIds);

          const profileMap = new Map((confirmerProfiles || []).map(p => [p.id, p.full_name]));
          const draftSetMap = new Map(userDraftSets.map(ds => [ds.id, ds]));

          confirmations.forEach((confirmation) => {
            const confirmerName = profileMap.get(confirmation.user_id) || "A team member";
            const draftSet = draftSetMap.get(confirmation.draft_set_id);
            if (!draftSet) return;

            const campusName = (draftSet.campuses as { name: string } | null)?.name || "";
            const formattedDate = parseLocalDate(draftSet.plan_date).toLocaleDateString();
            const notifId = `confirm-${confirmation.id}`;
            
            notifs.push({
              id: notifId,
              type: "setlist_confirmed",
              title: "Setlist Confirmed",
              message: `${confirmerName} reviewed the ${formattedDate}${campusName ? ` ${campusName}` : ""} setlist`,
              timestamp: confirmation.confirmed_at,
              read: currentReadIds.has(notifId),
              link: `/my-setlists?setId=${confirmation.draft_set_id}`,
            });
          });
        }
      }

      // Sort by timestamp descending
      notifs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      setNotifications(notifs);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Only fetch notifications AFTER read IDs have been loaded
  useEffect(() => {
    if (readIdsLoaded) {
      fetchNotifications();
    }
  }, [fetchNotifications, readIdsLoaded]);

  // Subscribe to realtime changes for all notification sources
  useEffect(() => {
    if (!user || !readIdsLoaded) return;

    const channel = supabase
      .channel("notifications-all-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "swap_requests" },
        () => fetchNotifications()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "draft_sets" },
        () => fetchNotifications()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events" },
        () => fetchNotifications()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "setlist_approvals" },
        () => fetchNotifications()
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "setlist_confirmations" },
        () => fetchNotifications()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchNotifications]);

  const markAsRead = useCallback(async (notificationId: string) => {
    if (!user) return;
    
    // Optimistically update UI
    setReadIds((prev) => {
      const next = new Set(prev);
      next.add(notificationId);
      return next;
    });
    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
    );

    // Persist to database
    await supabase
      .from("notification_read_status")
      .upsert(
        { user_id: user.id, notification_id: notificationId },
        { onConflict: "user_id,notification_id" }
      );
  }, [user]);

  const markAllAsRead = useCallback(async () => {
    if (!user) return;
    
    const unreadNotifs = notifications.filter(n => !n.read);
    if (unreadNotifs.length === 0) return;

    // Optimistically update UI
    setReadIds((prev) => {
      const next = new Set(prev);
      notifications.forEach((n) => next.add(n.id));
      return next;
    });
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));

    // Persist to database
    const records = unreadNotifs.map(n => ({
      user_id: user.id,
      notification_id: n.id,
    }));
    
    await supabase
      .from("notification_read_status")
      .upsert(records, { onConflict: "user_id,notification_id" });
  }, [user, notifications]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return {
    notifications,
    unreadCount,
    isLoading,
    markAsRead,
    markAllAsRead,
    refetch: fetchNotifications,
  };
}
