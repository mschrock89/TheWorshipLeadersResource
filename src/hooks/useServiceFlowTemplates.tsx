import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface ServiceFlowTemplate {
  id: string;
  campus_id: string;
  ministry_type: string;
  name: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServiceFlowTemplateItem {
  id: string;
  template_id: string;
  item_type: "header" | "item" | "song_placeholder";
  title: string;
  default_duration_seconds: number | null;
  sequence_order: number;
  created_at: string;
}

export function useServiceFlowTemplates(campusId?: string | null, ministryType?: string | null) {
  return useQuery({
    queryKey: ["service-flow-templates", campusId, ministryType],
    queryFn: async () => {
      let query = supabase
        .from("service_flow_templates")
        .select("*")
        .order("name", { ascending: true });
      
      if (campusId) {
        query = query.eq("campus_id", campusId);
      }
      if (ministryType) {
        query = query.eq("ministry_type", ministryType);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as ServiceFlowTemplate[];
    },
  });
}

export function useServiceFlowTemplate(campusId: string | null, ministryType: string | null) {
  return useQuery({
    queryKey: ["service-flow-template", campusId, ministryType],
    queryFn: async () => {
      if (!campusId || !ministryType) return null;
      
      const { data, error } = await supabase
        .from("service_flow_templates")
        .select("*")
        .eq("campus_id", campusId)
        .eq("ministry_type", ministryType)
        .maybeSingle();
      
      if (error) throw error;
      return data as ServiceFlowTemplate | null;
    },
    enabled: !!campusId && !!ministryType,
  });
}

export function useServiceFlowTemplateItems(templateId: string | null) {
  return useQuery({
    queryKey: ["service-flow-template-items", templateId],
    queryFn: async () => {
      if (!templateId) return [];
      
      const { data, error } = await supabase
        .from("service_flow_template_items")
        .select("*")
        .eq("template_id", templateId)
        .order("sequence_order", { ascending: true });
      
      if (error) throw error;
      return data as ServiceFlowTemplateItem[];
    },
    enabled: !!templateId,
  });
}

export function useSaveServiceFlowTemplate() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (template: {
      id?: string;
      campus_id: string;
      ministry_type: string;
      name: string;
      created_by?: string;
    }) => {
      if (template.id) {
        const { data, error } = await supabase
          .from("service_flow_templates")
          .update({
            name: template.name,
          })
          .eq("id", template.id)
          .select()
          .single();

        if (error) throw error;
        return data as ServiceFlowTemplate;
      } else {
        const { data, error } = await supabase
          .from("service_flow_templates")
          .insert({
            campus_id: template.campus_id,
            ministry_type: template.ministry_type,
            name: template.name,
            created_by: template.created_by,
          })
          .select()
          .single();

        if (error) throw error;
        return data as ServiceFlowTemplate;
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ["service-flow-templates"],
      });
      queryClient.invalidateQueries({
        queryKey: ["service-flow-template", data.campus_id, data.ministry_type],
      });
      toast({
        title: "Template saved",
        description: "Service flow template has been saved.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error saving template",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useDeleteServiceFlowTemplate() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (templateId: string) => {
      const { error } = await supabase
        .from("service_flow_templates")
        .delete()
        .eq("id", templateId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["service-flow-templates"],
      });
      toast({
        title: "Template deleted",
        description: "Service flow template has been deleted.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error deleting template",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useSaveServiceFlowTemplateItem() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (item: {
      id?: string;
      template_id: string;
      item_type: "header" | "item" | "song_placeholder";
      title: string;
      default_duration_seconds?: number | null;
      sequence_order: number;
    }) => {
      if (item.id) {
        const { data, error } = await supabase
          .from("service_flow_template_items")
          .update({
            item_type: item.item_type,
            title: item.title,
            default_duration_seconds: item.default_duration_seconds,
            sequence_order: item.sequence_order,
          })
          .eq("id", item.id)
          .select()
          .single();

        if (error) throw error;
        return data as ServiceFlowTemplateItem;
      } else {
        const { data, error } = await supabase
          .from("service_flow_template_items")
          .insert({
            template_id: item.template_id,
            item_type: item.item_type,
            title: item.title,
            default_duration_seconds: item.default_duration_seconds,
            sequence_order: item.sequence_order,
          })
          .select()
          .single();

        if (error) throw error;
        return data as ServiceFlowTemplateItem;
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ["service-flow-template-items", data.template_id],
      });
    },
    onError: (error) => {
      toast({
        title: "Error saving item",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useDeleteServiceFlowTemplateItem() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: { id: string; templateId: string }) => {
      const { error } = await supabase
        .from("service_flow_template_items")
        .delete()
        .eq("id", params.id);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["service-flow-template-items", variables.templateId],
      });
    },
    onError: (error) => {
      toast({
        title: "Error deleting item",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useReorderServiceFlowTemplateItems() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: {
      templateId: string;
      items: { id: string; sequence_order: number }[];
    }) => {
      const updates = params.items.map((item) =>
        supabase
          .from("service_flow_template_items")
          .update({ sequence_order: item.sequence_order })
          .eq("id", item.id)
      );

      const results = await Promise.all(updates);
      const errors = results.filter((r) => r.error);
      if (errors.length > 0) throw errors[0].error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["service-flow-template-items", variables.templateId],
      });
    },
    onError: (error) => {
      toast({
        title: "Error reordering items",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
