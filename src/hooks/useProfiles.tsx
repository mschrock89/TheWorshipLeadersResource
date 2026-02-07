import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export type TeamPosition = 
  | "vocalist"
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
}

export interface BasicProfile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

// Use the secure RPC function that masks sensitive data based on consent
export function useProfiles() {
  return useQuery({
    queryKey: ["profiles"],
    staleTime: 2 * 60 * 1000, // 2 minutes - profiles change occasionally
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_profiles_for_campus");
      
      if (error) throw error;
      return data as Profile[];
    },
  });
}

// Use this for chat/team display - only returns basic info (id, name, avatar)
export function useBasicProfiles() {
  return useQuery({
    queryKey: ["basic-profiles"],
    staleTime: 2 * 60 * 1000, // 2 minutes - basic profiles change occasionally
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_basic_profiles");
      
      if (error) throw error;
      return data as BasicProfile[];
    },
  });
}

// Use the secure RPC function for viewing individual profiles
export function useProfile(id: string | undefined) {
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
      return profile as Profile | null;
    },
    enabled: !!id,
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

// Use dedicated function for birthdays - accessible to all authenticated users
export function useUpcomingBirthdays() {
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
  });
}

// Use secure function for anniversaries - only returns data user has permission to see
export function useUpcomingAnniversaries() {
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
  });
}
