import { Bell, BellOff, Loader2, RefreshCw } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useState } from "react";
import { toast } from "sonner";

export function PushNotificationToggle() {
  const { isSupported, isSubscribed, isLoading, permission, subscribe, unsubscribe } = usePushNotifications();
  const [isResyncing, setIsResyncing] = useState(false);

  if (!isSupported) {
    return (
      <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
        <BellOff className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">Push Notifications</p>
          <p className="text-xs text-muted-foreground">
            Not supported in this browser
          </p>
        </div>
      </div>
    );
  }

  if (permission === "denied") {
    return (
      <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
        <BellOff className="h-5 w-5 text-destructive" />
        <div>
          <p className="text-sm font-medium">Push Notifications</p>
          <p className="text-xs text-muted-foreground">
            Blocked by browser. Please enable in browser settings.
          </p>
        </div>
      </div>
    );
  }

  const handleToggle = async () => {
    if (isSubscribed) {
      await unsubscribe();
    } else {
      await subscribe();
    }
  };

  const handleResync = async () => {
    setIsResyncing(true);
    try {
      // Unsubscribe and resubscribe to refresh the subscription
      await unsubscribe();
      await subscribe();
      toast.success("Push subscription refreshed!");
    } catch (error) {
      console.error("Failed to resync:", error);
      toast.error("Failed to sync subscription");
    } finally {
      setIsResyncing(false);
    }
  };

  return (
    <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
      <div className="flex items-center gap-3">
        <Bell className="h-5 w-5 text-primary" />
        <div>
          <Label htmlFor="push-notifications" className="text-sm font-medium cursor-pointer">
            Push Notifications
          </Label>
          <p className="text-xs text-muted-foreground">
            Get notified about swap requests, new sets, and events
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {isSubscribed && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleResync}
            disabled={isResyncing || isLoading}
            title="Re-sync subscription"
            className="h-8 w-8"
          >
            <RefreshCw className={`h-4 w-4 ${isResyncing ? 'animate-spin' : ''}`} />
          </Button>
        )}
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <Switch
            id="push-notifications"
            checked={isSubscribed}
            onCheckedChange={handleToggle}
          />
        )}
      </div>
    </div>
  );
}
