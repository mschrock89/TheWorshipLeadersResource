import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useUserCampuses } from "@/hooks/useCampuses";
import {
  metersBetween,
  useAttendanceCampuses,
  useMarkAttendanceDeparted,
  useRecordAttendance,
} from "@/hooks/useAttendance";
import {
  AttendanceTrackingContext,
  AttendanceTrackingState,
  TrackingStatus,
} from "@/components/attendance/AttendanceTrackingContext";

const ATTENDANCE_TRACKING_STORAGE_KEY = "student-attendance-location-enabled";
const HEARTBEAT_INTERVAL_MS = 45 * 1000;

function getStoredTrackingPreference() {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(ATTENDANCE_TRACKING_STORAGE_KEY) === "true";
}

export function AttendanceTrackingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { data: userCampuses = [] } = useUserCampuses(user?.id);
  const { data: campuses = [] } = useAttendanceCampuses();
  const recordAttendance = useRecordAttendance();
  const markDeparted = useMarkAttendanceDeparted();
  const [enabled, setEnabledState] = useState(getStoredTrackingPreference);
  const [status, setStatus] = useState<TrackingStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("Attendance tracking is off.");
  const [activeCampusId, setActiveCampusId] = useState<string | null>(null);
  const [activeCampusName, setActiveCampusName] = useState<string | null>(null);
  const [nearestCampusName, setNearestCampusName] = useState<string | null>(null);
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null);
  const [accuracyMeters, setAccuracyMeters] = useState<number | null>(null);
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null);
  const activeCampusRef = useRef<string | null>(null);
  const lastHeartbeatRef = useRef<Record<string, number>>({});
  const recordAttendanceRef = useRef(recordAttendance.mutateAsync);
  const markDepartedRef = useRef(markDeparted.mutateAsync);

  const assignedCampusIds = useMemo(
    () => new Set(userCampuses.map((entry) => entry.campus_id)),
    [userCampuses],
  );

  const configuredCampuses = useMemo(
    () =>
      campuses.filter(
        (campus) =>
          assignedCampusIds.has(campus.id) &&
          campus.attendance_enabled &&
          campus.geofence_latitude !== null &&
          campus.geofence_longitude !== null,
      ),
    [assignedCampusIds, campuses],
  );

  const setEnabled = useCallback((nextEnabled: boolean) => {
    setEnabledState(nextEnabled);
    localStorage.setItem(ATTENDANCE_TRACKING_STORAGE_KEY, String(nextEnabled));
    if (!nextEnabled) {
      setStatus("idle");
      setStatusMessage("Attendance tracking is off.");
    }
  }, []);

  useEffect(() => {
    recordAttendanceRef.current = recordAttendance.mutateAsync;
  }, [recordAttendance.mutateAsync]);

  useEffect(() => {
    markDepartedRef.current = markDeparted.mutateAsync;
  }, [markDeparted.mutateAsync]);

  useEffect(() => {
    activeCampusRef.current = activeCampusId;
  }, [activeCampusId]);

  useEffect(() => {
    if (!user || !enabled) {
      return;
    }

    if (!("geolocation" in navigator)) {
      setStatus("unsupported");
      setStatusMessage("This device does not support location-based attendance.");
      return;
    }

    if (configuredCampuses.length === 0) {
      setStatus("permission-needed");
      setStatusMessage("Attendance is not configured for your assigned campus yet.");
      return;
    }

    setStatus("watching");
    setStatusMessage("Watching for your campus geofence.");

    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        const currentPosition = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };

        const nearest = configuredCampuses
          .map((campus) => {
            const distance = metersBetween(currentPosition, {
              latitude: campus.geofence_latitude as number,
              longitude: campus.geofence_longitude as number,
            });
            return { campus, distance };
          })
          .sort((a, b) => a.distance - b.distance)[0];

        setAccuracyMeters(position.coords.accuracy ?? null);

        if (!nearest) {
          setStatus("off-site");
          setStatusMessage("No attendance geofence is available for your campus.");
          return;
        }

        setNearestCampusName(nearest.campus.name);
        setDistanceMeters(nearest.distance);

        const isInside = nearest.distance <= nearest.campus.geofence_radius_meters;
        if (isInside) {
          const lastHeartbeat = lastHeartbeatRef.current[nearest.campus.id] || 0;
          const shouldHeartbeat = Date.now() - lastHeartbeat > HEARTBEAT_INTERVAL_MS;

          setStatus("on-site");
          setStatusMessage(`Checked in at ${nearest.campus.name}.`);
          setActiveCampusId(nearest.campus.id);
          setActiveCampusName(nearest.campus.name);

          if (shouldHeartbeat) {
            lastHeartbeatRef.current[nearest.campus.id] = Date.now();
            setLastSeenAt(new Date().toISOString());
            try {
              await recordAttendanceRef.current({
                campusId: nearest.campus.id,
                distanceMeters: nearest.distance,
                accuracyMeters: position.coords.accuracy ?? null,
              });
            } catch (error) {
              setStatus("error");
              setStatusMessage(error instanceof Error ? error.message : "Attendance check-in failed.");
            }
          }
          return;
        }

        setStatus("off-site");
        setStatusMessage(`Nearest campus is ${Math.round(nearest.distance)}m away.`);

        if (activeCampusRef.current) {
          const campusId = activeCampusRef.current;
          setActiveCampusId(null);
          setActiveCampusName(null);
          try {
            await markDepartedRef.current(campusId);
          } catch (error) {
            setStatus("error");
            setStatusMessage(error instanceof Error ? error.message : "Attendance check-out failed.");
          }
        }
      },
      (error) => {
        setActiveCampusId(null);
        setActiveCampusName(null);
        if (error.code === error.PERMISSION_DENIED) {
          setStatus("permission-needed");
          setStatusMessage("Location permission is needed for automatic attendance.");
          return;
        }
        setStatus("error");
        setStatusMessage(error.message || "Location tracking failed.");
      },
      {
        enableHighAccuracy: true,
        maximumAge: 30 * 1000,
        timeout: 20 * 1000,
      },
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [configuredCampuses, enabled, user]);

  const value = useMemo<AttendanceTrackingState>(
    () => ({
      enabled,
      setEnabled,
      status,
      statusMessage,
      activeCampusId,
      activeCampusName,
      nearestCampusName,
      distanceMeters,
      accuracyMeters,
      lastSeenAt,
      configuredCampuses,
    }),
    [
      accuracyMeters,
      activeCampusId,
      activeCampusName,
      configuredCampuses,
      distanceMeters,
      enabled,
      lastSeenAt,
      nearestCampusName,
      setEnabled,
      status,
      statusMessage,
    ],
  );

  return <AttendanceTrackingContext.Provider value={value}>{children}</AttendanceTrackingContext.Provider>;
}
