import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAdmin: boolean;
  isLeader: boolean;
  isVideoDirector: boolean;
  isProductionManager: boolean;
  canManageTeam: boolean;
  canSwitchCampusChat: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLeader, setIsLeader] = useState(false);
  const [isVideoDirector, setIsVideoDirector] = useState(false);
  const [isProductionManager, setIsProductionManager] = useState(false);
  const [canManageTeam, setCanManageTeam] = useState(false);
  const [canSwitchCampusChat, setCanSwitchCampusChat] = useState(false);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        // Defer role check to avoid deadlock
        if (session?.user) {
          setTimeout(() => {
            checkUserRole(session.user.id);
          }, 0);
        } else {
          setIsAdmin(false);
          setIsLeader(false);
          setIsVideoDirector(false);
          setIsProductionManager(false);
          setCanManageTeam(false);
          setCanSwitchCampusChat(false);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        checkUserRole(session.user.id);
      }
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkUserRole = async (userId: string) => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    
    const roles = data?.map(r => r.role) || [];
    const hasRole = (role: typeof roles[number]) => roles.includes(role);
    
    setIsAdmin(hasRole("admin"));
    setIsLeader(hasRole("admin") || hasRole("campus_admin"));
    setIsVideoDirector(hasRole("admin") || hasRole("video_director"));
    setIsProductionManager(hasRole("admin") || hasRole("production_manager"));
    setCanManageTeam(
      hasRole("admin") ||
      hasRole("campus_admin") ||
      hasRole("campus_worship_pastor") ||
      hasRole("student_worship_pastor") ||
      hasRole("video_director") ||
      hasRole("production_manager")
    );
    setCanSwitchCampusChat(hasRole("admin") || hasRole("campus_admin") || hasRole("campus_worship_pastor"));
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const redirectUrl = `${window.location.origin}/`;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: { full_name: fullName },
      },
    });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setIsAdmin(false);
    setIsLeader(false);
    setIsVideoDirector(false);
    setIsProductionManager(false);
    setCanManageTeam(false);
    setCanSwitchCampusChat(false);
  };

  return (
    <AuthContext.Provider value={{ user, session, isLoading, isAdmin, isLeader, isVideoDirector, isProductionManager, canManageTeam, canSwitchCampusChat, signIn, signUp, signOut }}>
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
