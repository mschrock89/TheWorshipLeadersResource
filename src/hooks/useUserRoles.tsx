import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];

interface UserRoleData {
  role: AppRole;
  admin_campus_id: string | null;
}

const BASE_APP_ROLES: AppRole[] = [
  'leader',
  'member',
  'campus_pastor',
  'network_worship_leader',
  'network_worship_pastor',
  'campus_worship_pastor',
  'network_student_pastor',
  'student_pastor',
  'student_worship_pastor',
  'childrens_pastor',
  'speaker',
  'video_director',
  'production_manager',
  'creative_team_lead',
  'audition_candidate',
  'student',
  'ms_leader',
  'ms_leader_weekend',
  'hs_leader',
  'volunteer',
  'leader',
  'member',
];

// Returns the highest priority role for display purposes along with admin_campus_id
export function useUserRole(userId: string | undefined) {
  return useQuery({
    queryKey: ["user-role", userId],
    queryFn: async () => {
      if (!userId) return null;
      
      const { data, error } = await supabase
        .from("user_roles")
        .select("role, admin_campus_id")
        .eq("user_id", userId);
      
      if (error) throw error;
      
      const roles = data || [];
      
      // Return highest priority role for display
      const priorityOrder: AppRole[] = ['admin', 'campus_admin', 'network_worship_pastor', 'network_worship_leader', 'campus_pastor', 'campus_worship_pastor', 'network_student_pastor', 'student_pastor', 'student_worship_pastor', 'childrens_pastor', 'speaker', 'video_director', 'production_manager', 'creative_team_lead', 'leader', 'audition_candidate', 'student', 'ms_leader', 'ms_leader_weekend', 'hs_leader', 'volunteer', 'member'];
      for (const priorityRole of priorityOrder) {
        const matchedRole = roles.find(r => r.role === priorityRole);
        if (matchedRole) {
          return matchedRole.role;
        }
      }
      return roles[0]?.role || null;
    },
    enabled: !!userId,
  });
}

// Returns all admin_campus_ids for a user (if they are a campus_admin)
// A user can be campus_admin for multiple campuses
export function useUserAdminCampuses(userId: string | undefined) {
  return useQuery({
    queryKey: ["user-admin-campuses", userId],
    queryFn: async () => {
      if (!userId) return [];
      
      const { data, error } = await supabase
        .from("user_roles")
        .select("admin_campus_id")
        .eq("user_id", userId)
        .eq("role", "campus_admin");
      
      if (error) throw error;
      return data?.map(r => r.admin_campus_id).filter(Boolean) as string[] || [];
    },
    enabled: !!userId,
  });
}

// Returns all roles for a user
export function useUserRoles(userId: string | undefined) {
  return useQuery({
    queryKey: ["user-roles", userId],
    queryFn: async () => {
      if (!userId) return [];
      
      const { data, error } = await supabase
        .from("user_roles")
        .select("role, admin_campus_id")
        .eq("user_id", userId)
        .order("sort_order", { ascending: true });
      
      if (error) throw error;
      return data?.map(r => ({ role: r.role as AppRole, admin_campus_id: r.admin_campus_id })) || [];
    },
    enabled: !!userId,
  });
}

export function useDirectoryBaseRoles() {
  return useQuery({
    queryKey: ["user-roles", "directory-base"],
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("role", BASE_APP_ROLES);

      if (error) throw error;

      return (data || []).map((row) => ({
        user_id: row.user_id,
        role: row.role as AppRole,
      }));
    },
  });
}

