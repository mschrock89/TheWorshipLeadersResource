import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { getCurrentResourceAppKey } from "@/lib/resourceApp";
import {
  capabilitySetAllows,
  legacyCapabilitiesFromRoles,
  type CapabilityKey,
} from "@/lib/capabilities";

/**
 * Resolves the current user's effective capabilities for the active resource app
 * from role_capabilities + user_capability_overrides. If those tables aren't
 * deployed yet (or the query fails), it falls back to the legacy role logic so
 * `can()` keeps returning correct answers during the staged rollout.
 */
export function useCapabilities() {
  const { user } = useAuth();
  const resourceApp = getCurrentResourceAppKey();

  const query = useQuery({
    queryKey: ["capabilities", user?.id, resourceApp],
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Set<string>> => {
      if (!user?.id) return new Set<string>();

      const { data: roleRows, error: rolesError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      if (rolesError) {
        console.error("useCapabilities: failed to load roles:", rolesError);
        return new Set<string>();
      }
      const roles = (roleRows || []).map((r) => r.role as string);

      // Pull role grants and per-user overrides scoped to this app (or 'all').
      const appScope = [resourceApp, "all"];
      const [{ data: grants, error: grantsError }, { data: overrides, error: overridesError }] =
        await Promise.all([
          supabase
            .from("role_capabilities")
            .select("capability_key, role, resource_app")
            .in("resource_app", appScope),
          supabase
            .from("user_capability_overrides")
            .select("capability_key, granted, resource_app, expires_at")
            .eq("user_id", user.id)
            .in("resource_app", appScope),
        ]);

      // Tables not deployed yet (or transient failure): reproduce old behavior.
      if (grantsError || overridesError) {
        return legacyCapabilitiesFromRoles(roles, resourceApp);
      }

      const roleSet = new Set(roles);
      const caps = new Set<string>();
      for (const g of grants || []) {
        if (roleSet.has(g.role as string)) caps.add(g.capability_key);
      }
      // granted=false revokes and wins; granted=true grants. Expired overrides
      // (expires_at in the past) are ignored, matching has_capability in SQL.
      const nowMs = Date.now();
      const revoked = new Set<string>();
      for (const o of overrides || []) {
        if (o.expires_at && new Date(o.expires_at).getTime() <= nowMs) continue;
        if (o.granted) caps.add(o.capability_key);
        else revoked.add(o.capability_key);
      }
      for (const key of revoked) caps.delete(key);

      return caps;
    },
  });

  const caps = useMemo(() => query.data ?? new Set<string>(), [query.data]);

  const can = useCallback(
    (capability: CapabilityKey | string) => capabilitySetAllows(caps, capability),
    [caps],
  );

  return {
    can,
    capabilities: caps,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
