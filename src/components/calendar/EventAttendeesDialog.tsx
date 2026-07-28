import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useState } from "react";

interface EventAttendee {
  user_id: string;
  full_name: string | null;
  rsvped_at: string;
}

interface EventAttendeesDialogProps {
  eventId: string;
  eventTitle: string;
  attendeeCount: number;
}

async function fetchEventAttendees(eventId: string): Promise<EventAttendee[]> {
  const { data: rsvps, error } = await supabase
    .from("event_rsvps")
    .select("user_id, created_at")
    .eq("event_id", eventId)
    .eq("status", "coming")
    .order("created_at", { ascending: true });
  if (error) throw error;

  const userIds = (rsvps || []).map((rsvp) => rsvp.user_id);
  if (userIds.length === 0) return [];

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", userIds);
  if (profilesError) throw profilesError;

  const nameById = new Map((profiles || []).map((profile) => [profile.id, profile.full_name]));

  return (rsvps || []).map((rsvp) => ({
    user_id: rsvp.user_id,
    full_name: nameById.get(rsvp.user_id) ?? null,
    rsvped_at: rsvp.created_at,
  }));
}

export function EventAttendeesDialog({ eventId, eventTitle, attendeeCount }: EventAttendeesDialogProps) {
  const [isOpen, setIsOpen] = useState(false);

  const { data: attendees, isLoading, error } = useQuery({
    queryKey: ["event-attendees", eventId],
    queryFn: () => fetchEventAttendees(eventId),
    enabled: isOpen,
  });

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-6 gap-1 rounded-full px-2.5 text-xs font-semibold">
          <Users className="h-3 w-3" />
          {attendeeCount} coming
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Who's Coming</DialogTitle>
          <DialogDescription>Everyone who said they're coming to "{eventTitle}".</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading attendees...
          </div>
        ) : error ? (
          <p className="py-4 text-sm text-destructive">
            {error instanceof Error ? error.message : "Failed to load attendees"}
          </p>
        ) : !attendees || attendees.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">No one has RSVP'd yet.</p>
        ) : (
          <div className="space-y-3">
            <Badge variant="secondary">
              {attendees.length} {attendees.length === 1 ? "person" : "people"} coming
            </Badge>
            <div className="max-h-64 overflow-y-auto overscroll-contain rounded-md border border-border">
              <div className="divide-y divide-border">
                {attendees.map((attendee) => (
                  <div key={attendee.user_id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{attendee.full_name || "Unnamed profile"}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {format(new Date(attendee.rsvped_at), "MMM d")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