// Add a role to a user (keeps existing roles)
export function useAddUserRole() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ userId, role, adminCampusId }: { userId: string; role: AppRole; adminCampusId?: string | null }) => {
      const adminCampusValue = role === 'campus_admin' ? (adminCampusId || null) : null;

      // For campus_admin, check if this specific user+role+campus combo exists
      if (role === 'campus_admin' && adminCampusId) {
        const { data: existingRole } = await supabase
          .from("user_roles")
          .select("id")
          .eq("user_id", userId)
          .eq("role", role)
          .eq("admin_campus_id", adminCampusId)
          .maybeSingle();

        if (existingRole) {
          // Already exists, nothing to do
          return;
        }
      } else {
        // For non-campus_admin roles, check if user already has this role
        const { data: existingRole } = await supabase
          .from("user_roles")
          .select("id")
          .eq("user_id", userId)
          .eq("role", role)
          .maybeSingle();

        if (existingRole) {
          // Update existing role's admin_campus_id
          const { error } = await supabase
            .from("user_roles")
            .update({ admin_campus_id: adminCampusValue })
            .eq("id", existingRole.id);
          
          if (error) throw error;
          return;
        }
      }
      
      // Insert new role
      const { error } = await supabase
        .from("user_roles")
        .insert({ user_id: userId, role, admin_campus_id: adminCampusValue });
      
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["user-role", variables.userId] });
      queryClient.invalidateQueries({ queryKey: ["user-admin-campuses", variables.userId] });
      queryClient.invalidateQueries({ queryKey: ["user-roles", variables.userId] });
      queryClient.invalidateQueries({ queryKey: ["leadership-roles"] });
      toast({
        title: "Role added",
        description: "The role has been added to the user.",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to add role",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

// Remove a specific role from a user
// For campus_admin, can optionally specify which campus to remove
export function useRemoveUserRole() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ userId, role, adminCampusId }: { userId: string; role: AppRole; adminCampusId?: string | null }) => {
      let query = supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("role", role);
      
      // For campus_admin, if a specific campus is provided, only remove that one
      if (role === 'campus_admin' && adminCampusId) {
        query = query.eq("admin_campus_id", adminCampusId);
      }
      
      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["user-role", variables.userId] });
      queryClient.invalidateQueries({ queryKey: ["user-admin-campuses", variables.userId] });
      queryClient.invalidateQueries({ queryKey: ["user-roles", variables.userId] });
      queryClient.invalidateQueries({ queryKey: ["leadership-roles"] });
      toast({
        title: "Role removed",
        description: "The role has been removed from the user.",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to remove role",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

// Toggle a role on/off for a user
// For campus_admin, this toggles ALL campus_admin roles (use add/remove for specific campuses)
export function useToggleUserRole() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ userId, role, adminCampusId, hasRole }: { userId: string; role: AppRole; adminCampusId?: string | null; hasRole: boolean }) => {
      if (hasRole) {
        // Remove all instances of this role
        const { error } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", userId)
          .eq("role", role);
        
        if (error) throw error;
      } else {
        // Add the role (for campus_admin, add with first campus or null)
        const adminCampusValue = role === 'campus_admin' ? (adminCampusId || null) : null;
        const { error } = await supabase
          .from("user_roles")
          .insert({ user_id: userId, role, admin_campus_id: adminCampusValue });
        
        if (error) throw error;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["user-role", variables.userId] });
      queryClient.invalidateQueries({ queryKey: ["user-admin-campuses", variables.userId] });
      queryClient.invalidateQueries({ queryKey: ["user-roles", variables.userId] });
      queryClient.invalidateQueries({ queryKey: ["leadership-roles"] });
      toast({
        title: variables.hasRole ? "Role removed" : "Role added",
        description: variables.hasRole ? "The role has been removed." : "The role has been added.",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to update role",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

// Update base roles (replaces existing base roles but keeps leadership roles)
export function useUpdateBaseRoles() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ userId, roles }: { userId: string; roles: AppRole[] }) => {
      const nextRoles = Array.from(new Set(roles)).filter((role) =>
        BASE_APP_ROLES.includes(role),
      );

      if (nextRoles.length === 0) {
        throw new Error("Select at least one base role.");
      }

      if (nextRoles.length > 3) {
        throw new Error("A user can have up to three base roles.");
      }

      // Delete existing base roles
      const { error: deleteError } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .in("role", BASE_APP_ROLES);
      
      if (deleteError) throw deleteError;
      
      // Insert selected base roles, preserving the order they were chosen in
      // (primary, 2nd, 3rd) so the positions stick on reload.
      const { error: insertError } = await supabase
        .from("user_roles")
        .insert(nextRoles.map((role, index) => ({ user_id: userId, role, admin_campus_id: null, sort_order: index })));
      
      if (insertError) throw insertError;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["user-role", variables.userId] });
      queryClient.invalidateQueries({ queryKey: ["user-admin-campuses", variables.userId] });
      queryClient.invalidateQueries({ queryKey: ["user-roles", variables.userId] });
      queryClient.invalidateQueries({ queryKey: ["leadership-roles"] });
      toast({
        title: "Roles updated",
        description: "The user's base roles have been changed.",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to update roles",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

// Update one base role, preserving the original single-role call shape.
export function useUpdateBaseRole() {
  const updateBaseRoles = useUpdateBaseRoles();

  return {
    ...updateBaseRoles,
    mutate: (
      variables: { userId: string; role: AppRole },
      options?: Parameters<typeof updateBaseRoles.mutate>[1],
    ) => updateBaseRoles.mutate({ userId: variables.userId, roles: [variables.role] }, options),
    mutateAsync: (
      variables: { userId: string; role: AppRole },
      options?: Parameters<typeof updateBaseRoles.mutateAsync>[1],
    ) => updateBaseRoles.mutateAsync({ userId: variables.userId, roles: [variables.role] }, options),
  };
}
