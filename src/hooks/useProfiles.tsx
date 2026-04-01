import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

export type TeamPosition = 
  | "vocalist"
  | "teacher" | "announcement" | "closing_prayer"
  | "lead_vocals" | "harmony_vocals" | "background_vocals"
  | "acoustic_guitar" | "acoustic_1" | "acoustic_2"
  | "electric_guitar" | "electric_1" | "electric_2"
  | "bass" | "drums" | "keys" | "piano"
  | "violin" | "cello" | "saxophone" | "trumpet" | "other_instrument"
  | "sound_tech" | "lighting" | "media" | "other"
  | "broadcast" | "camera_1" | "camera_2" | "camera_3" | "camera_4" | "camera_5" | "camera_6"
  | "chat_host" | "director" | "graphics" | "producer" | "switcher"
  | "audio_shadow" | "mon";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  birthday: string | null;
  anniversary: string | null;
  positions: TeamPosition[];
  ministry_types: string[];
  created_at?: string;
  updated_at?: string;
  welcome_email_sent_at: string | null;
  share_contact_with_pastors: boolean;
  share_contact_with_campus: boolean;
  gender: string | null;
  default_campus_id: string | null;
  following_jesus: boolean;
  serves_somewhere_else: boolean;
  attended_six_months: boolean;
}

export type ServingRequirementKey =
  | "following_jesus"
  | "serves_somewhere_else"
  | "attended_six_months";

type ServingRequirementsRow = {
  user_id: string;
  following_jesus: boolean;
  serves_somewhere_else: boolean;
  attended_six_months: boolean;
};

function isMissingServingRequirementsTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.message?.toLowerCase().includes("user_serving_requirements") ||
    error.message?.toLowerCase().includes("relation") && error.message?.toLowerCase().includes("does not exist")
  );
}

function mergeServingRequirements<T extends { id: string }>(
  items: T[],
  requirements: ServingRequirementsRow[] | null,
) {
  const requirementsByUserId = new Map(
    (requirements || []).map((row) => [row.user_id, row]),
  );

  return items.map((item) => {
    const row = requirementsByUserId.get(item.id);
    return {
      ...item,
      following_jesus: row?.following_jesus ?? false,
      serves_somewhere_else: row?.serves_somewhere_else ?? false,
      attended_six_months: row?.attended_six_months ?? false,
    };
  });
}

export interface BasicProfile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

export function useOnboardingStatus(userId: string | undefined) {
  const { user, isLoading } = useAuth();

  return useQuery({
    queryKey: ["onboarding-status", userId],
    queryFn: async () => {
      if (!userId) return true;

      const { data, error } = await supabase
        .from("profiles")
        .select("has_completed_onboarding")
        .eq("id", userId)
        .single();

      if (error) throw error;
      return data?.has_completed_onboarding ?? false;
    },
    enabled: !!userId && !!user && !isLoading,
  });
}

