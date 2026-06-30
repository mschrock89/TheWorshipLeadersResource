import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getCurrentResourceAppKey, isStudentResourceAppKey } from "@/lib/resourceApp";

export type CampStatus = "draft" | "active" | "archived";
export type CampAudience = "everyone" | "ms" | "hs" | "leaders";

export interface CampInstance {
  id: string;
  name: string;
  slug: string;
  status: CampStatus;
  start_date: string;
  end_date: string;
  base_ministry_type: string;
  resource_app_keys: string[];
  campus_ids: string[] | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampContentSection {
  id: string;
  camp_instance_id: string;
  title: string;
  body: string | null;
  link_url: string | null;
  audience: CampAudience;
  sort_order: number;
  is_published: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampInstanceInput {
  id?: string;
  name: string;
  slug?: string;
  status: CampStatus;
  start_date: string;
  end_date: string;
  campus_ids?: string[] | null;
  resource_app_keys?: string[];
}

export interface CampContentInput {
  id?: string;
  camp_instance_id: string;
  title: string;
  body?: string | null;
  link_url?: string | null;
  audience: CampAudience;
  sort_order?: number;
  is_published?: boolean;
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function getAudienceForResourceApp(resourceAppKey: string): "ms" | "hs" | null {
  if (resourceAppKey === "students_ms") return "ms";
  if (resourceAppKey === "students_hs") return "hs";
  return null;
}

export function shouldShowCampContentSection(
  section: CampContentSection,
  params: { resourceAppKey: string; isLeader: boolean },
) {
  if (section.audience === "everyone") return true;
  if (section.audience === "leaders") return params.isLeader;
  return section.audience === getAudienceForResourceApp(params.resourceAppKey);
}

export function useActiveCampMode() {
  const { user, isLoading } = useAuth();
  const resourceAppKey = getCurrentResourceAppKey();

  return useQuery({
    queryKey: ["camp-mode", "active", resourceAppKey, user?.id],
    enabled: !!user && !isLoading && isStudentResourceAppKey(resourceAppKey),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("camp_instances")
        .select("*")
        .eq("status", "active")
        .contains("resource_app_keys", [resourceAppKey])
        .order("start_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return (data || null) as CampInstance | null;
    },
  });
}

export function useCampInstances() {
  const { user, isLoading } = useAuth();

  return useQuery({
    queryKey: ["camp-mode", "instances", user?.id],
    enabled: !!user && !isLoading,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("camp_instances")
        .select("*")
        .order("start_date", { ascending: false });

      if (error) throw error;
      return (data || []) as CampInstance[];
    },
  });
}

export function useCampContentSections(campInstanceId?: string | null) {
  const { isLeader } = useAuth();
  const resourceAppKey = getCurrentResourceAppKey();

  return useQuery({
    queryKey: ["camp-mode", "content", campInstanceId, resourceAppKey, isLeader],
    enabled: !!campInstanceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("camp_content_sections")
        .select("*")
        .eq("camp_instance_id", campInstanceId)
        .eq("is_published", true)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

      if (error) throw error;
      return ((data || []) as CampContentSection[]).filter((section) =>
        shouldShowCampContentSection(section, { resourceAppKey, isLeader }),
      );
    },
  });
}

export function useSaveCampInstance() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: CampInstanceInput) => {
      if (!user?.id) throw new Error("You must be signed in to manage Camp Mode.");

      const payload = {
        name: input.name.trim(),
        slug: (input.slug?.trim() || slugify(input.name)) || "student-camp",
        status: input.status,
        start_date: input.start_date,
        end_date: input.end_date,
        base_ministry_type: "student_camp",
        resource_app_keys: input.resource_app_keys?.length
          ? input.resource_app_keys
          : ["students_hs", "students_ms"],
        campus_ids: input.campus_ids?.length ? input.campus_ids : null,
        created_by: user.id,
      };

      const query = input.id
        ? supabase.from("camp_instances").update(payload).eq("id", input.id)
        : supabase.from("camp_instances").insert(payload);

      const { data, error } = await query.select("*").single();
      if (error) throw error;
      return data as CampInstance;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["camp-mode"] });
    },
  });
}

export function useSaveCampContentSection() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: CampContentInput) => {
      if (!user?.id) throw new Error("You must be signed in to manage Camp Mode.");

      const payload = {
        camp_instance_id: input.camp_instance_id,
        title: input.title.trim(),
        body: input.body?.trim() || null,
        link_url: input.link_url?.trim() || null,
        audience: input.audience,
        sort_order: input.sort_order ?? 0,
        is_published: input.is_published ?? true,
        created_by: user.id,
      };

      const query = input.id
        ? supabase.from("camp_content_sections").update(payload).eq("id", input.id)
        : supabase.from("camp_content_sections").insert(payload);

      const { data, error } = await query.select("*").single();
      if (error) throw error;
      return data as CampContentSection;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["camp-mode", "content", variables.camp_instance_id] });
      queryClient.invalidateQueries({ queryKey: ["camp-mode"] });
    },
  });
}

export function useDeleteCampContentSection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (section: Pick<CampContentSection, "id" | "camp_instance_id">) => {
      const { error } = await supabase
        .from("camp_content_sections")
        .delete()
        .eq("id", section.id);

      if (error) throw error;
      return section;
    },
    onSuccess: (section) => {
      queryClient.invalidateQueries({ queryKey: ["camp-mode", "content", section.camp_instance_id] });
      queryClient.invalidateQueries({ queryKey: ["camp-mode"] });
    },
  });
}
