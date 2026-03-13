import { useState } from "react";
import { Bell, Check, ArrowLeftRight, CheckCircle, XCircle, Music, CalendarPlus, Clock, FileCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNotifications, Notification } from "@/hooks/useNotifications";
import { useToggleEventRsvp } from "@/hooks/useEvents";
import { cn } from "@/lib/utils";
import { parseLocalDate } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

function NotificationIcon({ type }: { type: Notification["type"] }) {
  switch (type) {
    case "swap_request":
      return <ArrowLeftRight className="h-4 w-4 text-primary" />;
    case "swap_accepted":
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case "swap_declined":
      return <XCircle className="h-4 w-4 text-destructive" />;
    case "new_set":
      return <Music className="h-4 w-4 text-accent" />;
    case "new_event":
      return <CalendarPlus className="h-4 w-4 text-blue-500" />;
    case "pending_approval":
      return <Clock className="h-4 w-4 text-amber-500" />;
    case "approval_status":
      return <FileCheck className="h-4 w-4 text-green-500" />;
    default:
      return <Bell className="h-4 w-4" />;
  }
}

function NotificationItem({
  notification,
  onRead,
  onOpenEvent,
}: {
  notification: Notification;
  onRead: () => void;
  onOpenEvent: (notification: Notification) => void;
}) {
  if (notification.type === "new_event" && notification.eventDetails) {
    return (
      <button
        type="button"
        onClick={() => {
          onRead();
          onOpenEvent(notification);
        }}
        className={cn(
          "flex w-full items-start gap-3 border-b border-border p-3 text-left transition-colors hover:bg-muted/50 last:border-0",
          !notification.read && "bg-primary/5"
        )}
      >
        <div className="mt-0.5">
          <NotificationIcon type={notification.type} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className={cn("text-sm font-medium", !notification.read && "text-foreground")}>
              {notification.title}
            </p>
            {!notification.read && (
              <span className="h-2 w-2 rounded-full bg-primary flex-shrink-0" />
            )}
          </div>
          <p className="text-xs text-muted-foreground line-clamp-2">
            {notification.message}
          </p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            {formatDistanceToNow(new Date(notification.timestamp), { addSuffix: true })}
          </p>
        </div>
      </button>
    );
  }

  const linkTo = notification.link || "/swaps";
  
  return (
    <Link
      to={linkTo}
      onClick={onRead}
      className={cn(
        "flex items-start gap-3 p-3 hover:bg-muted/50 transition-colors border-b border-border last:border-0",
        !notification.read && "bg-primary/5"
      )}
    >
      <div className="mt-0.5">
        <NotificationIcon type={notification.type} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={cn("text-sm font-medium", !notification.read && "text-foreground")}>
            {notification.title}
          </p>
          {!notification.read && (
            <span className="h-2 w-2 rounded-full bg-primary flex-shrink-0" />
          )}
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2">
          {notification.message}
        </p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          {formatDistanceToNow(new Date(notification.timestamp), { addSuffix: true })}
        </p>
      </div>
    </Link>
  );
}

export function NotificationBell() {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const toggleEventRsvp = useToggleEventRsvp();
  const [selectedEventNotification, setSelectedEventNotification] = useState<Notification | null>(null);

  const eventDetails = selectedEventNotification?.eventDetails;

  const formatTime = (time: string | null) => {
    if (!time) return "";
    const [hours, minutes] = time.split(":");
    const numericHours = Number(hours);
    const suffix = numericHours >= 12 ? "PM" : "AM";
    const displayHour = numericHours % 12 || 12;
    return `${displayHour}:${minutes} ${suffix}`;
  };

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <Badge
                variant="destructive"
                className="absolute -top-1 -right-1 h-5 min-w-5 px-1 text-[10px] flex items-center justify-center animate-pulse"
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-0 bg-popover">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="font-semibold text-sm">Notifications</h3>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={markAllAsRead}
                className="h-auto py-1 px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                <Check className="h-3 w-3 mr-1" />
                Mark all read
              </Button>
            )}
          </div>
          <ScrollArea className="max-h-[400px]">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No notifications yet</p>
              </div>
            ) : (
              notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onRead={() => markAsRead(notification.id)}
                  onOpenEvent={setSelectedEventNotification}
                />
              ))
            )}
          </ScrollArea>
          {notifications.length > 0 && (
            <div className="p-2 border-t border-border">
              <Link to="/swaps">
                <Button variant="ghost" size="sm" className="w-full text-xs">
                  View all swap requests
                </Button>
              </Link>
            </div>
          )}
        </PopoverContent>
      </Popover>

      <Dialog open={Boolean(selectedEventNotification)} onOpenChange={(open) => !open && setSelectedEventNotification(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{eventDetails?.title || "Event"}</DialogTitle>
            <DialogDescription>
              {eventDetails
                ? `${parseLocalDate(eventDetails.eventDate).toLocaleDateString()}${eventDetails.campusName ? ` • ${eventDetails.campusName}` : ""}`
                : ""}
            </DialogDescription>
          </DialogHeader>

          {eventDetails && (
            <div className="space-y-4">
              {eventDetails.description && (
                <p className="text-sm text-muted-foreground">{eventDetails.description}</p>
              )}

              {(eventDetails.startTime || eventDetails.endTime) && (
                <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
                  {formatTime(eventDetails.startTime)}
                  {eventDetails.startTime && eventDetails.endTime && " - "}
                  {formatTime(eventDetails.endTime)}
                </div>
              )}

              {eventDetails.audienceType && (
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  {eventDetails.audienceType.replaceAll("_", " ")}
                </p>
              )}

              <Button
                className="w-full"
                variant={eventDetails.isComing ? "secondary" : "default"}
                disabled={toggleEventRsvp.isPending || eventDetails.isComing}
                onClick={async () => {
                  await toggleEventRsvp.mutateAsync({
                    eventId: eventDetails.eventId,
                    isComing: false,
                  });
                  setSelectedEventNotification((current) =>
                    current?.eventDetails
                      ? {
                          ...current,
                          eventDetails: {
                            ...current.eventDetails,
                            isComing: true,
                          },
                        }
                      : current
                  );
                }}
              >
                {eventDetails.isComing ? "You're Coming" : "Confirm I'm Coming"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
