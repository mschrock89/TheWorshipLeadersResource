import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfiles";

type RestoreDefaultCampusOptions = {
  /** Wait until the campus list (and anything else required to validate the id) is loaded. */
  isReady: boolean;
  selectedCampusId: string | null;
  isSelectable: (campusId: string) => boolean;
  selectCampus: (campusId: string) => void;
  enabled?: boolean;
};

/**
 * Each time the calling screen mounts, select the signed-in user's profile
 * default campus once. A campus change made after that stays in place until
 * they leave and come back, or until the saved default itself changes.
 */
export function useRestoreDefaultCampus({
  isReady,
  selectedCampusId,
  isSelectable,
  selectCampus,
  enabled = true,
}: RestoreDefaultCampusOptions) {
  const { user } = useAuth();
  const { data: profile, isFetched } = useProfile(user?.id);
  const appliedKeyRef = useRef<string | null>(null);
  const isSelectableRef = useRef(isSelectable);
  const selectCampusRef = useRef(selectCampus);
  isSelectableRef.current = isSelectable;
  selectCampusRef.current = selectCampus;

  useEffect(() => {
    if (!enabled || !isReady || !user || !isFetched) return;

    const defaultCampusId = profile?.default_campus_id;
    if (!defaultCampusId || !isSelectableRef.current(defaultCampusId)) return;

    const key = `${user.id}:${defaultCampusId}`;
    if (appliedKeyRef.current === key) return;
    appliedKeyRef.current = key;

    if (selectedCampusId !== defaultCampusId) {
      selectCampusRef.current(defaultCampusId);
    }
  }, [enabled, isReady, isFetched, profile?.default_campus_id, selectedCampusId, user]);
}
