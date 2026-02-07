import { useState, useEffect } from "react";
import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePushNotifications } from "@/hooks/usePushNotifications";

const STORAGE_KEY = "push-notification-banner-dismissed";
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function PushNotificationBanner() {
  const { isSupported, isSubscribed, isLoading, permission, subscribe } = usePushNotifications();
  const [isDismissed, setIsDismissed] = useState(true); // Start hidden to prevent flash

  useEffect(() => {
    const dismissedAt = localStorage.getItem(STORAGE_KEY);
    if (dismissedAt) {
      const dismissedTime = parseInt(dismissedAt, 10);
      const now = Date.now();
      // Show banner again after 7 days
      if (now - dismissedTime > DISMISS_DURATION_MS) {
        localStorage.removeItem(STORAGE_KEY);
        setIsDismissed(false);
      }
    } else {
      setIsDismissed(false);
    }
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, Date.now().toString());
    setIsDismissed(true);
  };

  const handleEnable = async () => {
    const success = await subscribe();
    if (success) {
      setIsDismissed(true);
    }
  };

  // Don't show if:
  // - Not supported
  // - Already subscribed
  // - Loading subscription status
  // - User dismissed it
  // - Permission was denied (show different message in that case)
  if (!isSupported || isSubscribed || isLoading || isDismissed) {
    return null;
  }

  // If permission was denied, show a different message
  if (permission === "denied") {
    return (
      <div className="relative mb-6 overflow-hidden rounded-xl border border-destructive/30 bg-destructive/10 p-4">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/20">
            <Bell className="h-5 w-5 text-destructive" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground">Notifications Blocked</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Push notifications are blocked by your browser. To enable them, click the lock icon in your address bar and allow notifications.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={handleDismiss}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative mb-6 overflow-hidden rounded-xl border border-primary/30 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-4">
      {/* Decorative background element */}
      <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/10 blur-2xl" />
      
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex items-start gap-4 flex-1 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/20 animate-pulse">
            <Bell className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground">Stay in the loop!</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Enable push notifications to get updates about swap requests, new setlists, and schedule changes.
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground"
            onClick={handleDismiss}
          >
            Maybe Later
          </Button>
          <Button
            size="sm"
            className="gap-2"
            onClick={handleEnable}
          >
            <Bell className="h-4 w-4" />
            Enable
          </Button>
        </div>
      </div>
      
      {/* Close button for mobile */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-2 top-2 h-6 w-6 text-muted-foreground hover:text-foreground sm:hidden"
        onClick={handleDismiss}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}
