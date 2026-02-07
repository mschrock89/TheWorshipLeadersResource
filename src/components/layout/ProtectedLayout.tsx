import { ReactNode, useState, useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { MainHeader } from "./MainHeader";
import { useAuth } from "@/hooks/useAuth";
import { useCampuses, useUserCampuses } from "@/hooks/useCampuses";
import { useProfile } from "@/hooks/useProfiles";
import { CampusSelectionProvider } from "./CampusSelectionContext";
import { useAudioPlayerSafe } from "@/hooks/useAudioPlayer";

const CAMPUS_STORAGE_KEY = "em-selected-campus";

interface ProtectedLayoutProps {
  children: ReactNode;
  selectedCampusId?: string | null;
  onSelectCampus?: (campusId: string) => void;
}

export function ProtectedLayout({
  children,
  selectedCampusId: externalCampusId,
  onSelectCampus: externalOnSelectCampus,
}: ProtectedLayoutProps) {
  const location = useLocation();
  const { user, isLeader, isAdmin } = useAuth();
  const { data: userCampuses, isLoading: userCampusesLoading } = useUserCampuses(user?.id);
  const { data: allCampuses, isLoading: allCampusesLoading } = useCampuses();
  const { data: profile } = useProfile(user?.id);

  // Initialize from localStorage if available
  const [internalCampusId, setInternalCampusId] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(CAMPUS_STORAGE_KEY);
    }
    return null;
  });

  // Use external state if provided, otherwise use internal
  const selectedCampusId = externalCampusId ?? internalCampusId;
  
  const setSelectedCampusId = (campusId: string) => {
    // Persist to localStorage
    localStorage.setItem(CAMPUS_STORAGE_KEY, campusId);
    if (externalOnSelectCampus) {
      externalOnSelectCampus(campusId);
    } else {
      setInternalCampusId(campusId);
    }
  };

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
    if (availableCampuses.length === 0) return;
    
    // Check if stored campus is still valid
    const storedIsValid = selectedCampusId && availableCampuses.some(c => c.campus_id === selectedCampusId);
    
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
  }, [availableCampuses, selectedCampusId, isAdmin, isLeader, profile?.default_campus_id]);

  const isOnChatPage = location.pathname === "/chat";
  
  // Check if audio player is active to add extra padding
  const audioPlayer = useAudioPlayerSafe();
  const hasActivePlayer = !!audioPlayer?.currentTrack;

  return (
    <CampusSelectionProvider value={{ selectedCampusId, setSelectedCampusId }}>
      <div className="min-h-screen bg-background">
        <MainHeader />
        <main className={isOnChatPage ? "" : `container px-4 py-6 ${hasActivePlayer ? "pb-36" : "pb-24"}`}>{children}</main>
      </div>
    </CampusSelectionProvider>
  );
}

