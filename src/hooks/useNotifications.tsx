import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { parseLocalDate } from "@/lib/utils";

const TEAM_WIDE_EVENT_AUDIENCE_TYPES = new Set(["volunteers_only", "volunteer_and_spouse"]);

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
  eventDetails?: {
    eventId: string;
    title: string;
    description: string | null;
    eventDate: string;
    startTime: string | null;
    endTime: string | null;
    campusName: string;
    audienceType: string | null;
    isComing: boolean;
  };
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
      const [newSetsResult, newEventsResult, userCampusesResult, directSwapRequestsResult] = await Promise.all([
        // New draft sets (published in last 7 days)
        supabase
          .from("draft_sets")
          .select(`
            id,
            plan_date,
            published_at,
            ministry_type,
            campus_id,
            campuses:campuses(name)
          `)
          .eq("status", "published")
          .not("published_at", "is", null)
          .gte("published_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
          .order("published_at", { ascending: false })
          .limit(10),
        // New calendar events (created in last 7 days, for upcoming dates)
        supabase
          .from("events")
          .select(`
            id,
            title,
            description,
            event_date,
            created_at,
            start_time,
            end_time,
            audience_type,
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
        // Direct incoming cover/swap requests for this user
        supabase
          .from("swap_requests")
          .select(`
            id,
            created_at,
            original_date,
            swap_date,
            request_type,
            position,
            status,
            requester:profiles!swap_requests_requester_id_fkey(full_name),
            worship_teams(name)
          `)
          .eq("target_user_id", user.id)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

      const userCampusIds = userCampusesResult.data?.map((uc) => uc.campus_id) || [];
      const newSets = newSetsResult.data || [];
      const newEvents = newEventsResult.data || [];
      const directSwapRequests = directSwapRequestsResult.data || [];

      const notifs: Notification[] = [];

      const rosterChecks = await Promise.all(
        newSets.map(async (set) => {
          const { data, error } = await supabase.rpc("is_user_on_setlist_roster", {
            p_draft_set_id: set.id,
            p_user_id: user.id,
          });

          if (error) {
            console.error("Error checking notification roster eligibility:", error);
            return null;
          }

          return data ? set.id : null;
        }),
      );

      const rosteredSetIds = new Set(rosterChecks.filter(Boolean) as string[]);

      newSets.forEach((set) => {
        if (!rosteredSetIds.has(set.id)) return;

        const campusName = (set.campuses as { name: string } | null)?.name || "";
        const notifId = `set-${set.id}`;
        notifs.push({
          id: notifId,
          type: "new_set",
          title: "New Set Published",
          message: `${campusName ? campusName + " - " : ""}${set.ministry_type} set for ${parseLocalDate(set.plan_date).toLocaleDateString()}`,
          timestamp: set.published_at || new Date().toISOString(),
          read: currentReadIds.has(notifId),
          link: `/my-setlists?setId=${set.id}`,
        });
      });

      const newEventIds = newEvents.map((event) => event.id);
      let comingEventIds = new Set<string>();

      if (newEventIds.length > 0) {
        const { data: eventRsvps } = await supabase
          .from("event_rsvps")
          .select("event_id")
          .eq("user_id", user.id)
          .eq("status", "coming")
          .in("event_id", newEventIds);

        comingEventIds = new Set((eventRsvps || []).map((rsvp) => rsvp.event_id));
      }

      // Process new team-wide events only.
      newEvents.forEach((event) => {
        const audienceType = ("audience_type" in event ? (event.audience_type as string | null) : null) || "volunteers_only";
        const isTeamWideEvent = TEAM_WIDE_EVENT_AUDIENCE_TYPES.has(audienceType);
        const isRelevantCampusEvent = !event.campus_id || userCampusIds.includes(event.campus_id);
        if (!isTeamWideEvent || !isRelevantCampusEvent) return;

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
          eventDetails: {
            eventId: event.id,
            title: event.title,
            description: "description" in event ? (event.description as string | null) : null,
            eventDate: event.event_date,
            startTime: "start_time" in event ? (event.start_time as string | null) : null,
            endTime: "end_time" in event ? (event.end_time as string | null) : null,
            campusName,
            audienceType,
            isComing: comingEventIds.has(event.id),
          },
        });
      });

      directSwapRequests.forEach((swapRequest) => {
        const requesterName =
          (swapRequest.requester as { full_name?: string | null } | null)?.full_name || "A team member";
        const teamName =
          (swapRequest.worship_teams as { name?: string | null } | null)?.name || "your team";
        const isCoverRequest =
          swapRequest.request_type === "fill_in" || !swapRequest.swap_date;
        const notifId = `swap-request-${swapRequest.id}`;

        notifs.push({
          id: notifId,
          type: "swap_request",
          title: isCoverRequest ? "Cover Request" : "Swap Request",
          message: isCoverRequest
            ? `${requesterName} asked you to cover ${swapRequest.position} on ${parseLocalDate(swapRequest.original_date).toLocaleDateString()} for ${teamName}`
            : `${requesterName} wants to swap ${swapRequest.position} with you on ${parseLocalDate(swapRequest.original_date).toLocaleDateString()}`,
          timestamp: swapRequest.created_at || new Date().toISOString(),
          read: currentReadIds.has(notifId),
          link: "/swaps",
          swapRequestId: swapRequest.id,
        });
      });

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
        { event: "*", schema: "public", table: "swap_requests" },
        () => fetchNotifications()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, readIdsLoaded, fetchNotifications]);

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