export function useCompleteOnboarding() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("profiles")
        .update({ has_completed_onboarding: true })
        .eq("id", userId);

      if (error) throw error;
    },
    onSuccess: (_, userId) => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-status", userId] });
    },
    onError: (error) => {
      toast({
        title: "Couldn't save onboarding",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

// Use the secure RPC function that masks sensitive data based on consent
export function useProfiles() {
  const { user, isLoading } = useAuth();

  return useQuery({
    queryKey: ["profiles"],
    staleTime: 2 * 60 * 1000, // 2 minutes - profiles change occasionally
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_profiles_for_campus");
      
      if (error) throw error;

      const profileIds = ((data || []) as Profile[]).map((profile) => profile.id);
      let requirements: ServingRequirementsRow[] | null = [];
      if (profileIds.length > 0) {
        const { data: requirementRows, error: requirementsError } = await supabase
          .from("user_serving_requirements")
          .select("user_id, following_jesus, serves_somewhere_else, attended_six_months")
          .in("user_id", profileIds);

        if (requirementsError) {
          if (!isMissingServingRequirementsTable(requirementsError)) {
            throw requirementsError;
          }
        } else {
          requirements = requirementRows;
        }
      }

      const { data: positionAssignments, error: positionsError } = await supabase
        .from("user_campus_ministry_positions")
        .select("user_id, position");

      if (positionsError) throw positionsError;

      const positionMap = new Map<string, Set<TeamPosition>>();

      (positionAssignments || []).forEach(({ user_id, position }) => {
        if (!positionMap.has(user_id)) {
          positionMap.set(user_id, new Set<TeamPosition>());
        }
        positionMap.get(user_id)?.add(position as TeamPosition);
      });

      return mergeServingRequirements(data as Profile[], requirements).map((profile) => {
        const mergedPositions = new Set<TeamPosition>(profile.positions || []);

        positionMap.get(profile.id)?.forEach((position) => {
          mergedPositions.add(position);
        });

        return {
          ...profile,
          positions: Array.from(mergedPositions),
        };
      });
    },
    enabled: !!user && !isLoading,
  });
}

// Use this for chat/team display - only returns basic info (id, name, avatar)
export function useBasicProfiles() {
  const { user, isLoading } = useAuth();

  return useQuery({
    queryKey: ["basic-profiles"],
    staleTime: 2 * 60 * 1000, // 2 minutes - basic profiles change occasionally
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_basic_profiles");
      
      if (error) throw error;
      return data as BasicProfile[];
    },
    enabled: !!user && !isLoading,
  });
}

// Use the secure RPC function for viewing individual profiles
export function useProfile(id: string | undefined) {
  const { user, isLoading } = useAuth();

  return useQuery({
    queryKey: ["profile", id],
    queryFn: async () => {
      if (!id) return null;
      
      // Use the secure function that masks sensitive data based on consent
      const { data, error } = await supabase.rpc("get_profile_safe", { 
        profile_id: id 
      });
      
      if (error) throw error;
      
      // The function returns an array, get the first item
      const profile = Array.isArray(data) ? data[0] : data;
      if (!profile) return null;

      const { data: requirements, error: requirementsError } = await supabase
        .from("user_serving_requirements")
        .select("user_id, following_jesus, serves_somewhere_else, attended_six_months")
        .eq("user_id", id)
        .maybeSingle();

      if (requirementsError && !isMissingServingRequirementsTable(requirementsError)) {
        throw requirementsError;
      }

      return {
        ...(profile as Profile),
        following_jesus: requirements?.following_jesus ?? false,
        serves_somewhere_else: requirements?.serves_somewhere_else ?? false,
        attended_six_months: requirements?.attended_six_months ?? false,
      } as Profile;
    },
    enabled: !!id && !!user && !isLoading,
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Profile> & { id: string }) => {
      const { data, error } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", id)
        .select();
      
      if (error) throw error;
      return data?.[0] ?? null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
      toast({ title: "Profile updated", description: "Changes saved successfully." });
    },
    onError: (error) => {
      toast({ 
        title: "Error", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });
}

export function useUpdateServingRequirements() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      userId,
      updates,
    }: {
      userId: string;
      updates: Partial<Pick<Profile, ServingRequirementKey>>;
    }) => {
      const { error } = await supabase
        .from("user_serving_requirements")
        .upsert({ user_id: userId, ...updates }, { onConflict: "user_id" });

      if (error && isMissingServingRequirementsTable(error)) {
        throw new Error("Serving requirements aren't available yet. The new database migration still needs to be applied.");
      }

      if (error) throw error;
    },
    onSuccess: (_, { userId }) => {
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
      queryClient.invalidateQueries({ queryKey: ["profile", userId] });
      toast({ title: "Serving requirements updated", description: "Changes saved successfully." });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

// Use dedicated function for birthdays - accessible to all authenticated users
export function useUpcomingBirthdays() {
  const { user, isLoading } = useAuth();

  return useQuery({
    queryKey: ["upcoming-birthdays"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_upcoming_birthdays");
      
      if (error) throw error;
      
      const today = new Date();
      const upcoming = (data as { id: string; full_name: string | null; avatar_url: string | null; birthday: string }[])
        .map(profile => {
          const bday = new Date(profile.birthday);
          const thisYearBday = new Date(today.getFullYear(), bday.getMonth(), bday.getDate());
          if (thisYearBday < today) {
            thisYearBday.setFullYear(today.getFullYear() + 1);
          }
          const daysUntil = Math.ceil((thisYearBday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          return { ...profile, daysUntil, nextDate: thisYearBday };
        })
        .filter(p => p.daysUntil <= 30)
        .sort((a, b) => a.daysUntil - b.daysUntil);
      
      return upcoming;
    },
    enabled: !!user && !isLoading,
  });
}

// Use secure function for anniversaries - only returns data user has permission to see
export function useUpcomingAnniversaries() {
  const { user, isLoading } = useAuth();

  return useQuery({
    queryKey: ["upcoming-anniversaries"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_profiles_for_campus");
      
      if (error) throw error;
      
      const today = new Date();
      const upcoming = (data as Profile[])
        .filter(profile => profile.anniversary) // Only profiles where anniversary is visible
        .map(profile => {
          const anniv = new Date(profile.anniversary!);
          const thisYearAnniv = new Date(today.getFullYear(), anniv.getMonth(), anniv.getDate());
          if (thisYearAnniv < today) {
            thisYearAnniv.setFullYear(today.getFullYear() + 1);
          }
          const daysUntil = Math.ceil((thisYearAnniv.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          const years = thisYearAnniv.getFullYear() - anniv.getFullYear();
          return { ...profile, daysUntil, nextDate: thisYearAnniv, years };
        })
        .filter(p => p.daysUntil <= 30)
        .sort((a, b) => a.daysUntil - b.daysUntil);
      
      return upcoming;
    },
    enabled: !!user && !isLoading,
  });
}
