import { useMemo } from "react";
import { usePublishedSetlists } from "@/hooks/useSetlistConfirmations";

export function useAssignedChartsSetlists() {
  // One fetch covers both recent-past and upcoming sets (includePast returns a
  // trailing window through the future), instead of running the pipeline twice.
  const query = usePublishedSetlists(undefined, undefined, true);

  const setlists = useMemo(
    () =>
      (query.data || [])
        .filter((setlist) => setlist.amIOnRoster)
        .sort((a, b) => a.plan_date.localeCompare(b.plan_date)),
    [query.data],
  );

  return {
    ...query,
    data: setlists,
  };
}
