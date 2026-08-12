import { lazy, ReactNode, Suspense, useState, useEffect, useMemo, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useCampuses, useUserCampuses } from "@/hooks/useCampuses";
import { useProfile } from "@/hooks/useProfiles";
import { CampusSelectionProvider } from "./CampusSelectionContext";
import { MinistrySelectionProvider } from "./MinistrySelectionContext";
import { useAudioPlayerSafe } from "@/hooks/useAudioPlayer";
import {
  getViewMinistryFilterOptions,
  isValidViewMinistryFilter,
} from "@/lib/constants";
import { getCurrentResourceAppKey } from "@/lib/resourceApp";
import { getResourceAppMinistryTypes } from "@/lib/studentFlow";

const CAMPUS_STORAGE_KEY = "em-selected-campus";
const MINISTRY_STORAGE_KEY = "em-selected-ministry";
const MainHeader = lazy(() =>
  import("./MainHeader").then((module) => ({ default: module.MainHeader })),
);

interface ProtectedLayoutProps {
  children: ReactNode;
  selectedCampusId?: string | null;
  onSelectCampus?: (campusId: string) => void;
  selectedMinistryType?: string | null;
  onSelectMinistry?: (ministryType: string) => void;
}

export function ProtectedLayout({
  children,
  selectedCampusId: externalCampusId,
  onSelectCampus: externalOnSelectCampus,
  selectedMinistryType: externalMinistryType,
  onSelectMinistry: externalOnSelectMinistry,
}: ProtectedLayoutProps) {
  const location = useLocation();
  const { user, isLeader, isAdmin } = useAuth();
  const { data: userCampuses, isLoading: userCampusesLoading } = useUserCampuses(user?.id);
  const { data: allCampuses, isLoading: allCampusesLoading } = useCampuses();
  const { data: profile } = useProfile(user?.id);
  const resourceAppKey = getCurrentResourceAppKey();
  const appMinistryTypes = useMemo(
    () => getResourceAppMinistryTypes(resourceAppKey),
    [resourceAppKey],
  );
  const availableMinistryOptions = useMemo(
    () => getViewMinistryFilterOptions(appMinistryTypes),
    [appMinistryTypes],
  );

  // Initialize from localStorage if available
  const [internalCampusId, setInternalCampusId] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(CAMPUS_STORAGE_KEY);
    }
    return null;
  });
  const [internalMinistryType, setInternalMinistryType] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(MINISTRY_STORAGE_KEY);
    }
    return null;
  });

  // Use external state if provided, otherwise use internal
  const selectedCampusId = externalCampusId ?? internalCampusId;
  const selectedMinistryType = externalMinistryType ?? internalMinistryType;
  
  const setSelectedCampusId = useCallback((campusId: string | null) => {
    if (campusId) {
      localStorage.setItem(CAMPUS_STORAGE_KEY, campusId);
    } else {
      localStorage.removeItem(CAMPUS_STORAGE_KEY);
    }

    if (externalOnSelectCampus) {
      externalOnSelectCampus(campusId || "");
    } else {
      setInternalCampusId(campusId);
    }
  }, [externalOnSelectCampus]);

  const setSelectedMinistryType = useCallback((ministryType: string | null) => {
    if (ministryType) {
      localStorage.setItem(MINISTRY_STORAGE_KEY, ministryType);
    } else {
      localStorage.removeItem(MINISTRY_STORAGE_KEY);
    }

    if (externalOnSelectMinistry) {
      externalOnSelectMinistry(ministryType || "");
    } else {
      setInternalMinistryType(ministryType);
    }
  }, [externalOnSelectMinistry]);

  const assignedCampusIds = useMemo(
    () => new Set((userCampuses || []).map((uc) => uc.campus_id)),
    [userCampuses]
  );

  // Leaders can see all campuses, but we prefer showing (and defaulting to) their assigned campuses first.
  const availableCampuses = useMemo(() => {
    if (isLeader && allCampuses) {
      const all = allCampuses.map((c) => ({ campus_id: c.id, campuses: c }));
      const assigned = all.filter((c) => assignedCampusIds.has(c.campus_id));
      const others = all.filter((c) => !assignedCampusIds.has(c.campus_id));
      return [...assigned, ...others];
    }
    return userCampuses || [];
  }, [isLeader, allCampuses, userCampuses, assignedCampusIds]);

  // Set default campus when campuses load, validate stored campus still exists
  useEffect(() => {
    if (userCampusesLoading || allCampusesLoading) return;

    if (availableCampuses.length === 0) {
      if (selectedCampusId !== null) {
        setSelectedCampusId(null);
      }
      return;
    }
    
    // Check if stored campus is still valid ("network-wide" is a sentinel, not a real campus id)
    const storedIsValid =
      selectedCampusId === "network-wide" ||
      (selectedCampusId && availableCampuses.some(c => c.campus_id === selectedCampusId));
    
    if (!storedIsValid) {
      // For admins/leaders, check if they have a default campus set in their profile
      if ((isAdmin || isLeader) && profile?.default_campus_id) {
        const defaultIsValid = availableCampuses.some(c => c.campus_id === profile.default_campus_id);
        if (defaultIsValid) {
          setSelectedCampusId(profile.default_campus_id);
          return;
        }
      }
      // Use first available campus (assigned first for leaders)
      setSelectedCampusId(availableCampuses[0].campus_id);
    }
  }, [availableCampuses, selectedCampusId, setSelectedCampusId, isAdmin, isLeader, profile?.default_campus_id, userCampusesLoading, allCampusesLoading]);

  // Seed / validate ministry selection from profile default (admins/leaders) or app default.
  useEffect(() => {
    if (availableMinistryOptions.length === 0) return;

    const storedIsValid = isValidViewMinistryFilter(selectedMinistryType, appMinistryTypes);
    if (storedIsValid) return;

    if ((isAdmin || isLeader) && profile?.default_ministry_type) {
      if (isValidViewMinistryFilter(profile.default_ministry_type, appMinistryTypes)) {
        setSelectedMinistryType(profile.default_ministry_type);
        return;
      }
    }

    setSelectedMinistryType(availableMinistryOptions[0].value);
  }, [
    availableMinistryOptions,
    selectedMinistryType,
    setSelectedMinistryType,
    isAdmin,
    isLeader,
    profile?.default_ministry_type,
    appMinistryTypes,
  ]);

  const isOnChatPage = location.pathname === "/chat";
  
  // Check if audio player is active to add extra padding
  const audioPlayer = useAudioPlayerSafe();
  const hasActivePlayer = !!audioPlayer?.currentTrack;

  const campusSelectionValue = useMemo(
    () => ({ selectedCampusId, setSelectedCampusId }),
    [selectedCampusId, setSelectedCampusId]
  );
  const ministrySelectionValue = useMemo(
    () => ({ selectedMinistryType, setSelectedMinistryType }),
    [selectedMinistryType, setSelectedMinistryType]
  );

  return (
    <CampusSelectionProvider value={campusSelectionValue}>
      <MinistrySelectionProvider value={ministrySelectionValue}>
        <div className="min-h-full bg-background">
          <Suspense fallback={<div className="h-14 border-b border-border bg-card" />}>
            <MainHeader />
          </Suspense>
          <main
            className={
              isOnChatPage
                ? ""
                : `container px-4 py-5 sm:px-6 sm:py-7 ${hasActivePlayer ? "pb-20" : "pb-5"}`
            }
          >
            {children}
          </main>
        </div>
      </MinistrySelectionProvider>
    </CampusSelectionProvider>
  );
}
