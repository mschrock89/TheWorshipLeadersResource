import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { isNativeApp } from "@/lib/native";

/**
 * On the native app, tapping a push notification should deep-link to the
 * screen it references (the `url` field every notify-* function already
 * sends). Mounted inside the router so navigation keeps app state.
 */
export function NativePushTapHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isNativeApp()) return;

    let removeListener: (() => void) | undefined;

    void (async () => {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      const handle = await PushNotifications.addListener(
        "pushNotificationActionPerformed",
        (action) => {
          const url = action.notification.data?.url;
          if (typeof url !== "string" || !url) return;

          try {
            // Notification URLs may be absolute (pointing at the website) or
            // relative; either way, navigate to the in-app path.
            const path = url.startsWith("http")
              ? new URL(url).pathname + new URL(url).search
              : url;
            navigate(path);
          } catch (error) {
            console.error("Failed to route push notification tap:", error);
          }
        },
      );
      removeListener = () => void handle.remove();
    })();

    return () => removeListener?.();
  }, [navigate]);

  return null;
}
