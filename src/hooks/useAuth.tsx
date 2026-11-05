import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { getAppUrl } from "@/lib/resourceApps";
import { getCurrentResourceAppKey } from "@/lib/resourceApp";
import { isNativeApp } from "@/lib/native";
import { CAPABILITIES, capabilitySetAllows, fetchCapabilitySet, type CapabilityKey } from "@/lib/capabilities";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  can: (capability: CapabilityKey | string) => boolean;
  isAdmin: boolean;
  isLeader: boolean;
  isVideoDirector: boolean;
  isProductionManager: boolean;
  canManageTeam: boolean;
  canSwitchCampusChat: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const resourceApp = getCurrentResourceAppKey();

  const capsQuery = useQuery({
    queryKey: ["capabilities", user?.id, resourceApp],
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: () => fetchCapabilitySet(user!.id, resourceApp),
  });

  const caps = useMemo(
    () => (user ? capsQuery.data ?? new Set<string>() : new Set<string>()),
    [capsQuery.data, user],
  );
  const can = useCallback(
    (capability: CapabilityKey | string) => capabilitySetAllows(caps, capability),
    [caps],
  );
  const isAdmin = can(CAPABILITIES.ADMIN_FULL);
  const isLeader = can(CAPABILITIES.LEADER_ACCESS);
  const isVideoDirector = can(CAPABILITIES.VIDEO_DIRECTOR_TOOLS);
  const isProductionManager = can(CAPABILITIES.PRODUCTION_MANAGER_TOOLS);
  const canManageTeam = can(CAPABILITIES.MANAGE_TEAM);
  const canSwitchCampusChat = can(CAPABILITIES.SWITCH_CAMPUS_CHAT);
  const isLoading = sessionLoading || (!!user && capsQuery.isLoading && !capsQuery.data);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setSessionLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signUp = async (email: string, fullName: string) => {
    const redirectUrl = getAppUrl("/auth?mode=confirm-signup");
    const tempPassword = `${crypto.randomUUID()}!Wlr`;
    const { error } = await supabase.auth.signUp({
      email,
      password: tempPassword,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName,
          terms_accepted_at: new Date().toISOString(),
          terms_version: "2026-02-28",
        },
      },
    });
    return { error };
  };

  const signOut = async () => {
    // Native app: remove this device's APNs registration so a signed-out
    // device stops receiving the previous user's notifications.
    if (isNativeApp()) {
      try {
        const token = localStorage.getItem("native-push-device-token");
        if (token) {
          await supabase.from("push_subscriptions").delete().eq("endpoint", `apns:${token}`);
          localStorage.removeItem("native-push-device-token");
        }
        const { PushNotifications } = await import("@capacitor/push-notifications");
        await PushNotifications.unregister();
      } catch (error) {
        console.error("Failed to clean up native push registration during sign out:", error);
      }
    }

    if ("serviceWorker" in navigator) {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        const subscription = await registration?.pushManager.getSubscription();

        if (subscription && user?.id) {
          await subscription.unsubscribe();
          await supabase
            .from("push_subscriptions")
            .delete()
            .eq("endpoint", subscription.endpoint);
        }
      } catch (error) {
        console.error("Failed to clean up push subscription during sign out:", error);
      }
    }

    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, isLoading, can, isAdmin, isLeader, isVideoDirector, isProductionManager, canManageTeam, canSwitchCampusChat, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
