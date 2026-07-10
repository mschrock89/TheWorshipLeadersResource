import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useToast } from "./use-toast";

type AppRole = Database["public"]["Enums"]["app_role"];

export type ResourceAppScope = "all" | "worship" | "students_hs" | "students_ms" | "my_church_resource";

export interface CapabilityRow {
  key: string;
  label: string;
  category: string;
  description: string | null;
}

export interface RoleCapabilityRow {
  role: string;
  capability_key: string;
  resource_app: string;
}

export interface ApprovalRuleRow {
  id: string;
  resource_app: string;
  campus_id: string | null;
  ministry_type: string | null;
  requires_approval: boolean;
  approver_user_id: string | null;
  note: string | null;
}

export interface OverrideRow {
  user_id: string;
  capability_key: string;
  resource_app: string;
  granted: boolean;
  note: string | null;
  expires_at: string | null;
}

export interface BasicProfile {
  id: string;
  full_name: string | null;
}

// ---- Capabilities catalog ----
export function useCapabilitiesList() {
  return useQuery({
    queryKey: ["admin", "capabilities"],
    queryFn: async (): Promise<CapabilityRow[]> => {
      const { data, error } = await supabase
        .from("capabilities")
        .select("key, label, category, description")
        .order("category")
        .order("label");
      if (error) throw error;
      return (data || []) as CapabilityRow[];
    },
  });
}

// ---- Role → capability matrix ----
export function useRoleCapabilities() {
  return useQuery({
    queryKey: ["admin", "role-capabilities"],
    queryFn: async (): Promise<RoleCapabilityRow[]> => {
      const { data, error } = await supabase
        .from("role_capabilities")
        .select("role, capability_key, resource_app");
      if (error) throw error;
      return (data || []) as RoleCapabilityRow[];
    },
  });
}

export function useToggleRoleCapability() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (params: {
      role: AppRole;
      capability_key: string;
      resource_app: string;
      grant: boolean;
    }) => {
      if (params.grant) {
        const { error } = await supabase.from("role_capabilities").insert({
          role: params.role,
          capability_key: params.capability_key,
          resource_app: params.resource_app,
        });
        if (error && error.code !== "23505") throw error; // ignore duplicate
      } else {
        const { error } = await supabase
          .from("role_capabilities")
          .delete()
          .eq("role", params.role)
          .eq("capability_key", params.capability_key)
          .eq("resource_app", params.resource_app);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "role-capabilities"] });
      queryClient.invalidateQueries({ queryKey: ["capabilities"] });
    },
    onError: (error: Error) =>
      toast({ title: "Couldn't update grant", description: error.message, variant: "destructive" }),
  });
}

// ---- Setlist approval rules ----
export function useApprovalRules() {
  return useQuery({
    queryKey: ["admin", "approval-rules"],
    queryFn: async (): Promise<ApprovalRuleRow[]> => {
      const { data, error } = await supabase
        .from("setlist_approval_rules")
        .select("id, resource_app, campus_id, ministry_type, requires_approval, approver_user_id, note")
        .order("ministry_type", { nullsFirst: true });
      if (error) throw error;
      return (data || []) as ApprovalRuleRow[];
    },
  });
}

export function useUpsertApprovalRule() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (rule: Partial<ApprovalRuleRow> & { id?: string }) => {
      if (rule.id) {
        const { error } = await supabase
          .from("setlist_approval_rules")
          .update({
            requires_approval: rule.requires_approval,
            approver_user_id: rule.approver_user_id ?? null,
            ministry_type: rule.ministry_type ?? null,
            campus_id: rule.campus_id ?? null,
            note: rule.note ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", rule.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("setlist_approval_rules").insert({
          resource_app: rule.resource_app ?? "worship",
          campus_id: rule.campus_id ?? null,
          ministry_type: rule.ministry_type ?? null,
          requires_approval: rule.requires_approval ?? true,
          approver_user_id: rule.approver_user_id ?? null,
          note: rule.note ?? null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "approval-rules"] }),
    onError: (error: Error) =>
      toast({ title: "Couldn't save rule", description: error.message, variant: "destructive" }),
  });
}

export function useDeleteApprovalRule() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("setlist_approval_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "approval-rules"] }),
    onError: (error: Error) =>
      toast({ title: "Couldn't delete rule", description: error.message, variant: "destructive" }),
  });
}

// ---- Per-user overrides ----
export function useUserOverrides(userId: string | null) {
  return useQuery({
    queryKey: ["admin", "overrides", userId],
    enabled: !!userId,
    queryFn: async (): Promise<OverrideRow[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("user_capability_overrides")
        .select("user_id, capability_key, resource_app, granted, note, expires_at")
        .eq("user_id", userId);
      if (error) throw error;
      return (data || []) as OverrideRow[];
    },
  });
}

export function useSetUserOverride() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (o: {
      user_id: string;
      capability_key: string;
      resource_app: string;
      granted: boolean;
      expires_at?: string | null;
    }) => {
      const { error } = await supabase
        .from("user_capability_overrides")
        .upsert(
          { ...o, expires_at: o.expires_at ?? null, note: "Set via permissions admin." },
          { onConflict: "user_id,capability_key,resource_app" },
        );
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "overrides", vars.user_id] });
      queryClient.invalidateQueries({ queryKey: ["capabilities"] });
    },
    onError: (error: Error) =>
      toast({ title: "Couldn't set override", description: error.message, variant: "destructive" }),
  });
}

export function useRemoveUserOverride() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (o: { user_id: string; capability_key: string; resource_app: string }) => {
      const { error } = await supabase
        .from("user_capability_overrides")
        .delete()
        .eq("user_id", o.user_id)
        .eq("capability_key", o.capability_key)
        .eq("resource_app", o.resource_app);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "overrides", vars.user_id] });
      queryClient.invalidateQueries({ queryKey: ["capabilities"] });
    },
    onError: (error: Error) =>
      toast({ title: "Couldn't remove override", description: error.message, variant: "destructive" }),
  });
}

// ---- Shared lookups ----
export function useBasicProfiles() {
  return useQuery({
    queryKey: ["admin", "basic-profiles"],
    queryFn: async (): Promise<BasicProfile[]> => {
      const { data, error } = await supabase.rpc("get_basic_profiles");
      if (error) throw error;
      return ((data || []) as { id: string; full_name: string | null }[]).map((p) => ({
        id: p.id,
        full_name: p.full_name,
      }));
    },
  });
}

export function useCampusList() {
  return useQuery({
    queryKey: ["admin", "campus-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("campuses").select("id, name").order("name");
      if (error) throw error;
      return (data || []) as { id: string; name: string }[];
    },
  });
}
