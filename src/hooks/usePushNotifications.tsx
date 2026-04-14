import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function arrayBufferToBase64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) return "";

  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }

  return window
    .btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function isIosDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function isStandaloneDisplayMode() {
  return window.matchMedia?.("(display-mode: standalone)")?.matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function uint8ArraysEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function usePushNotifications() {
  const { user } = useAuth();
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [supportMessage, setSupportMessage] = useState<string | null>(null);

  const ensureRegistration = useCallback(async () => {
    return navigator.serviceWorker.register("/sw.js");
  }, []);

  const deleteSubscriptionRecord = useCallback(async (endpoint: string) => {
    const { error } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", endpoint);

    if (error) {
      throw error;
    }
  }, []);

  const hasCurrentVapidKey = useCallback((subscription: PushSubscription) => {
    if (!VAPID_PUBLIC_KEY) return false;

    const currentServerKey = subscription.options.applicationServerKey;
    if (!currentServerKey) return false;

    const expectedServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
    return uint8ArraysEqual(new Uint8Array(currentServerKey), expectedServerKey);
  }, []);

  const saveSubscription = useCallback(async (subscription: PushSubscription) => {
    if (!user) return false;

    const subscriptionJson = subscription.toJSON();
    const p256dh = subscriptionJson.keys?.p256dh || arrayBufferToBase64Url(subscription.getKey("p256dh"));
    const auth = subscriptionJson.keys?.auth || arrayBufferToBase64Url(subscription.getKey("auth"));

    const { error } = await supabase.functions.invoke("save-push-subscription", {
      body: {
        endpoint: subscription.endpoint,
        p256dh,
        auth,
      },
    });

    if (error) {
      throw error;
    }

    return true;
  }, [user]);

  const refreshSubscriptionState = useCallback(async () => {
    if (!isSupported || !user) {
      setIsSubscribed(false);
      setIsLoading(false);
      return false;
    }

    try {
      setPermission(Notification.permission);

      const registration = await ensureRegistration();
      const subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        setIsSubscribed(false);
        return false;
      }

      if (!hasCurrentVapidKey(subscription)) {
        await subscription.unsubscribe();
        await deleteSubscriptionRecord(subscription.endpoint);
        setIsSubscribed(false);
        return false;
      }

      setIsSubscribed(true);

      const { data, error } = await supabase
        .from("push_subscriptions")
        .select("id, user_id")
        .eq("endpoint", subscription.endpoint)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data || data.user_id !== user.id) {
        await saveSubscription(subscription);
      }

      return true;
    } catch (error) {
      console.error("Error checking push subscription:", error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [deleteSubscriptionRecord, ensureRegistration, hasCurrentVapidKey, isSupported, saveSubscription, user]);

  // Check if push notifications are supported
  useEffect(() => {
    const hasCoreSupport = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    const secureContextSupported = window.isSecureContext;
    const requiresStandaloneInstall = isIosDevice() && !isStandaloneDisplayMode();
    const hasVapidKey = Boolean(VAPID_PUBLIC_KEY);
    const supported = hasCoreSupport && secureContextSupported && !requiresStandaloneInstall && hasVapidKey;

    setIsSupported(supported);

    if (supported || hasCoreSupport) {
      setPermission(Notification.permission);
    }

    if (!hasCoreSupport) {
      setSupportMessage("This browser does not support push notifications.");
      return;
    }

    if (!secureContextSupported) {
      setSupportMessage("Push notifications require HTTPS.");
      return;
    }

    if (requiresStandaloneInstall) {
      setSupportMessage("On iPhone and iPad, install the app to your Home Screen to enable push notifications.");
      return;
    }

    if (!hasVapidKey) {
      setSupportMessage("Push notifications are not configured yet.");
      return;
    }

    setSupportMessage(null);
  }, []);

  // Register service worker and check subscription status
  useEffect(() => {
    if (!isSupported || !user) {
      setIsLoading(false);
      return;
    }

    void refreshSubscriptionState();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshSubscriptionState();
      }
    };

    window.addEventListener("focus", handleVisibilityChange);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleVisibilityChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isSupported, refreshSubscriptionState, user]);

  const subscribe = useCallback(async () => {
    if (!isSupported) {
      toast.error(supportMessage || "Push notifications are not supported in this browser");
      return false;
    }
    if (!user) {
      toast.error("You must be logged in to enable push notifications");
      return false;
    }
    if (!VAPID_PUBLIC_KEY) {
      console.error("VAPID_PUBLIC_KEY is not configured. Value:", import.meta.env.VITE_VAPID_PUBLIC_KEY);
      toast.error("Push notifications are not configured. Please contact support.");
      return false;
    }

    try {
      setIsLoading(true);

      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);

      if (permissionResult !== "granted") {
        toast.error("Notification permission denied");
        return false;
      }

      const registration = await ensureRegistration();
      let subscription = await registration.pushManager.getSubscription();

      if (subscription && !hasCurrentVapidKey(subscription)) {
        await subscription.unsubscribe();
        await deleteSubscriptionRecord(subscription.endpoint);
        subscription = null;
      }

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }

      await saveSubscription(subscription);

      setIsSubscribed(true);
      toast.success("Push notifications enabled!");
      return true;
    } catch (error) {
      console.error("Error subscribing to push:", error);
      const message = error instanceof Error ? error.message : "Failed to enable push notifications";
      toast.error(message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [deleteSubscriptionRecord, ensureRegistration, hasCurrentVapidKey, isSupported, saveSubscription, supportMessage, user]);

  const resync = useCallback(async () => {
    if (!isSupported) {
      toast.error(supportMessage || "Push notifications are not supported in this browser");
      return false;
    }
    if (!user) {
      toast.error("You must be logged in to sync push notifications");
      return false;
    }
    if (!VAPID_PUBLIC_KEY) {
      toast.error("Push notifications are not configured. Please contact support.");
      return false;
    }

    try {
      setIsLoading(true);
      setPermission(Notification.permission);

      const registration = await ensureRegistration();
      let subscription = await registration.pushManager.getSubscription();

      if (subscription && !hasCurrentVapidKey(subscription)) {
        // Rotate subscriptions only when the device is tied to an outdated VAPID key pair.
        await subscription.unsubscribe();
        await deleteSubscriptionRecord(subscription.endpoint);
        subscription = null;
      }

      if (!subscription) {
        const permissionResult = Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();
        setPermission(permissionResult);

        if (permissionResult !== "granted") {
          toast.error("Notification permission denied");
          setIsSubscribed(false);
          return false;
        }

        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }

      await saveSubscription(subscription);
      setIsSubscribed(true);
      toast.success("Push subscription synced!");
      return true;
    } catch (error) {
      console.error("Error syncing push subscription:", error);
      const message = error instanceof Error ? error.message : "Failed to sync push notifications";
      toast.error(message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [deleteSubscriptionRecord, ensureRegistration, hasCurrentVapidKey, isSupported, saveSubscription, supportMessage, user]);

  const unsubscribe = useCallback(async () => {
    if (!user) return false;

    try {
      setIsLoading(true);

      const registration = await ensureRegistration();
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await subscription.unsubscribe();
        await deleteSubscriptionRecord(subscription.endpoint);
      }

      setIsSubscribed(false);
      toast.success("Push notifications disabled");
      return true;
    } catch (error) {
      console.error("Error unsubscribing from push:", error);
      toast.error("Failed to disable push notifications");
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [deleteSubscriptionRecord, ensureRegistration, user]);

  return {
    isSupported,
    isSubscribed,
    isLoading,
    permission,
    supportMessage,
    subscribe,
    resync,
    unsubscribe,
  };
}
