import { useMemo } from "react";
import { usePublishedSetlists } from "@/hooks/useSetlistConfirmations";

export function useAssignedChartsSetlists() {
  const upcomingQuery = usePublishedSetlists(undefined, undefined, false);
  const pastQuery = usePublishedSetlists(undefined, undefined, true);

  const setlists = useMemo(() => {
    const merged = [...(pastQuery.data || []), ...(upcomingQuery.data || [])];
    const seen = new Set<string>();

    return merged
      .filter((setlist) => {
        if (!setlist.amIOnRoster) return false;
        if (seen.has(setlist.id)) return false;
        seen.add(setlist.id);
        return true;
      })
      .sort((a, b) => a.plan_date.localeCompare(b.plan_date));
  }, [pastQuery.data, upcomingQuery.data]);

  return {
    ...upcomingQuery,
    data: setlists,
    isLoading: upcomingQuery.isLoading || pastQuery.isLoading,
    isFetching: upcomingQuery.isFetching || pastQuery.isFetching,
    error: upcomingQuery.error || pastQuery.error,
  };
}
