import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

export interface Event {
  id: string;
  title: string;
  description: string | null;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  campus_id: string | null;
  campus_ids?: string[] | null;
  ministry_type: string | null;
  ministry_types?: string[] | null;
  audience_type: string | null;
  teaching_week_id?: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  attendee_count?: number;
  is_coming?: boolean;
}

interface EventRsvpRow {
  event_id: string;
  user_id: string;
  status: string;
}

async function attachEventRsvps(events: Event[], userId?: string) {
  if (events.length === 0) return events;

  const eventIds = events.map((event) => event.id);
  const { data: rsvps, error } = await supabase
    .from("event_rsvps")
    .select("event_id, user_id, status")
    .in("event_id", eventIds);

  if (error) throw error;

  const attendeeCounts = new Map<string, number>();
  const comingEventIds = new Set<string>();

  ((rsvps || []) as EventRsvpRow[]).forEach((rsvp) => {
    if (rsvp.status === "coming") {
      attendeeCounts.set(rsvp.event_id, (attendeeCounts.get(rsvp.event_id) || 0) + 1);
      if (userId && rsvp.user_id === userId) {
        comingEventIds.add(rsvp.event_id);
      }
    }
  });

  return events.map((event) => ({
    ...event,
    attendee_count: attendeeCounts.get(event.id) || 0,
    is_coming: comingEventIds.has(event.id),
  }));
}

export function useEvents() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["events", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .order("event_date", { ascending: true });

      if (error) throw error;
      return attachEventRsvps((data || []) as Event[], user?.id);
    },
  });
}

export function useEventsForMonth(year: number, month: number) {
  const { user } = useAuth();
  const startDate = new Date(year, month, 1).toISOString().split("T")[0];
  const endDate = new Date(year, month + 1, 0).toISOString().split("T")[0];

  return useQuery({
    queryKey: ["events", year, month, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .gte("event_date", startDate)
        .lte("event_date", endDate)
        .order("event_date", { ascending: true });

      if (error) throw error;
      return attachEventRsvps((data || []) as Event[], user?.id);
    },
  });
}

export function useCreateEvent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
      mutationFn: async (event: {
        title: string;
        description?: string;
        event_date: string;
        start_time?: string;
        end_time?: string;
        campus_id?: string;
        campus_ids?: string[];
        ministry_type?: string;
        ministry_types?: string[];
        audience_type?: string;
        teaching_week_id?: string;
      }) => {
      const { data: { user } } = await supabase.auth.getUser();

      let teachingWeekId = event.teaching_week_id || null;
      if (!teachingWeekId && event.campus_id && event.ministry_type) {
        const { data: weekMatch } = await (supabase as any)
          .from("teaching_weeks")
          .select("id")
          .eq("campus_id", event.campus_id)
          .eq("ministry_type", event.ministry_type)
          .eq("weekend_date", event.event_date)
          .limit(1)
          .maybeSingle();
        teachingWeekId = weekMatch?.id || null;
      }

      const { data, error } = await supabase
        .from("events")
        .insert({
          title: event.title,
          description: event.description,
          event_date: event.event_date,
          start_time: event.start_time,
          end_time: event.end_time,
          campus_id: event.campus_id,
          campus_ids: event.campus_ids?.length ? event.campus_ids : event.campus_id ? [event.campus_id] : null,
          ministry_type: event.ministry_type || "weekend",
          ministry_types: event.ministry_types?.length ? event.ministry_types : event.ministry_type ? [event.ministry_type] : null,
          audience_type: event.audience_type || "volunteers_only",
          teaching_week_id: teachingWeekId,
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      toast({ title: "Event created successfully" });
    },
    onError: (error) => {
      toast({
        title: "Error creating event",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useDeleteEvent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (eventId: string) => {
      const { error } = await supabase
        .from("events")
        .delete()
        .eq("id", eventId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      toast({ title: "Event deleted" });
    },
    onError: (error) => {
      toast({
        title: "Error deleting event",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useToggleEventRsvp() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ eventId, isComing }: { eventId: string; isComing: boolean }) => {
      if (!user?.id) throw new Error("You must be signed in to respond to an event.");

      if (isComing) {
        const { error } = await supabase
          .from("event_rsvps")
          .delete()
          .eq("event_id", eventId)
          .eq("user_id", user.id);

        if (error) throw error;
        return;
      }

      const { error } = await supabase
        .from("event_rsvps")
        .upsert(
          {
            event_id: eventId,
            user_id: user.id,
            status: "coming",
          },
          { onConflict: "event_id,user_id" }
        );

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
    onError: (error) => {
      toast({
        title: "Couldn't update response",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
