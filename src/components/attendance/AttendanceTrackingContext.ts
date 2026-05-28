import { createContext, useContext } from "react";
import type { AttendanceCampus } from "@/hooks/useAttendance";

export type TrackingStatus = "idle" | "unsupported" | "permission-needed" | "watching" | "on-site" | "off-site" | "error";

export interface AttendanceTrackingState {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  status: TrackingStatus;
  statusMessage: string;
  activeCampusId: string | null;
  activeCampusName: string | null;
  nearestCampusName: string | null;
  distanceMeters: number | null;
  accuracyMeters: number | null;
  lastSeenAt: string | null;
  configuredCampuses: AttendanceCampus[];
}

export const AttendanceTrackingContext = createContext<AttendanceTrackingState | undefined>(undefined);

export function useAttendanceTracking() {
  const context = useContext(AttendanceTrackingContext);
  if (!context) {
    throw new Error("useAttendanceTracking must be used within AttendanceTrackingProvider");
  }
  return context;
}
