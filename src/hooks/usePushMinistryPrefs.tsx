import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { normalizePushMinistryType } from "@/lib/pushMinistryPrefs";

export interface PushMinistryPref {
  user_id: string;
  ministry_type: string;
  enabled: boolean;
  updated_at: string;
}

export function usePushMinistryPrefs(userId: string | undefined) {
  return useQuery({
    queryKey: ["push-ministry-prefs", userId],
    queryFn: async () => {
      if (!userId) return [] as PushMinistryPref[];

      const { data, error } = await supabase
        .from("user_push_ministry_prefs")
        .select("*")
        .eq("user_id", userId);

      if (error) throw error;
      return (data || []) as PushMinistryPref[];
    },
    enabled: !!userId,
  });
}

/** Set of canonical ministry types the user has muted (enabled = false). */
export function useMutedPushMinistryTypes(userId: string | undefined) {
  const { data: prefs = [], ...rest } = usePushMinistryPrefs(userId);
  const muted = new Set<string>();
  for (const pref of prefs) {
    if (pref.enabled) continue;
    const normalized = normalizePushMinistryType(pref.ministry_type);
    if (normalized) muted.add(normalized);
  }
  return { muted, ...rest };
}

export function useTogglePushMinistryPref() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      ministryType,
      enabled,
    }: {
      ministryType: string;
      enabled: boolean;
    }) => {
      if (!user?.id) throw new Error("Not signed in");

      const canonical = normalizePushMinistryType(ministryType);
      if (!canonical) throw new Error("Invalid ministry type");

      if (enabled) {
        const { error } = await supabase
          .from("user_push_ministry_prefs")
          .delete()
          .eq("user_id", user.id)
          .eq("ministry_type", canonical);

        if (error) throw error;
        return { ministryType: canonical, enabled: true };
      }

      const { error } = await supabase.from("user_push_ministry_prefs").upsert(
        {
          user_id: user.id,
          ministry_type: canonical,
          enabled: false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,ministry_type" },
      );

      if (error) throw error;
      return { ministryType: canonical, enabled: false };
    },
    onMutate: async ({ ministryType, enabled }) => {
      if (!user?.id) return;
      const canonical = normalizePushMinistryType(ministryType);
      if (!canonical) return;

      const queryKey = ["push-ministry-prefs", user.id];
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<PushMinistryPref[]>(queryKey);

      queryClient.setQueryData<PushMinistryPref[]>(queryKey, (current = []) => {
        const without = current.filter((row) => {
          const normalized = normalizePushMinistryType(row.ministry_type);
          return normalized !== canonical;
        });
        if (enabled) return without;
        return [
          ...without,
          {
            user_id: user.id,
            ministry_type: canonical,
            enabled: false,
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
      console.error("Failed to update push ministry preference:", error);
      toast.error("Failed to update ministry notification preference");
    },
    onSettled: (_data, _error, _vars, context) => {
      if (context?.queryKey) {
        queryClient.invalidateQueries({ queryKey: context.queryKey });
      }
    },
  });
}
