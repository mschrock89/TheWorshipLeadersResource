import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { useAuth } from "./useAuth";
import { getCurrentResourceAppKey } from "@/lib/resourceApp";
import {
  capabilitySetAllows,
  fetchCapabilitySet,
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
    queryFn: () => (user?.id ? fetchCapabilitySet(user.id, resourceApp) : Promise.resolve(new Set<string>())),
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
