import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { BASE_ROLES } from "@/lib/constants";
import { getCurrentResourceAppKey } from "@/lib/resourceApp";

type QueryResult<T> = {
  data: T | null;
  error: Error | null;
};

interface QueryLike<T = unknown> extends PromiseLike<QueryResult<T>> {
  select(columns?: string): QueryLike<T>;
  eq(column: string, value: unknown): QueryLike<T>;
  in(column: string, values: readonly unknown[]): QueryLike<T>;
  order(column: string, options?: { ascending?: boolean }): QueryLike<T>;
  limit(count: number): QueryLike<T>;
  insert(values: unknown): QueryLike<T>;
  update(values: unknown): QueryLike<T>;
  delete(): QueryLike<T>;
  upsert(values: unknown, options?: { onConflict?: string }): QueryLike<T>;
  single(): QueryLike<T>;
}

const db = supabase as unknown as {
  from<T = unknown>(table: string): QueryLike<T>;
};

export type LifeGroupGender = "male" | "female" | "coed";
export type LifeGroupGrade = 8 | 9 | 10 | 11 | 12;
export type AttendanceStatus = "present" | "absent";
export type AppRole = Database["public"]["Enums"]["app_role"];

export interface LifeGroupPerson {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  gender?: string | null;
}

export interface LifeGroupAttendance {
  report_id: string;
  group_id: string;
  student_id: string;
  status: AttendanceStatus;
}

export interface LifeGroupWeeklyReport {
  id: string;
  group_id: string;
  meeting_date: string;
  prayer_requests: string | null;
  submitted_by: string | null;
  created_at: string;
  updated_at: string;
  attendance: LifeGroupAttendance[];
  feedback: string | null;
}

export interface LifeGroup {
  id: string;
  resource_app_key: string;
  campus_id: string | null;
  name: string;
  gender: LifeGroupGender;
  grade_level: LifeGroupGrade;
  meeting_location: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  leaders: LifeGroupPerson[];
  students: LifeGroupPerson[];
  reports: LifeGroupWeeklyReport[];
  isCurrentUserLeader: boolean;
}

