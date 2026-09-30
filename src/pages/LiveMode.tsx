import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCampuses, useUserCampuses } from "@/hooks/useCampuses";
import { useCampusSelectionOptional } from "@/components/layout/CampusSelectionContext";
import { useMinistrySelectionOptional } from "@/components/layout/MinistrySelectionContext";
import { SET_PLANNER_MINISTRY_OPTIONS } from "@/lib/constants";
import { LiveModeConsole } from "@/components/live/LiveModeConsole";

const SERVICE_MINISTRIES = new Set<string>(SET_PLANNER_MINISTRY_OPTIONS.map((option) => option.value));

function todayIso() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function normalizeServiceMinistry(value: string | null) {
  if (value === "weekend_team") return "weekend";
  if (value && SERVICE_MINISTRIES.has(value)) return value;
  return "weekend";
}

export default function LiveMode() {
  const { user, isLoading: authLoading, isProductionManager } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const campusContext = useCampusSelectionOptional();
  const ministryContext = useMinistrySelectionOptional();
  const { data: userCampuses = [], isLoading: userCampusesLoading } = useUserCampuses(user?.id);
  const { data: allCampuses = [], isLoading: allCampusesLoading } = useCampuses();

  const campuses = useMemo(() => {
    if (isProductionManager) {
      return allCampuses.map((campus) => ({ id: campus.id, name: campus.name }));
    }
    return userCampuses
      .map((row) => ({ id: row.campus_id, name: row.campuses?.name || "Campus" }))
      .filter((campus) => campus.id);
  }, [allCampuses, isProductionManager, userCampuses]);

  const requestedCampus = searchParams.get("campus");
  const contextCampus =
    campusContext?.selectedCampusId && campusContext.selectedCampusId !== "network-wide"
      ? campusContext.selectedCampusId
      : null;
  const campusId = requestedCampus || contextCampus || campuses[0]?.id || null;
  const campusOptions = useMemo(() => {
    if (!campusId || campuses.some((campus) => campus.id === campusId)) return campuses;
    return [{ id: campusId, name: "Campus" }, ...campuses];
  }, [campusId, campuses]);
  const ministryType = normalizeServiceMinistry(
    searchParams.get("ministry") || ministryContext?.selectedMinistryType || null,
  );
  const serviceDate = searchParams.get("date") || todayIso();
  const customServiceId = searchParams.get("customServiceId");
  const draftSetId = searchParams.get("draftSetId");
  const campusName = campusOptions.find((campus) => campus.id === campusId)?.name || "Campus";

  const updateScope = (patch: { campusId?: string; ministryType?: string; serviceDate?: string }) => {
    const next = new URLSearchParams(searchParams);
    next.set("date", patch.serviceDate || serviceDate);
    next.set("campus", patch.campusId || campusId || "");
    next.set("ministry", patch.ministryType || ministryType);
    setSearchParams(next, { replace: true });
  };

  if (authLoading || userCampusesLoading || (isProductionManager && allCampusesLoading)) {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!campusId) {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-background px-6 text-center">
        <p className="text-muted-foreground">Choose a campus before opening Live Mode.</p>
      </div>
    );
  }

  return (
    <LiveModeConsole
      campusId={campusId}
      campusName={campusName}
      campuses={campusOptions}
      ministryType={ministryType}
      serviceDate={serviceDate}
      customServiceId={customServiceId}
      draftSetId={draftSetId}
      onScopeChange={updateScope}
    />
  );
}
