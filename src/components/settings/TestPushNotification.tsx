import { Loader2, CheckCircle, AlertCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useUserRole } from "@/hooks/useUserRoles";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { supabase } from "@/integrations/supabase/client";

export function TestPushNotification() {
  const { user } = useAuth();
  const { isSupported } = usePushNotifications();
  const { data: userRole } = useUserRole(user?.id);
  const [isSending, setIsSending] = useState(false);
  const [sent, setSent] = useState(false);
  
  // Only campus admins and above can test notifications
  const canTest = userRole === "admin" || userRole === "campus_admin" || 
                  userRole === "network_worship_pastor" || userRole === "network_worship_leader";

  const sendTestNotification = async () => {
    if (!user) {
      toast.error("You must be logged in");
      return;
    }

    setIsSending(true);
    setSent(false);

    try {
      // Send via VAPID/web-push to all subscribed users
      const { data, error } = await supabase.functions.invoke("send-push-notification", {
        body: {
          title: "Test Notification 🎵",
          message: "Push notifications are working! This is a test from your worship team.",
          url: "/dashboard",
          tag: "test-notification",
        },
      });

      if (error) {
        console.error("Push notification error:", error);
        toast.error("Failed to send test notification");
        return;
      }

      if (data?.error) {
        console.error("Push notification error:", data.error);
        toast.error(data.error);
        return;
      }

      setSent(true);
      const recipientCount = data?.sent || 0;
      toast.success(`Test notification sent to ${recipientCount} subscriber${recipientCount !== 1 ? 's' : ''}!`);
    } catch (error) {
      console.error("Error sending test notification:", error);
      toast.error("Failed to send test notification");
    } finally {
      setIsSending(false);
    }
  };

  // Don't show if not authorized
  if (!canTest) {
    return null;
  }

  // Show message if push not supported
  if (!isSupported) {
    return (
      <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
        <div className="flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Test Push Notifications</p>
            <p className="text-xs text-muted-foreground">
              Push notifications not supported in this browser
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
      <div className="flex items-center gap-3">
        <Send className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">Test Push Notifications</p>
          <p className="text-xs text-muted-foreground">
            Send a test to all subscribed volunteers
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {sent && (
          <CheckCircle className="h-4 w-4 text-green-500" />
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={sendTestNotification}
          disabled={isSending}
        >
          {isSending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Sending...
            </>
          ) : (
            "Send Test"
          )}
        </Button>
      </div>
    </div>
  );
}
