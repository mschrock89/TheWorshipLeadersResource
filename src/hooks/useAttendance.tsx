import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { getCurrentResourceAppKey } from "@/lib/resourceApp";

type SupabaseError = { message: string };
type SupabaseResult<T> = PromiseLike<{ data: T; error: SupabaseError | null }>;

type AttendanceQueryBuilder<T> = SupabaseResult<T> & {
  select: (columns?: string) => AttendanceQueryBuilder<T>;
  order: (column: string, options?: { ascending?: boolean }) => AttendanceQueryBuilder<T>;
  eq: (column: string, value: string) => AttendanceQueryBuilder<T>;
  is: (column: string, value: null) => AttendanceQueryBuilder<T>;
  gte: (column: string, value: string) => AttendanceQueryBuilder<T>;
  limit: (count: number) => AttendanceQueryBuilder<T>;
  maybeSingle: () => Promise<{ data: T | null; error: SupabaseError | null }>;
};

type AttendanceSupabaseClient = {
  from: <T>(table: string) => AttendanceQueryBuilder<T>;
  rpc: <T>(functionName: string, args: Record<string, unknown>) => Promise<{ data: T; error: SupabaseError | null }>;
};

const attendanceSupabase = supabase as unknown as AttendanceSupabaseClient;

export interface AttendanceCampus {
  id: string;
  name: string;
  created_at: string;
  has_saturday_service: boolean | null;
  has_sunday_service: boolean | null;
  saturday_service_time: string[] | null;
  sunday_service_time: string[] | null;
  attendance_enabled: boolean;
  geofence_latitude: number | null;
  geofence_longitude: number | null;
  geofence_radius_meters: number;
}

export interface AttendancePresence {
  id: string;
  user_id: string;
  campus_id: string;
  checked_in_at: string;
  last_seen_at: string;
  checked_out_at: string | null;
  distance_meters: number | null;
  location_accuracy_meters: number | null;
  profiles?: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
}

export function metersBetween(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
) {
  const earthRadiusMeters = 6371000;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);
  const deltaLat = toRadians(to.latitude - from.latitude);
  const deltaLon = toRadians(to.longitude - from.longitude);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusMeters * c;
}

export function useAttendanceCampuses() {
  return useQuery({
    queryKey: ["attendance-campuses"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await attendanceSupabase
        .from<AttendanceCampus[]>("campuses")
        .select("*")
        .order("name", { ascending: true });

      if (error) throw error;
      return data || [];
    },
  });
}

export function useAttendancePresence(campusId: string | null | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!campusId) return;

    const channel = supabase
      .channel(`attendance-presence-${campusId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "student_attendance_sessions",
          filter: `campus_id=eq.${campusId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["attendance-presence", campusId] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [campusId, queryClient]);

  return useQuery({
    queryKey: ["attendance-presence", campusId],
    queryFn: async () => {
      if (!campusId) return [];
      const activeSince = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { data, error } = await attendanceSupabase
        .from<AttendancePresence[]>("student_attendance_sessions")
        .select("id,user_id,campus_id,checked_in_at,last_seen_at,checked_out_at,distance_meters,location_accuracy_meters,profiles(id,full_name,avatar_url)")
        .eq("campus_id", campusId)
        .is("checked_out_at", null)
        .gte("last_seen_at", activeSince)
        .order("last_seen_at", { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!campusId,
    refetchInterval: 60 * 1000,
  });
}

export function useMyActiveAttendance() {
  return useQuery({
    queryKey: ["my-active-attendance"],
    queryFn: async () => {
      const activeSince = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { data, error } = await attendanceSupabase
        .from<AttendancePresence & { campuses?: { name: string } | null }>("student_attendance_sessions")
        .select("id,user_id,campus_id,checked_in_at,last_seen_at,checked_out_at,distance_meters,location_accuracy_meters,campuses(name)")
        .is("checked_out_at", null)
        .gte("last_seen_at", activeSince)
        .order("last_seen_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    refetchInterval: 60 * 1000,
  });
}

export function useRecordAttendance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      campusId,
      distanceMeters,
      accuracyMeters,
    }: {
      campusId: string;
      distanceMeters: number;
      accuracyMeters: number | null;
    }) => {
      const { data, error } = await attendanceSupabase.rpc<string>("record_student_attendance", {
        _campus_id: campusId,
        _distance_meters: Math.round(distanceMeters),
        _location_accuracy_meters: accuracyMeters === null ? null : Math.round(accuracyMeters),
        _resource_app_key: getCurrentResourceAppKey(),
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["attendance-presence", variables.campusId] });
      queryClient.invalidateQueries({ queryKey: ["my-active-attendance"] });
    },
  });
}

export function useMarkAttendanceDeparted() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (campusId: string) => {
      const { error } = await attendanceSupabase.rpc<null>("mark_student_attendance_departed", {
        _campus_id: campusId,
      });

      if (error) throw error;
    },
    onSuccess: (_, campusId) => {
      queryClient.invalidateQueries({ queryKey: ["attendance-presence", campusId] });
      queryClient.invalidateQueries({ queryKey: ["my-active-attendance"] });
    },
  });
}

export function useUpdateAttendanceCampusSettings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      campusId,
      enabled,
      latitude,
      longitude,
      radiusMeters,
    }: {
      campusId: string;
      enabled: boolean;
      latitude: number | null;
      longitude: number | null;
      radiusMeters: number;
    }) => {
      const { error } = await attendanceSupabase.rpc<null>("update_attendance_campus_settings", {
        _campus_id: campusId,
        _attendance_enabled: enabled,
        _geofence_latitude: latitude,
        _geofence_longitude: longitude,
        _geofence_radius_meters: radiusMeters,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance-campuses"] });
      queryClient.invalidateQueries({ queryKey: ["campuses"] });
      toast({ title: "Attendance settings saved" });
    },
    onError: (error) => {
      toast({
        title: "Could not save attendance settings",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
