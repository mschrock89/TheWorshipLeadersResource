import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export interface AdminPushPref {
  user_id: string;
  campus_id: string;
  channel: string;
  enabled: boolean;
  updated_at: string;
}

export interface AdminPushSettings {
  user_id: string;
  explicit_only: boolean;
  updated_at: string;
}

export function useAdminPushPrefs(userId: string | undefined) {
  return useQuery({
    queryKey: ["admin-push-prefs", userId],
    queryFn: async () => {
      if (!userId) return [] as AdminPushPref[];

      const { data, error } = await supabase
        .from("user_admin_push_prefs")
        .select("*")
        .eq("user_id", userId);

      if (error) throw error;
      return (data || []) as AdminPushPref[];
    },
    enabled: !!userId,
  });
}

export function useAdminPushSettings(userId: string | undefined) {
  return useQuery({
    queryKey: ["admin-push-settings", userId],
    queryFn: async () => {
      if (!userId) return null;

      const { data, error } = await supabase
        .from("user_admin_push_settings")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) throw error;
      return (data as AdminPushSettings | null) ?? null;
    },
    enabled: !!userId,
  });
}

export function useSetAdminPushPref() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      campusId,
      channel,
      enabled,
    }: {
      userId: string;
      campusId: string;
      channel: string;
      enabled: boolean;
    }) => {
      const { error } = await supabase.from("user_admin_push_prefs").upsert(
        {
          user_id: userId,
          campus_id: campusId,
          channel,
          enabled,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,campus_id,channel" },
      );

      if (error) throw error;
      return { userId, campusId, channel, enabled };
    },
    onMutate: async ({ userId, campusId, channel, enabled }) => {
      const queryKey = ["admin-push-prefs", userId];
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<AdminPushPref[]>(queryKey);

      queryClient.setQueryData<AdminPushPref[]>(queryKey, (current = []) => {
        const without = current.filter(
          (row) => !(row.campus_id === campusId && row.channel === channel),
        );
        return [
          ...without,
          {
            user_id: userId,
            campus_id: campusId,
            channel,
            enabled,
            updated_at: new Date().toISOString(),
          },
        ];
      });

      return { previous, queryKey };
    },
    onError: (error, _vars, context) => {
      if (context?.previous && context.queryKey) {
        queryClient.setQueryData(context.queryKey, context.previous);
      }
      console.error("Failed to update admin push preference:", error);
      toast.error("Failed to update notification preference");
    },
    onSettled: (_data, _error, vars) => {
      queryClient.invalidateQueries({ queryKey: ["admin-push-prefs", vars.userId] });
    },
  });
}
