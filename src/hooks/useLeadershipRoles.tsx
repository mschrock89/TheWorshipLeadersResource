import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface LeadershipUser {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  role: string;
  campus_name: string | null;
  campus_id: string | null;
}

interface LeadershipRolesData {
  admins: LeadershipUser[];
  campusAdmins: LeadershipUser[];
  networkWorshipPastors: LeadershipUser[];
  worshipPastors: LeadershipUser[];
}

export function useLeadershipRoles() {
  return useQuery({
    queryKey: ["leadership-roles"],
    staleTime: 5 * 60 * 1000, // 5 minutes - leadership roles don't change often
    queryFn: async (): Promise<LeadershipRolesData> => {
      // Fetch roles, profiles, and campuses in parallel
      const [rolesResult, profilesResult, campusesResult] = await Promise.all([
        supabase
          .from("user_roles")
          .select("user_id, role, admin_campus_id")
          .in("role", ["admin", "campus_admin", "network_worship_pastor", "campus_worship_pastor", "student_worship_pastor"]),
        supabase.rpc("get_basic_profiles"),
        supabase.from("campuses").select("id, name"),
      ]);

      if (rolesResult.error) throw rolesResult.error;
      if (profilesResult.error) throw profilesResult.error;
      if (campusesResult.error) throw campusesResult.error;

      const roles = rolesResult.data || [];
      const profiles = profilesResult.data || [];
      const campuses = campusesResult.data || [];

      // Create lookup maps
      const profileMap = new Map(profiles.map(p => [p.id, p]));
      const campusMap = new Map(campuses.map(c => [c.id, c.name]));

      // Group by role type
      const admins: LeadershipUser[] = [];
      const campusAdmins: LeadershipUser[] = [];
      const networkWorshipPastors: LeadershipUser[] = [];
      const worshipPastors: LeadershipUser[] = [];

      roles.forEach(role => {
        const profile = profileMap.get(role.user_id);
        if (!profile) return;

        const user: LeadershipUser = {
          id: role.user_id,
          full_name: profile.full_name,
          avatar_url: profile.avatar_url,
          role: role.role,
          campus_name: role.admin_campus_id ? campusMap.get(role.admin_campus_id) || null : null,
          campus_id: role.admin_campus_id || null,
        };

        switch (role.role) {
          case "admin":
            // Avoid duplicates
            if (!admins.find(a => a.id === user.id)) {
              admins.push(user);
            }
            break;
          case "campus_admin":
            campusAdmins.push(user);
            break;
          case "network_worship_pastor":
            // Avoid duplicates
            if (!networkWorshipPastors.find(n => n.id === user.id)) {
              networkWorshipPastors.push(user);
            }
            break;
          case "campus_worship_pastor":
          case "student_worship_pastor":
            // Avoid duplicates
            if (!worshipPastors.find(p => p.id === user.id && p.role === user.role)) {
              worshipPastors.push(user);
            }
            break;
        }
      });

      // Sort by name
      const sortByName = (a: LeadershipUser, b: LeadershipUser) => 
        (a.full_name || "").localeCompare(b.full_name || "");

      return {
        admins: admins.sort(sortByName),
        campusAdmins: campusAdmins.sort(sortByName),
        networkWorshipPastors: networkWorshipPastors.sort(sortByName),
        worshipPastors: worshipPastors.sort(sortByName),
      };
    },
  });
}
