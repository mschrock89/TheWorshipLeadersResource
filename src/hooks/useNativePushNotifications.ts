import { useState, useEffect, useCallback } from "react";
import { PushNotifications, type PermissionStatus } from "@capacitor/push-notifications";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { getCurrentResourceAppKey } from "@/lib/resourceApp";
import { isNativeApp } from "@/lib/native";

const DEVICE_TOKEN_STORAGE_KEY = "native-push-device-token";
const REGISTRATION_TIMEOUT_MS = 15000;

function apnsEndpoint(token: string) {
  return `apns:${token}`;
}

function mapPermission(status: PermissionStatus): NotificationPermission {
  if (status.receive === "granted") return "granted";
  if (status.receive === "denied") return "denied";
  return "default";
}

/**
 * Registers with APNs and resolves with the device token. The token arrives
 * via an event rather than the register() promise, so bridge it here.
 */
async function registerForToken(): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    let settled = false;

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error("Timed out waiting for push registration"));
      }
    }, REGISTRATION_TIMEOUT_MS);

    void PushNotifications.addListener("registration", (token) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        resolve(token.value);
      }
    });

    void PushNotifications.addListener("registrationError", (error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(new Error(error.error || "Push registration failed"));
      }
    });

    PushNotifications.register().catch((error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  });
}

export function useNativePushNotifications() {
  const { user } = useAuth();
  const resourceAppKey = getCurrentResourceAppKey();
  const isSupported = isNativeApp();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(isSupported);
  const [permission, setPermission] = useState<NotificationPermission>("default");

  const saveDeviceToken = useCallback(async (token: string) => {
    if (!user) return false;

    const row = {
      user_id: user.id,
      endpoint: apnsEndpoint(token),
      p256dh: "",
      auth: "",
      platform: "ios",
      device_token: token,
      resource_app_key: resourceAppKey,
      updated_at: new Date().toISOString(),
    };

    const { error: directError } = await supabase
      .from("push_subscriptions")
      .upsert(row, { onConflict: "endpoint" });

    if (!directError) return true;

    console.warn("Direct native push save failed, trying edge function:", directError);

    const { data, error } = await supabase.functions.invoke("save-push-subscription", {
      body: {
        endpoint: apnsEndpoint(token),
        p256dh: "",
        auth: "",
        platform: "ios",
        deviceToken: token,
        resourceAppKey,
      },
    });

    if (error) throw new Error(error.message);
    if (data && typeof data === "object" && "error" in data && data.error) {
      throw new Error(String(data.error));
    }

    return true;
  }, [user, resourceAppKey]);

  const deleteDeviceToken = useCallback(async (token: string) => {
    const { error } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", apnsEndpoint(token));

    if (error) throw error;
  }, []);

  const subscribe = useCallback(async () => {
    if (!isSupported) return false;
    if (!user) {
      toast.error("You must be logged in to enable push notifications");
      return false;
    }

    try {
      setIsLoading(true);

      let status = await PushNotifications.checkPermissions();
      if (status.receive === "prompt" || status.receive === "prompt-with-rationale") {
        status = await PushNotifications.requestPermissions();
      }
      setPermission(mapPermission(status));

      if (status.receive !== "granted") {
        toast.error("Notification permission denied. Enable notifications for this app in iOS Settings.");
        return false;
      }

      const token = await registerForToken();
      await saveDeviceToken(token);
      localStorage.setItem(DEVICE_TOKEN_STORAGE_KEY, token);

      setIsSubscribed(true);
      toast.success("Push notifications enabled!");
      return true;
    } catch (error) {
      console.error("Error enabling native push:", error);
      setIsSubscribed(false);
      toast.error(error instanceof Error ? error.message : "Failed to enable push notifications");
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, saveDeviceToken, user]);

  const unsubscribe = useCallback(async () => {
    if (!user) return false;

    try {
      setIsLoading(true);

      const token = localStorage.getItem(DEVICE_TOKEN_STORAGE_KEY);
      if (token) {
        await deleteDeviceToken(token);
        localStorage.removeItem(DEVICE_TOKEN_STORAGE_KEY);
      }
      await PushNotifications.unregister();

      setIsSubscribed(false);
      toast.success("Push notifications disabled");
      return true;
    } catch (error) {
      console.error("Error disabling native push:", error);
      toast.error("Failed to disable push notifications");
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [deleteDeviceToken, user]);

  // On resync, force a fresh registration and re-save the token.
  const resync = useCallback(async () => {
    return await subscribe();
  }, [subscribe]);

  // Restore subscription state on launch: if permission is granted and this
  // device previously registered, refresh the token (APNs tokens can rotate)
  // and make sure the row still belongs to the current user.
  useEffect(() => {
    if (!isSupported) {
      setIsLoading(false);
      return;
    }

    if (!user) {
      setIsSubscribed(false);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const status = await PushNotifications.checkPermissions();
        if (cancelled) return;
        setPermission(mapPermission(status));

        const storedToken = localStorage.getItem(DEVICE_TOKEN_STORAGE_KEY);
        if (status.receive !== "granted" || !storedToken) {
          setIsSubscribed(false);
          return;
        }

        const token = await registerForToken();
        if (cancelled) return;

        await saveDeviceToken(token);
        if (token !== storedToken) {
          localStorage.setItem(DEVICE_TOKEN_STORAGE_KEY, token);
          try {
            await deleteDeviceToken(storedToken);
          } catch (error) {
            console.warn("Failed to delete stale native push token:", error);
          }
        }

        if (!cancelled) setIsSubscribed(true);
      } catch (error) {
        console.error("Error restoring native push subscription:", error);
        if (!cancelled) setIsSubscribed(false);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [deleteDeviceToken, isSupported, saveDeviceToken, user]);

  return {
    isSupported,
    isSubscribed,
    isLoading,
    permission,
    supportMessage: null as string | null,
    subscribe,
    resync,
    unsubscribe,
  };
}
