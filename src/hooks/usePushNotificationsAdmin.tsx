import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "./use-toast";

export interface PushDefinitionRow {
  key: string;
  label: string;
  category: string;
  description: string | null;
  trigger_description: string | null;
  recipients_description: string | null;
  title_template: string;
  body_template: string;
  deep_link_url: string | null;
  template_variables: string[];
  enabled: boolean;
  content_from_db: boolean;
  is_system: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type PushDefinitionInput = {
  key: string;
  label: string;
  category: string;
  description?: string | null;
  trigger_description?: string | null;
  recipients_description?: string | null;
  title_template: string;
  body_template: string;
  deep_link_url?: string | null;
  template_variables?: string[];
  enabled?: boolean;
  content_from_db?: boolean;
  is_system?: boolean;
  sort_order?: number;
};

export interface PushLogRow {
  id: string;
  title: string;
  message: string;
  url: string | null;
  tag: string | null;
  context_type: string | null;
  created_at: string;
  canceled_at: string | null;
}

const DEFINITION_COLUMNS =
  "key, label, category, description, trigger_description, recipients_description, title_template, body_template, deep_link_url, template_variables, enabled, content_from_db, is_system, sort_order, created_at, updated_at";

export function usePushDefinitions() {
  return useQuery({
    queryKey: ["admin", "push-definitions"],
    queryFn: async (): Promise<PushDefinitionRow[]> => {
      const { data, error } = await supabase
        .from("push_notification_definitions")
        .select(DEFINITION_COLUMNS)
        .order("sort_order")
        .order("label");
      if (error) throw error;
      return (data || []) as PushDefinitionRow[];
    },
  });
}

export function useUpsertPushDefinition() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: PushDefinitionInput) => {
      const row = {
        key: input.key.trim(),
        label: input.label.trim(),
        category: input.category.trim(),
        description: input.description?.trim() || null,
        trigger_description: input.trigger_description?.trim() || null,
        recipients_description: input.recipients_description?.trim() || null,
        title_template: input.title_template.trim(),
        body_template: input.body_template.trim(),
        deep_link_url: input.deep_link_url?.trim() || null,
        template_variables: input.template_variables ?? [],
        enabled: input.enabled ?? true,
        content_from_db: input.content_from_db ?? false,
        is_system: input.is_system ?? false,
        sort_order: input.sort_order ?? 500,
      };
      const { error } = await supabase
        .from("push_notification_definitions")
        .upsert(row, { onConflict: "key" });
      if (error) throw error;
      return row.key;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "push-definitions"] });
      toast({ title: "Push notification saved" });
    },
    onError: (err: Error) => {
      toast({ title: "Could not save", description: err.message, variant: "destructive" });
    },
  });
}

export function useTogglePushDefinitionEnabled() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (params: { key: string; enabled: boolean }) => {
      const { error } = await supabase
        .from("push_notification_definitions")
        .update({ enabled: params.enabled })
        .eq("key", params.key);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "push-definitions"] });
      toast({ title: vars.enabled ? "Push enabled" : "Push disabled" });
    },
    onError: (err: Error) => {
      toast({ title: "Could not update", description: err.message, variant: "destructive" });
    },
  });
}

export function useDeletePushDefinition() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (key: string) => {
      const { error } = await supabase
        .from("push_notification_definitions")
        .delete()
        .eq("key", key)
        .eq("is_system", false);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "push-definitions"] });
      toast({ title: "Custom push removed" });
    },
    onError: (err: Error) => {
      toast({ title: "Could not delete", description: err.message, variant: "destructive" });
    },
  });
}

export function useRecentPushLogs(limit = 40) {
  return useQuery({
    queryKey: ["admin", "push-logs", limit],
    queryFn: async (): Promise<PushLogRow[]> => {
      const { data, error } = await supabase
        .from("push_notification_logs")
        .select("id, title, message, url, tag, context_type, created_at, canceled_at")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data || []) as PushLogRow[];
    },
  });
}

/** Render {{var}} placeholders for the live preview in the admin UI. */
export function renderPushTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) =>
    vars[key] != null && vars[key] !== "" ? vars[key] : `{{${key}}}`,
  );
}

export function parseTemplateVariables(raw: string): string[] {
  return raw
    .split(/[,\s]+/)
    .map((v) => v.trim().replace(/^\{\{|\}\}$/g, ""))
    .filter(Boolean);
}

export const PUSH_CATEGORIES = [
  "Setlists",
  "Schedule",
  "Swaps",
  "Chat",
  "Feed",
  "Events",
  "Team",
  "Admin",
  "Custom",
] as const;