interface LifeGroupRow {
  id: string;
  resource_app_key: string;
  campus_id: string | null;
  name: string;
  gender: LifeGroupGender;
  grade_level: LifeGroupGrade;
  meeting_location: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface PersonRelationRow {
  group_id: string;
  user_id: string;
  profiles?: LifeGroupPerson | LifeGroupPerson[] | null;
}

interface ReportRow {
  id: string;
  group_id: string;
  meeting_date: string;
  prayer_requests: string | null;
  submitted_by: string | null;
  created_at: string;
  updated_at: string;
}

interface FeedbackRow {
  report_id: string;
  feedback: string | null;
}

export interface LifeGroupMutationInput {
  id?: string;
  campus_id: string | null;
  name: string;
  gender: LifeGroupGender;
  grade_level: LifeGroupGrade;
  meeting_location: string;
  leaderIds: string[];
  studentIds: string[];
}

export interface LifeGroupBaseRoleAssignment {
  userId: string;
  role: AppRole;
}

export interface LifeGroupImportInput {
  groups: LifeGroupMutationInput[];
  baseRoleAssignments?: LifeGroupBaseRoleAssignment[];
}

interface WeeklyReportInput {
  groupId: string;
  meetingDate: string;
  prayerRequests: string;
  feedback: string;
  attendance: Array<{ studentId: string; status: AttendanceStatus }>;
}

const REPLACEABLE_BASE_ROLES = [...BASE_ROLES, "leader", "member"] as AppRole[];

async function saveLifeGroupRecord(
  input: LifeGroupMutationInput,
  resourceAppKey: string,
  userId: string | null | undefined,
) {
  const payload = {
    resource_app_key: resourceAppKey,
    campus_id: input.campus_id,
    name: input.name.trim(),
    gender: input.gender,
    grade_level: input.grade_level,
    meeting_location: input.meeting_location.trim(),
    created_by: userId ?? null,
  };

  const { data: group, error: groupError } = input.id
    ? await db
        .from("life_groups")
        .update(payload)
        .eq("id", input.id)
        .select("id")
        .single()
    : await db
        .from("life_groups")
        .insert(payload)
        .select("id")
        .single();

  if (groupError) throw groupError;
  const groupId = group.id as string;

  const { error: deleteLeadersError } = await db
    .from("life_group_leaders")
    .delete()
    .eq("group_id", groupId);
  if (deleteLeadersError) throw deleteLeadersError;

  const { error: deleteStudentsError } = await db
    .from("life_group_students")
    .delete()
    .eq("group_id", groupId);
  if (deleteStudentsError) throw deleteStudentsError;

  if (input.leaderIds.length > 0) {
    const { error } = await db
      .from("life_group_leaders")
      .insert(input.leaderIds.map((userId) => ({ group_id: groupId, user_id: userId })));
    if (error) throw error;
  }

  if (input.studentIds.length > 0) {
    const { error } = await db
      .from("life_group_students")
      .insert(input.studentIds.map((userId) => ({ group_id: groupId, user_id: userId })));
    if (error) throw error;
  }

  return groupId;
}

async function assignBaseRoles(assignments: LifeGroupBaseRoleAssignment[]) {
  const assignmentsByUserId = new Map<string, AppRole>();

  assignments.forEach((assignment) => {
    if (!assignment.userId || !REPLACEABLE_BASE_ROLES.includes(assignment.role)) return;
    assignmentsByUserId.set(assignment.userId, assignment.role);
  });

  const roleRows = Array.from(assignmentsByUserId, ([userId, role]) => ({
    user_id: userId,
    role,
    admin_campus_id: null,
  }));

  if (roleRows.length === 0) return 0;

  const userIds = roleRows.map((row) => row.user_id);

  const { error: deleteError } = await db
    .from("user_roles")
    .delete()
    .in("user_id", userIds)
    .in("role", REPLACEABLE_BASE_ROLES);

  if (deleteError) throw deleteError;

  const { error: insertError } = await db
    .from("user_roles")
    .insert(roleRows);

  if (insertError) throw insertError;

  return roleRows.length;
}

function getProfileFromRelation(row: PersonRelationRow): LifeGroupPerson {
  const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
  return {
    id: row.user_id,
    full_name: profile?.full_name ?? null,
    avatar_url: profile?.avatar_url ?? null,
    gender: profile?.gender ?? null,
  };
}

export function useLifeGroups(campusId?: string | null) {
  const { user, isLoading, isAdmin } = useAuth();
  const resourceAppKey = getCurrentResourceAppKey();

  return useQuery({
    queryKey: ["life-groups", resourceAppKey, campusId || "all", user?.id, isAdmin],
    queryFn: async () => {
      let groupQuery = db
        .from("life_groups")
        .select("*")
        .eq("resource_app_key", resourceAppKey)
        .order("grade_level", { ascending: true })
        .order("name", { ascending: true });

      if (campusId && campusId !== "all") {
        groupQuery = groupQuery.eq("campus_id", campusId);
      }

      const { data: groupRows, error: groupsError } = await groupQuery;
      if (groupsError) throw groupsError;

      const groups = (groupRows || []) as LifeGroupRow[];
      const groupIds = groups.map((group) => group.id);
      if (groupIds.length === 0) return [] as LifeGroup[];

      const [
        leadersResponse,
        studentsResponse,
        reportsResponse,
      ] = await Promise.all([
        db
          .from("life_group_leaders")
          .select("group_id, user_id, profiles(id, full_name, avatar_url, gender)")
          .in("group_id", groupIds),
        db
          .from("life_group_students")
          .select("group_id, user_id, profiles(id, full_name, avatar_url, gender)")
          .in("group_id", groupIds),
        db
          .from("life_group_weekly_reports")
          .select("*")
          .in("group_id", groupIds)
          .order("meeting_date", { ascending: false }),
      ]);

      if (leadersResponse.error) throw leadersResponse.error;
      if (studentsResponse.error) throw studentsResponse.error;
      if (reportsResponse.error) throw reportsResponse.error;

      const reportRows = (reportsResponse.data || []) as ReportRow[];
      const reportIds = reportRows.map((report) => report.id);

      const [attendanceResponse, feedbackResponse] = reportIds.length > 0
        ? await Promise.all([
            db
              .from("life_group_attendance")
              .select("report_id, group_id, student_id, status")
              .in("report_id", reportIds),
            isAdmin
              ? db
                  .from("life_group_weekly_feedback")
                  .select("report_id, feedback")
                  .in("report_id", reportIds)
              : Promise.resolve({ data: [], error: null }),
          ])
        : [{ data: [], error: null }, { data: [], error: null }];

      if (attendanceResponse.error) throw attendanceResponse.error;
      if (feedbackResponse.error) throw feedbackResponse.error;

      const leadersByGroup = new Map<string, LifeGroupPerson[]>();
      ((leadersResponse.data || []) as PersonRelationRow[]).forEach((row) => {
        const people = leadersByGroup.get(row.group_id) || [];
        people.push(getProfileFromRelation(row));
        leadersByGroup.set(row.group_id, people);
      });

      const studentsByGroup = new Map<string, LifeGroupPerson[]>();
      ((studentsResponse.data || []) as PersonRelationRow[]).forEach((row) => {
        const people = studentsByGroup.get(row.group_id) || [];
        people.push(getProfileFromRelation(row));
        studentsByGroup.set(row.group_id, people);
      });

      const attendanceByReport = new Map<string, LifeGroupAttendance[]>();
      ((attendanceResponse.data || []) as LifeGroupAttendance[]).forEach((row) => {
        const items = attendanceByReport.get(row.report_id) || [];
        items.push({
          report_id: row.report_id,
          group_id: row.group_id,
          student_id: row.student_id,
          status: row.status,
        });
        attendanceByReport.set(row.report_id, items);
      });

      const feedbackByReport = new Map<string, string>();
      ((feedbackResponse.data || []) as FeedbackRow[]).forEach((row) => {
        feedbackByReport.set(row.report_id, row.feedback || "");
      });

      const reportsByGroup = new Map<string, LifeGroupWeeklyReport[]>();
      reportRows.forEach((report) => {
        const items = reportsByGroup.get(report.group_id) || [];
        items.push({
          id: report.id,
          group_id: report.group_id,
          meeting_date: report.meeting_date,
          prayer_requests: report.prayer_requests,
          submitted_by: report.submitted_by,
          created_at: report.created_at,
          updated_at: report.updated_at,
          attendance: attendanceByReport.get(report.id) || [],
          feedback: feedbackByReport.get(report.id) ?? null,
        });
        reportsByGroup.set(report.group_id, items);
      });

      return groups.map((group) => {
        const leaders = leadersByGroup.get(group.id) || [];
        const students = studentsByGroup.get(group.id) || [];
        return {
          id: group.id,
          resource_app_key: group.resource_app_key,
          campus_id: group.campus_id,
          name: group.name,
          gender: group.gender,
          grade_level: group.grade_level,
          meeting_location: group.meeting_location,
          created_by: group.created_by,
          created_at: group.created_at,
          updated_at: group.updated_at,
          leaders: leaders.sort((a, b) => (a.full_name || "").localeCompare(b.full_name || "")),
          students: students.sort((a, b) => (a.full_name || "").localeCompare(b.full_name || "")),
          reports: (reportsByGroup.get(group.id) || []).sort((a, b) => b.meeting_date.localeCompare(a.meeting_date)),
          isCurrentUserLeader: leaders.some((leader) => leader.id === user?.id),
        } satisfies LifeGroup;
      });
    },
    enabled: !!user && !isLoading,
  });
}

export function useIsLifeGroupLeader() {
  const { user, isLoading } = useAuth();
  const resourceAppKey = getCurrentResourceAppKey();

  return useQuery({
    queryKey: ["life-group-leader-status", user?.id, resourceAppKey],
    queryFn: async () => {
      if (!user?.id) return false;

      const { data, error } = await db
        .from("life_group_leaders")
        .select("group_id, life_groups!inner(resource_app_key)")
        .eq("user_id", user.id)
        .eq("life_groups.resource_app_key", resourceAppKey)
        .limit(1);

      if (error) throw error;
      return (data || []).length > 0;
    },
    enabled: !!user && !isLoading,
  });
}

export function useSaveLifeGroup() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const resourceAppKey = getCurrentResourceAppKey();

  return useMutation({
    mutationFn: async (input: LifeGroupMutationInput) => {
      return saveLifeGroupRecord(input, resourceAppKey, user?.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["life-groups"] });
      queryClient.invalidateQueries({ queryKey: ["life-group-leader-status"] });
      toast({ title: "Life group saved", description: "The group roster is up to date." });
    },
    onError: (error) => {
      toast({
        title: "Couldn't save life group",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useImportLifeGroups() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const resourceAppKey = getCurrentResourceAppKey();

  return useMutation({
    mutationFn: async (input: LifeGroupImportInput | LifeGroupMutationInput[]) => {
      const groups = Array.isArray(input) ? input : input.groups;
      const baseRoleAssignments = Array.isArray(input) ? [] : input.baseRoleAssignments || [];
      const savedGroupIds: string[] = [];
      for (const group of groups) {
        const groupId = await saveLifeGroupRecord(group, resourceAppKey, user?.id);
        savedGroupIds.push(groupId);
      }
      const assignedRoleCount = await assignBaseRoles(baseRoleAssignments);
      return { savedGroupIds, assignedRoleCount };
    },
    onSuccess: ({ savedGroupIds, assignedRoleCount }) => {
      queryClient.invalidateQueries({ queryKey: ["life-groups"] });
      queryClient.invalidateQueries({ queryKey: ["life-group-leader-status"] });
      queryClient.invalidateQueries({ queryKey: ["user-role"] });
      queryClient.invalidateQueries({ queryKey: ["user-roles"] });
      queryClient.invalidateQueries({ queryKey: ["leadership-roles"] });
      toast({
        title: "Life groups imported",
        description: `${savedGroupIds.length} group${savedGroupIds.length === 1 ? "" : "s"} saved${assignedRoleCount > 0 ? ` and ${assignedRoleCount} base role${assignedRoleCount === 1 ? "" : "s"} assigned` : ""}.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Couldn't import life groups",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useDeleteLifeGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (groupId: string) => {
      const { error } = await db
        .from("life_groups")
        .delete()
        .eq("id", groupId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["life-groups"] });
      queryClient.invalidateQueries({ queryKey: ["life-group-leader-status"] });
      toast({ title: "Life group deleted", description: "The group has been removed." });
    },
    onError: (error) => {
      toast({
        title: "Couldn't delete life group",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useSaveLifeGroupWeeklyReport() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: WeeklyReportInput) => {
      const { data: report, error: reportError } = await db
        .from("life_group_weekly_reports")
        .upsert(
          {
            group_id: input.groupId,
            meeting_date: input.meetingDate,
            prayer_requests: input.prayerRequests.trim() || null,
            submitted_by: user?.id ?? null,
          },
          { onConflict: "group_id,meeting_date" },
        )
        .select("id")
        .single();

      if (reportError) throw reportError;
      const reportId = report.id as string;

      if (input.attendance.length > 0) {
        const { error: attendanceError } = await db
          .from("life_group_attendance")
          .upsert(
            input.attendance.map((entry) => ({
              report_id: reportId,
              group_id: input.groupId,
              student_id: entry.studentId,
              status: entry.status,
            })),
            { onConflict: "report_id,student_id" },
          );

        if (attendanceError) throw attendanceError;
      }

      const { error: feedbackError } = await db
        .from("life_group_weekly_feedback")
        .upsert(
          {
            report_id: reportId,
            feedback: input.feedback.trim(),
            submitted_by: user?.id ?? null,
          },
          { onConflict: "report_id" },
        );

      if (feedbackError) throw feedbackError;
      return reportId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["life-groups"] });
      toast({ title: "Weekly check-in saved", description: "Attendance and notes are up to date." });
    },
    onError: (error) => {
      toast({
        title: "Couldn't save weekly check-in",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useLifeGroupMeetingLocations(groups: LifeGroup[]) {
  return useMemo(() => {
    const defaults = ["Student Center", "Auditorium", "Lobby", "Cafe", "Room 101", "Room 102"];
    const existing = groups
      .map((group) => group.meeting_location)
      .filter((location): location is string => Boolean(location));

    return Array.from(new Set([...defaults, ...existing])).sort((a, b) => a.localeCompare(b));
  }, [groups]);
}
