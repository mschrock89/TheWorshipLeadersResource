import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { toast } from "@/hooks/use-toast";
import { MINISTRY_SLOT_CATEGORIES, POSITION_SLOTS, memberMatchesMinistryFilter } from "@/lib/constants";
import { TeamTemplateConfig, getRequiredGenderForSlot, getTeamTemplateSlotConfigs, isTeamSlotVisible } from "@/lib/teamTemplates";
import { useAuth } from "@/hooks/useAuth";
import { getWeekendKey, isWeekend } from "@/lib/utils";

export interface TeamPeriodLock {
  id: string;
  team_id: string;
  rotation_period_id: string;
  locked_at: string;
  locked_by: string | null;
}

export interface RotationPeriod {
  id: string;
  name: string;
  year: number;
  trimester: number;
  start_date: string;
  end_date: string;
  is_active: boolean;
  campus_id: string | null;
}

export interface WorshipTeam {
  id: string;
  name: string;
  color: string;
  icon: string;
  template_config?: TeamTemplateConfig | null;
}

interface TeamTemplateConfigRow {
  id: string;
  team_id: string;
  campus_id: string | null;
  template_config: TeamTemplateConfig | null;
  created_at: string;
  updated_at: string;
}

function isMissingTeamTemplateConfigsTable(error: { message?: string; code?: string } | null) {
  if (!error) return false;
  return (
    error.code === "PGRST205" ||
    error.message?.includes("team_template_configs") ||
    error.message?.includes("Could not find the table") ||
    error.message?.includes("does not exist") ||
    false
  );
}

const WORSHIP_TEAM_DISPLAY_ORDER = [
  "Team 1",
  "Team 2",
  "Team 3",
  "Team 4",
  "Simple Worship",
  "5th Sunday",
] as const;

function sortWorshipTeams(teams: WorshipTeam[]) {
  const orderMap = new Map(
    WORSHIP_TEAM_DISPLAY_ORDER.map((name, index) => [name.toLowerCase(), index]),
  );

  return [...teams].sort((a, b) => {
    const aIndex = orderMap.get(a.name.toLowerCase());
    const bIndex = orderMap.get(b.name.toLowerCase());

    if (aIndex !== undefined || bIndex !== undefined) {
      if (aIndex === undefined) return 1;
      if (bIndex === undefined) return -1;
      if (aIndex !== bIndex) return aIndex - bIndex;
    }

    return a.name.localeCompare(b.name);
  });
}

export interface TeamMemberAssignment {
  id: string;
  team_id: string;
  user_id: string | null;
  member_name: string;
  position: string;
  position_slot: string | null;
  display_order: number;
  rotation_period_id: string | null;
  ministry_types: string[];
  service_day: string | null;
}

export interface TeamMemberDateOverride {
  id: string;
  team_id: string;
  user_id: string | null;
  member_name: string;
  position: string;
  position_slot: string;
  rotation_period_id: string;
  schedule_date: string;
  ministry_types: string[];
}

export interface AvailableMember {
  id: string;
  full_name: string;
  avatar_url: string | null;
  gender: string | null;
  positions: string[];
  ministry_types: string[];
}

export interface RotationDraftSummary {
  id: string;
  rotation_period_id: string;
  campus_id: string;
  ministry_type: string;
  published_at?: string | null;
  published_by?: string | null;
  updated_at: string;
}

export interface RotationPublishNotification {
  userId: string;
  title: string;
  message: string;
  tag: string;
  url?: string;
  metadata?: Record<string, unknown>;
}

export interface RotationConflictAssignment {
  campusId: string | null;
  campusName: string;
  scheduleDate: string;
  teamId: string;
  teamName: string;
  ministryType: string | null;
  serviceDay: string | null;
}

export interface RotationConflict {
  userId: string;
  memberName: string;
  weekendKey: string;
  assignments: RotationConflictAssignment[];
}

export interface Campus {
  id: string;
  name: string;
  has_saturday_service?: boolean;
  has_sunday_service?: boolean;
}

export interface CampusWorshipPastor {
  id: string;
  full_name: string;
}

export interface MultiTeamAssignableMember {
  id: string;
}

interface CampusMinistryPositionAssignment {
  user_id: string;
  ministry_type: string;
  position: string;
}

interface AvailableMemberProfileRow {
  id: string;
  full_name: string;
  avatar_url: string | null;
  gender?: string | null;
  positions?: string[] | null;
  ministry_types?: string[] | null;
}

type TeamRotationDraftRow = Tables<"team_rotation_drafts">;
type TeamRotationDraftInsert = TablesInsert<"team_rotation_drafts">;
type TeamMemberRow = Tables<"team_members">;
type TeamMemberDateOverrideRow = Tables<"team_member_date_overrides">;
type TeamScheduleRow = Tables<"team_schedule">;
type WorshipTeamRow = Tables<"worship_teams">;
type RotationPeriodRow = Tables<"rotation_periods">;

interface RelatedRotationPeriodRow extends Pick<RotationPeriodRow, "id" | "campus_id"> {
  campuses: { name: string | null } | null;
}

// Re-export POSITION_SLOTS for backwards compatibility
export { POSITION_SLOTS } from "@/lib/constants";

// Fetch all campuses for admin dropdown
export function useAllCampuses() {
  return useQuery({
    queryKey: ["all-campuses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campuses")
        .select("id, name, has_saturday_service, has_sunday_service")
        .order("name");

      if (error) throw error;
      return data as Campus[];
    },
  });
}

// Get admin campus ID for campus_admin role
export function useAdminCampusId() {
  return useQuery({
    queryKey: ["admin-campus-id"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const [
        { data: roleRows, error: rolesError },
        { data: campusRows, error: campusesError },
        { data: profileRow, error: profileError },
      ] = await Promise.all([
        supabase
          .from("user_roles")
          .select("admin_campus_id, role")
          .eq("user_id", user.id),
        supabase
          .from("user_campuses")
          .select("campus_id")
          .eq("user_id", user.id),
        supabase
          .from("profiles")
          .select("default_campus_id")
          .eq("id", user.id)
          .maybeSingle(),
      ]);

      if (rolesError) throw rolesError;
      if (campusesError) throw campusesError;
      if (profileError) throw profileError;

      const data = roleRows || [];
      const assignedCampusIds = (campusRows || []).map((row) => row.campus_id).filter(Boolean);
      const fallbackCampusId = profileRow?.default_campus_id || assignedCampusIds[0] || null;

      // Check if user is org admin
      const isOrgAdmin = data?.some(r => r.role === "admin");
      if (isOrgAdmin) return { isOrgAdmin: true, campusId: null };

      // Prefer a campus-scoped admin assignment when a user has multiple
      // campus_admin rows so Team Builder opens in management mode.
      const campusAdminRole =
        data?.find((r) => r.role === "campus_admin" && !!r.admin_campus_id) ??
        data?.find((r) => r.role === "campus_admin");

      if (campusAdminRole?.admin_campus_id) {
        return {
          isOrgAdmin: false,
          campusId: campusAdminRole.admin_campus_id,
        };
      }

      const hasCampusScopedBuilderRole = data?.some((row) =>
        [
          "campus_worship_pastor",
          "student_worship_pastor",
          "video_director",
          "production_manager",
        ].includes(row.role),
      );

      return { 
        isOrgAdmin: false, 
        campusId: campusAdminRole?.admin_campus_id || (hasCampusScopedBuilderRole ? fallbackCampusId : null),
      };
    },
  });
}

export function useRotationPeriodsForCampus(campusId: string | null) {
  return useQuery({
    queryKey: ["rotation-periods", campusId],
    enabled: !!campusId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rotation_periods")
        .select("*")
        .eq("campus_id", campusId)
        .order("year", { ascending: false })
        .order("trimester", { ascending: true });

      if (error) throw error;
      return data as RotationPeriod[];
    },
  });
}

function comparePeriods(a: Pick<RotationPeriod, "year" | "trimester">, b: Pick<RotationPeriod, "year" | "trimester">) {
  if (a.year !== b.year) {
    return a.year - b.year;
  }

  return a.trimester - b.trimester;
}

// Helper to get the chronologically previous period ID
export function getPreviousPeriodId(periods: RotationPeriod[], currentPeriodId: string | null): string | null {
  if (!currentPeriodId || periods.length === 0) return null;

  const currentPeriod = periods.find((period) => period.id === currentPeriodId);
  if (!currentPeriod) return null;

  const previousPeriods = periods.filter(
    (period) => comparePeriods(period, currentPeriod) < 0,
  );

  if (previousPeriods.length === 0) return null;

  previousPeriods.sort((a, b) => comparePeriods(b, a));
  return previousPeriods[0].id;
}

export function getNextPeriodId(periods: RotationPeriod[], currentPeriodId: string | null): string | null {
  if (!currentPeriodId || periods.length === 0) return null;

  const currentPeriod = periods.find((period) => period.id === currentPeriodId);
  if (!currentPeriod) return null;

  const nextPeriods = periods.filter(
    (period) => comparePeriods(period, currentPeriod) > 0,
  );

  if (nextPeriods.length === 0) return null;

  nextPeriods.sort((a, b) => comparePeriods(a, b));
  return nextPeriods[0].id;
}

// Get members for the previous period (for consecutive break detection)
export function usePreviousPeriodMembers(
  periods: RotationPeriod[],
  currentPeriodId: string | null
) {
  const previousPeriodId = useMemo(() => {
    return getPreviousPeriodId(periods, currentPeriodId);
  }, [periods, currentPeriodId]);

  return useQuery({
    queryKey: ["team-members-period", previousPeriodId],
    enabled: !!previousPeriodId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_members")
        .select("*")
        .eq("rotation_period_id", previousPeriodId);

      if (error) throw error;
      return (data || []).map(m => ({
        ...m,
        // Treat NULL or empty array as default ministry for backwards compatibility
        ministry_types: m.ministry_types?.length ? m.ministry_types : ['weekend'],
        service_day: m.service_day || null,
      })) as TeamMemberAssignment[];
    },
  });
}

export function useWorshipTeams(campusId: string | null) {
  return useQuery({
    queryKey: ["worship-teams", campusId],
    queryFn: async () => {
      const { data: teams, error: teamsError } = await supabase
        .from("worship_teams")
        .select("*")
        .order("name");

      if (teamsError) throw teamsError;

      let templateQuery = supabase
        .from("team_template_configs")
        .select("id, team_id, campus_id, template_config, created_at, updated_at")
        .order("updated_at", { ascending: false });

      if (campusId) {
        templateQuery = templateQuery.or(`campus_id.eq.${campusId},campus_id.is.null`);
      } else {
        templateQuery = templateQuery.is("campus_id", null);
      }

      const { data: templateConfigs, error: templateConfigsError } = await templateQuery;
      if (templateConfigsError) {
        if (isMissingTeamTemplateConfigsTable(templateConfigsError)) {
          return sortWorshipTeams((teams || []) as WorshipTeam[]);
        }

        throw templateConfigsError;
      }

      const bestTemplateByTeamId = new Map<string, TeamTemplateConfigRow>();
      for (const row of (templateConfigs || []) as TeamTemplateConfigRow[]) {
        const existing = bestTemplateByTeamId.get(row.team_id);
        if (!existing) {
          bestTemplateByTeamId.set(row.team_id, row);
          continue;
        }

        const rowPriority = row.campus_id === campusId ? 2 : row.campus_id === null ? 1 : 0;
        const existingPriority =
          existing.campus_id === campusId ? 2 : existing.campus_id === null ? 1 : 0;

        if (rowPriority > existingPriority) {
          bestTemplateByTeamId.set(row.team_id, row);
        }
      }

      return sortWorshipTeams(
        ((teams || []) as WorshipTeam[]).map((team) => ({
          ...team,
          template_config: bestTemplateByTeamId.get(team.id)?.template_config ?? team.template_config ?? null,
        })),
      );
    },
  });
}

export function useCampusWorshipPastors(campusId: string | null) {
  return useQuery({
    queryKey: ["campus-worship-pastors", campusId],
    enabled: !!campusId,
    queryFn: async () => {
      if (!campusId) return [];

      const { data: roleRows, error: roleError } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["campus_worship_pastor", "student_worship_pastor"]);

      if (roleError) throw roleError;

      const leaderUserIds = [...new Set((roleRows || []).map((row) => row.user_id).filter(Boolean))];
      if (leaderUserIds.length === 0) return [];

      const { data: campusRows, error: campusError } = await supabase
        .from("user_campuses")
        .select("user_id")
        .eq("campus_id", campusId)
        .in("user_id", leaderUserIds);

      if (campusError) throw campusError;

      const campusLeaderIds = [...new Set((campusRows || []).map((row) => row.user_id).filter(Boolean))];
      if (campusLeaderIds.length === 0) return [];

      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", campusLeaderIds);

      if (profilesError) throw profilesError;
      return (profiles || []) as CampusWorshipPastor[];
    },
  });
}

export function useMultiTeamAssignableMembers(campusId: string | null) {
  return useQuery({
    queryKey: ["multi-team-assignable-members", campusId],
    enabled: !!campusId,
    queryFn: async () => {
      if (!campusId) return [];

      const { data: roleRows, error: roleError } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["campus_worship_pastor", "student_worship_pastor", "production_manager"]);

      if (roleError) throw roleError;

      const { data: videoRows, error: videoError } = await supabase
        .from("user_ministry_campuses")
        .select("user_id")
        .eq("campus_id", campusId)
        .eq("ministry_type", "video");

      if (videoError) throw videoError;

      const eligibleUserIds = [
        ...new Set([
          ...(roleRows || []).map((row) => row.user_id).filter(Boolean),
          ...(videoRows || []).map((row) => row.user_id).filter(Boolean),
        ]),
      ];
      if (eligibleUserIds.length === 0) return [];

      const { data: campusRows, error: campusError } = await supabase
        .from("user_campuses")
        .select("user_id")
        .eq("campus_id", campusId)
        .in("user_id", eligibleUserIds);

      if (campusError) throw campusError;

      return [...new Set((campusRows || []).map((row) => row.user_id).filter(Boolean))]
        .map((id) => ({ id })) as MultiTeamAssignableMember[];
    },
  });
}

export function useTeamMembersForPeriod(rotationPeriodId: string | null) {
  return useQuery({
    queryKey: ["team-members-period", rotationPeriodId],
    enabled: !!rotationPeriodId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_members")
        .select("*")
        .eq("rotation_period_id", rotationPeriodId);

      if (error) throw error;
      return (data || []).map(m => ({
        ...m,
        // Treat NULL or empty array as default ministry for backwards compatibility
        ministry_types: m.ministry_types?.length ? m.ministry_types : ['weekend'],
        service_day: m.service_day || null,
      })) as TeamMemberAssignment[];
    },
  });
}

export function useTeamMemberDateOverrides(rotationPeriodId: string | null) {
  return useQuery({
    queryKey: ["team-member-date-overrides", rotationPeriodId],
    enabled: !!rotationPeriodId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_member_date_overrides")
        .select("*")
        .eq("rotation_period_id", rotationPeriodId)
        .order("schedule_date", { ascending: true });

      if (error) throw error;
      return (data || []).map((override) => ({
        ...override,
        ministry_types: override.ministry_types?.length ? override.ministry_types : ["weekend"],
      })) as TeamMemberDateOverride[];
    },
  });
}

export function useAvailableMembers(campusId?: string | null, ministryType?: string | null) {
  const { user, isLoading } = useAuth();

  return useQuery({
    queryKey: ["available-members", campusId, ministryType],
    queryFn: async () => {
      // Use secure RPC that returns profiles for the current user's accessible campuses
      // (avoids relying on direct profiles table reads, which are restricted by consent + campus sharing rules)
      const { data: profiles, error: profilesError } = await supabase.rpc("get_profiles_for_campus");

      if (profilesError) throw profilesError;

      // If we have a campusId, fetch campus-specific ministry+position assignments
      // This determines which members are assigned to serve at this campus with which positions
      const memberDataMap: Record<string, { ministry_types: string[]; positions: string[] }> = {};
      
      if (campusId) {
        const { data: ministryAssignments, error: ministryAssignmentsError } = await supabase
          .from("user_ministry_campuses")
          .select("user_id, ministry_type")
          .eq("campus_id", campusId);

        if (ministryAssignmentsError) throw ministryAssignmentsError;

        const filteredMinistryAssignments =
          ministryType && ministryType !== "all"
            ? (ministryAssignments || []).filter((assignment) =>
                memberMatchesMinistryFilter(
                  [assignment.ministry_type || "weekend"],
                  ministryType,
                ),
              )
            : (ministryAssignments || []);

        filteredMinistryAssignments.forEach((assignment) => {
          if (!memberDataMap[assignment.user_id]) {
            memberDataMap[assignment.user_id] = { ministry_types: [], positions: [] };
          }
          if (!memberDataMap[assignment.user_id].ministry_types.includes(assignment.ministry_type)) {
            memberDataMap[assignment.user_id].ministry_types.push(assignment.ministry_type);
          }
        });

        const activeMinistryAssignments = new Set(
          filteredMinistryAssignments.map((assignment) => `${assignment.user_id}:${assignment.ministry_type}`),
        );

        // Query the new user_campus_ministry_positions table for positions
        const positionsQuery = supabase
          .from("user_campus_ministry_positions")
          .select("user_id, ministry_type, position")
          .eq("campus_id", campusId);

        const { data: positionAssignments, error: positionsError } = await positionsQuery;

        if (positionsError) throw positionsError;

        const filteredAssignments =
          ministryType && ministryType !== "all"
            ? ((positionAssignments || []) as CampusMinistryPositionAssignment[]).filter((assignment) =>
                activeMinistryAssignments.has(`${assignment.user_id}:${assignment.ministry_type}`) &&
                memberMatchesMinistryFilter(
                  [assignment.ministry_type || "weekend"],
                  ministryType,
                ),
              )
            : ((positionAssignments || []) as CampusMinistryPositionAssignment[]).filter((assignment) =>
                activeMinistryAssignments.has(`${assignment.user_id}:${assignment.ministry_type}`),
              );

        // Build a map of user_id -> { ministry_types, positions } for this campus.
        // Some campuses may have ministry assignments before all detailed position rows
        // are entered, so positions are additive but not required for inclusion.
        filteredAssignments.forEach((a) => {
          if (!memberDataMap[a.user_id]) {
            memberDataMap[a.user_id] = { ministry_types: [], positions: [] };
          }
          if (!memberDataMap[a.user_id].ministry_types.includes(a.ministry_type)) {
            memberDataMap[a.user_id].ministry_types.push(a.ministry_type);
          }
          if (!memberDataMap[a.user_id].positions.includes(a.position)) {
            memberDataMap[a.user_id].positions.push(a.position);
          }
        });
      }

      // Filter profiles to only include members with position assignments for this campus+ministry
      const assignedUserIds = new Set(Object.keys(memberDataMap));

      return ((profiles || []) as AvailableMemberProfileRow[])
        .filter((p) => !campusId || assignedUserIds.has(p.id))
        .map((p) => ({
          id: p.id,
          full_name: p.full_name,
          avatar_url: p.avatar_url || null,
          gender: p.gender || null,
          // Use campus+ministry specific positions from new table when present,
          // otherwise fall back to profile positions so ministry-assigned members
          // still appear in Team Builder and On Break lists.
          positions: campusId && memberDataMap[p.id] 
            ? (memberDataMap[p.id].positions.length > 0 ? memberDataMap[p.id].positions : (p.positions || []))
            : (p.positions || []),
          // Use campus-specific ministry types
          ministry_types: campusId && memberDataMap[p.id] 
            ? memberDataMap[p.id].ministry_types 
            : (p.ministry_types || []),
        })) as AvailableMember[];
    },
    enabled: !!user && !isLoading,
  });
}

// Get set of user IDs who have ever been assigned to a team
export function useHistoricalTeamMemberIds() {
  return useQuery({
    queryKey: ["historical-team-member-ids"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_members")
        .select("user_id")
        .not("user_id", "is", null);

      if (error) throw error;
      
      // Return unique user IDs
      const uniqueIds = new Set<string>();
      (data || []).forEach(m => {
        if (m.user_id) uniqueIds.add(m.user_id);
      });
      return uniqueIds;
    },
  });
}

export function useAssignMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      teamId,
      userId,
      memberName,
      positionSlot,
      rotationPeriodId,
      serviceDay,
      ministryTypes,
    }: {
      teamId: string;
      userId: string | null;
      memberName: string;
      positionSlot: string;
      rotationPeriodId: string;
      serviceDay?: string | null;
      ministryTypes?: string[];
    }) => {
      // IMPORTANT: team display filters depend on ministry_types including the active ministry.
      // If we ever insert/update with an empty array, the assignment can disappear when filtering.
      const normalizedMinistryTypes = ministryTypes?.length ? ministryTypes : ["weekend"];

      // Get position enum value from slot config
      const slotConfig = POSITION_SLOTS.find(s => s.slot === positionSlot);
      const position = slotConfig?.position || positionSlot;

      // Check if slot already has an assignment for this period
      const { data: existingRows, error: existingError } = await supabase
        .from("team_members")
        .select("id, service_day")
        .eq("team_id", teamId)
        .eq("position_slot", positionSlot)
        .eq("rotation_period_id", rotationPeriodId);

      if (existingError) throw existingError;

      const existingSpecificRow = (existingRows || []).find((row) => row.service_day === (serviceDay || null));
      const existingWholeWeekendRow = (existingRows || []).find((row) => !row.service_day);
      const oppositeServiceDay =
        serviceDay === "saturday" ? "sunday" : serviceDay === "sunday" ? "saturday" : null;

      if (!serviceDay) {
        if (existingWholeWeekendRow) {
          const { error } = await supabase
            .from("team_members")
            .update({
              user_id: userId,
              member_name: memberName,
              position,
              service_day: null,
              ministry_types: normalizedMinistryTypes,
            })
            .eq("id", existingWholeWeekendRow.id);

          if (error) throw error;
        } else {
          const { error } = await supabase.from("team_members").insert({
            team_id: teamId,
            user_id: userId,
            member_name: memberName,
            position,
            position_slot: positionSlot,
            rotation_period_id: rotationPeriodId,
            display_order: POSITION_SLOTS.findIndex(s => s.slot === positionSlot) + 1,
            service_day: null,
            ministry_types: normalizedMinistryTypes,
          });

          if (error) throw error;
        }

        const splitRowIds = (existingRows || [])
          .filter((row) => row.service_day)
          .map((row) => row.id);

        if (splitRowIds.length > 0) {
          const { error } = await supabase
            .from("team_members")
            .delete()
            .in("id", splitRowIds);

          if (error) throw error;
        }

        return;
      }

      if (existingWholeWeekendRow && oppositeServiceDay) {
        const { error } = await supabase
          .from("team_members")
          .update({ service_day: oppositeServiceDay })
          .eq("id", existingWholeWeekendRow.id);

        if (error) throw error;
      }

      if (existingSpecificRow) {
        const { error } = await supabase
          .from("team_members")
          .update({
            user_id: userId,
            member_name: memberName,
            position,
            service_day: serviceDay,
            ministry_types: normalizedMinistryTypes,
          })
          .eq("id", existingSpecificRow.id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from("team_members").insert({
          team_id: teamId,
          user_id: userId,
          member_name: memberName,
          position,
          position_slot: positionSlot,
          rotation_period_id: rotationPeriodId,
          display_order: POSITION_SLOTS.findIndex(s => s.slot === positionSlot) + 1,
          service_day: serviceDay,
          ministry_types: normalizedMinistryTypes,
        });

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members-period"] });
      queryClient.invalidateQueries({ queryKey: ["team-roster-for-date"] });
      toast({ title: "Member assigned successfully" });
    },
    onError: (error) => {
      toast({
        title: "Failed to assign member",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useRemoveMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      teamId,
      positionSlot,
      rotationPeriodId,
      serviceDay,
    }: {
      teamId: string;
      positionSlot: string;
      rotationPeriodId: string;
      serviceDay?: string | null;
    }) => {
      let query = supabase
        .from("team_members")
        .delete()
        .eq("team_id", teamId)
        .eq("position_slot", positionSlot)
        .eq("rotation_period_id", rotationPeriodId);

      query = serviceDay
        ? query.eq("service_day", serviceDay)
        : query.is("service_day", null);

      const { error } = await query;

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members-period"] });
      queryClient.invalidateQueries({ queryKey: ["team-roster-for-date"] });
    },
    onError: (error) => {
      toast({
        title: "Failed to remove member",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useAssignMemberDateOverride() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      teamId,
      userId,
      memberName,
      positionSlot,
      rotationPeriodId,
      scheduleDate,
      ministryTypes,
      suppressToast,
    }: {
      teamId: string;
      userId: string | null;
      memberName: string;
      positionSlot: string;
      rotationPeriodId: string;
      scheduleDate: string;
      ministryTypes?: string[];
      suppressToast?: boolean;
    }) => {
      const normalizedMinistryTypes = ministryTypes?.length ? ministryTypes : ["weekend"];
      const slotConfig = POSITION_SLOTS.find((s) => s.slot === positionSlot);
      const position = slotConfig?.position || positionSlot;

      const { error } = await supabase
        .from("team_member_date_overrides")
        .upsert(
          {
            team_id: teamId,
            user_id: userId,
            member_name: memberName,
            position,
            position_slot: positionSlot,
            rotation_period_id: rotationPeriodId,
            schedule_date: scheduleDate,
            ministry_types: normalizedMinistryTypes,
          },
          {
            onConflict: "team_id,rotation_period_id,position_slot,schedule_date",
          },
        );

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["team-member-date-overrides"] });
      queryClient.invalidateQueries({ queryKey: ["team-roster-for-date"] });
      if (!variables.suppressToast) {
        toast({ title: "Split assignment saved" });
      }
    },
    onError: (error) => {
      toast({
        title: "Failed to save split assignment",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useRemoveMemberDateOverride() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      teamId,
      positionSlot,
      rotationPeriodId,
      scheduleDate,
      suppressToast,
    }: {
      teamId: string;
      positionSlot: string;
      rotationPeriodId: string;
      scheduleDate: string;
      suppressToast?: boolean;
    }) => {
      const { error } = await supabase
        .from("team_member_date_overrides")
        .delete()
        .eq("team_id", teamId)
        .eq("position_slot", positionSlot)
        .eq("rotation_period_id", rotationPeriodId)
        .eq("schedule_date", scheduleDate);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["team-member-date-overrides"] });
      queryClient.invalidateQueries({ queryKey: ["team-roster-for-date"] });
      if (!variables.suppressToast) {
        toast({ title: "Split assignment removed" });
      }
    },
    onError: (error) => {
      toast({
        title: "Failed to remove split assignment",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useCopyFromPreviousPeriod() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      fromPeriodId,
      toPeriodId,
    }: {
      fromPeriodId: string | null;
      toPeriodId: string;
    }) => {
      // Get members from source period (or default if null)
      let query = supabase.from("team_members").select("*");
      
      if (fromPeriodId) {
        query = query.eq("rotation_period_id", fromPeriodId);
      } else {
        query = query.is("rotation_period_id", null);
      }

      const { data: sourceMembers, error: sourceError } = await query;
      if (sourceError) throw sourceError;

      if (!sourceMembers || sourceMembers.length === 0) {
        throw new Error("No members found in source period");
      }

      // Delete existing members in target period
      const { error: deleteError } = await supabase
        .from("team_members")
        .delete()
        .eq("rotation_period_id", toPeriodId);

      if (deleteError) throw deleteError;

      // Insert copied members with their ministry_types preserved
      const newMembers = sourceMembers.map(m => ({
        team_id: m.team_id,
        user_id: m.user_id,
        member_name: m.member_name,
        position: m.position,
        position_slot: m.position_slot,
        display_order: m.display_order,
        rotation_period_id: toPeriodId,
         // Treat NULL or empty array as default
         ministry_types: m.ministry_types?.length ? m.ministry_types : ['weekend'],
      }));

      const { error: insertError } = await supabase
        .from("team_members")
        .insert(newMembers);

      if (insertError) throw insertError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members-period"] });
      toast({ title: "Teams copied successfully" });
    },
    onError: (error) => {
      toast({
        title: "Failed to copy teams",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useClearPeriod() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (rotationPeriodId: string) => {
      const { error } = await supabase
        .from("team_members")
        .delete()
        .eq("rotation_period_id", rotationPeriodId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members-period"] });
      toast({ title: "All assignments cleared" });
    },
    onError: (error) => {
      toast({
        title: "Failed to clear assignments",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

function resolveConflictScheduleMinistries(ministryType: string) {
  if (ministryType === "all") {
    return null;
  }

  if (ministryType === "video") {
    return ["video"];
  }

  if (
    ministryType === "weekend" ||
    ministryType === "weekend_team" ||
    ministryType === "production"
  ) {
    return ["weekend", "sunday_am"];
  }

  return [ministryType];
}

function assignmentAppliesToScheduleDate(
  serviceDay: string | null | undefined,
  scheduleDate: string,
  ministryType: string,
) {
  if (!isWeekend(scheduleDate)) {
    return true;
  }

  if (!isWeekendRosterBreakLogicMinistry(ministryType) || !serviceDay) {
    return true;
  }

  const day = new Date(`${scheduleDate}T00:00:00`).getDay();
  if (serviceDay === "saturday") return day === 6;
  if (serviceDay === "sunday") return day === 0;
  return true;
}

function getConflictBucketKey(scheduleDate: string, ministryType: string) {
  if (isWeekend(scheduleDate) && ministryType !== "video") {
    return getWeekendKey(scheduleDate);
  }

  return scheduleDate;
}

export function useSaveRotationDraft() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      rotationPeriodId,
      campusId,
      ministryType,
      assignments,
    }: {
      rotationPeriodId: string;
      campusId: string;
      ministryType: string;
      assignments: TeamMemberAssignment[];
    }) => {
      const snapshot = assignments.map((assignment) => ({
        id: assignment.id,
        team_id: assignment.team_id,
        user_id: assignment.user_id,
        member_name: assignment.member_name,
        position: assignment.position,
        position_slot: assignment.position_slot,
        display_order: assignment.display_order,
        ministry_types: assignment.ministry_types,
        service_day: assignment.service_day,
      }));

      const draftPayload: TeamRotationDraftInsert = {
        rotation_period_id: rotationPeriodId,
        campus_id: campusId,
        ministry_type: ministryType,
        assignments: snapshot,
        saved_by: user?.id || null,
      };

      const { error } = await supabase
        .from("team_rotation_drafts")
        .upsert(draftPayload, { onConflict: "rotation_period_id,campus_id,ministry_type" });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-rotation-draft"] });
      toast({ title: "Rotation saved as draft" });
    },
    onError: (error) => {
      toast({
        title: "Failed to save draft",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function usePublishRotation() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      rotationPeriodId,
      campusId,
      ministryType,
      assignments,
      notifications,
    }: {
      rotationPeriodId: string;
      campusId: string;
      ministryType: string;
      assignments: TeamMemberAssignment[];
      notifications: RotationPublishNotification[];
    }) => {
      const snapshot = assignments.map((assignment) => ({
        id: assignment.id,
        team_id: assignment.team_id,
        user_id: assignment.user_id,
        member_name: assignment.member_name,
        position: assignment.position,
        position_slot: assignment.position_slot,
        display_order: assignment.display_order,
        ministry_types: assignment.ministry_types,
        service_day: assignment.service_day,
      }));

      const publishTimestamp = new Date().toISOString();
      const payload: TeamRotationDraftInsert = {
        rotation_period_id: rotationPeriodId,
        campus_id: campusId,
        ministry_type: ministryType,
        assignments: snapshot,
        saved_by: user?.id || null,
        published_at: publishTimestamp,
        published_by: user?.id || null,
      };

      const { error } = await supabase
        .from("team_rotation_drafts")
        .upsert(payload, { onConflict: "rotation_period_id,campus_id,ministry_type" });

      if (error) throw error;

      const results = await Promise.allSettled(
        notifications.map((notification) =>
          supabase.functions.invoke("send-push-notification", {
            body: {
              title: notification.title,
              message: notification.message,
              url: notification.url || "/team-builder",
              userIds: [notification.userId],
              tag: notification.tag,
              metadata: notification.metadata,
            },
          }),
        ),
      );

      const deliveredCount = results.reduce((count, result) => {
        if (result.status !== "fulfilled") return count;
        const response = result.value.data as { sent?: number } | null;
        return count + (response?.sent || 0);
      }, 0);

      return {
        publishedAt: publishTimestamp,
        deliveredCount,
        attemptedCount: notifications.length,
      };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["team-rotation-draft"] });
      toast({
        title: "Rotation published",
        description:
          result.attemptedCount > 0
            ? `${result.deliveredCount} of ${result.attemptedCount} push notifications were delivered.`
            : "The rotation is now live.",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to publish rotation",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useRotationDraftSummary(
  rotationPeriodId: string | null,
  campusId: string | null,
  ministryType: string | null,
) {
  return useQuery({
    queryKey: ["team-rotation-draft", rotationPeriodId, campusId, ministryType],
    enabled: !!rotationPeriodId && !!campusId && !!ministryType,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_rotation_drafts")
        .select("id, rotation_period_id, campus_id, ministry_type, updated_at, published_at, published_by")
        .eq("rotation_period_id", rotationPeriodId)
        .eq("campus_id", campusId)
        .eq("ministry_type", ministryType)
        .maybeSingle();

      if (error) throw error;
      return (data || null) as RotationDraftSummary | null;
    },
  });
}

export function useCrossCheckRotationAssignments() {
  return useMutation({
    mutationFn: async ({
      rotationPeriodId,
      rotationPeriodName,
      year,
      trimester,
      ministryType,
    }: {
      rotationPeriodId: string;
      rotationPeriodName: string;
      year: number;
      trimester: number;
      ministryType: string;
    }) => {
      const { data: relatedPeriods, error: periodsError } = await supabase
        .from("rotation_periods")
        .select("id, campus_id, campuses(name)")
        .eq("year", year)
        .eq("trimester", trimester);

      if (periodsError) throw periodsError;

      const periodRows = (relatedPeriods || []) as RelatedRotationPeriodRow[];

      const periodIds = periodRows.map((period) => period.id);
      if (!periodIds.includes(rotationPeriodId)) {
        periodIds.push(rotationPeriodId);
      }

      const periodCampusMap = new Map(
        periodRows.map((period) => [
          period.id,
          {
            campusId: period.campus_id,
            campusName: period.campuses?.name || "Unknown campus",
          },
        ]),
      );

      const { data: teamMembers, error: membersError } = await supabase
        .from("team_members")
        .select("rotation_period_id, user_id, member_name, team_id, ministry_types, service_day")
        .in("rotation_period_id", periodIds);

      if (membersError) throw membersError;

      const { data: dateOverrides, error: dateOverridesError } = await supabase
        .from("team_member_date_overrides")
        .select("rotation_period_id, user_id, member_name, team_id, position_slot, schedule_date, ministry_types")
        .in("rotation_period_id", periodIds);

      if (dateOverridesError) throw dateOverridesError;

      const relevantScheduleMinistries = resolveConflictScheduleMinistries(ministryType);
      let scheduleQuery = supabase
        .from("team_schedule")
        .select("team_id, schedule_date, ministry_type, campus_id, created_at")
        .eq("rotation_period", rotationPeriodName)
        .order("schedule_date", { ascending: true });

      if (relevantScheduleMinistries) {
        scheduleQuery = scheduleQuery.in("ministry_type", relevantScheduleMinistries);
      }

      const { data: scheduleEntries, error: scheduleError } = await scheduleQuery;
      if (scheduleError) throw scheduleError;

      const teamIds = Array.from(
        new Set((teamMembers || []).map((member) => member.team_id).filter(Boolean)),
      );
      const { data: teams, error: teamsError } = await supabase
        .from("worship_teams")
        .select("id, name")
        .in("id", teamIds.length > 0 ? teamIds : ["00000000-0000-0000-0000-000000000000"]);

      if (teamsError) throw teamsError;

      const teamNameMap = new Map((teams || []).map((team: Pick<WorshipTeamRow, "id" | "name">) => [team.id, team.name]));
      const schedulesByCampus = new Map<string, Array<Pick<TeamScheduleRow, "team_id" | "schedule_date" | "ministry_type" | "campus_id" | "created_at">>>();

      periodRows.forEach((period) => {
        const campusId = period.campus_id;
        const effectiveEntries = new Map<string, Pick<TeamScheduleRow, "team_id" | "schedule_date" | "ministry_type" | "campus_id" | "created_at">>();
        (scheduleEntries || [])
          .filter((entry) => entry.campus_id === campusId || entry.campus_id === null)
          .sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime())
          .forEach((entry) => {
            const key = `${entry.schedule_date}-${entry.ministry_type || "default"}`;
            const existing = effectiveEntries.get(key);
            if (!existing || (entry.campus_id !== null && existing.campus_id === null)) {
              effectiveEntries.set(key, entry);
            } else if ((entry.campus_id ?? null) === (existing.campus_id ?? null)) {
              const entryCreated = new Date(entry.created_at || 0).getTime();
              const existingCreated = new Date(existing.created_at || 0).getTime();
              if (entryCreated > existingCreated) {
                effectiveEntries.set(key, entry);
              }
            }
          });

        schedulesByCampus.set(period.id, Array.from(effectiveEntries.values()));
      });

      const overrideKeySet = new Set(
        ((dateOverrides || []) as Array<Pick<TeamMemberDateOverrideRow, "team_id" | "rotation_period_id" | "position_slot" | "schedule_date">>)
          .map((override) => `${override.rotation_period_id}:${override.team_id}:${override.position_slot}:${override.schedule_date}`),
      );

      const conflictsByUserWeekend = new Map<string, RotationConflict>();
      (teamMembers as Array<Pick<TeamMemberRow, "rotation_period_id" | "user_id" | "member_name" | "team_id" | "ministry_types" | "service_day">> | null || [])
        .filter((member) => member.user_id && memberMatchesMinistryFilter(member.ministry_types || [], ministryType))
        .forEach((member) => {
          const periodMeta = periodCampusMap.get(member.rotation_period_id);
          if (!periodMeta) return;

          const applicableSchedules = (schedulesByCampus.get(member.rotation_period_id) || []).filter(
            (entry) =>
              entry.team_id === member.team_id &&
              assignmentAppliesToScheduleDate(member.service_day, entry.schedule_date, ministryType) &&
              !overrideKeySet.has(
                `${member.rotation_period_id}:${member.team_id}:${member.position_slot || ""}:${entry.schedule_date}`,
              ),
          );

          applicableSchedules.forEach((entry) => {
            const weekendKey = getConflictBucketKey(entry.schedule_date, ministryType);
            const conflictKey = `${member.user_id}:${weekendKey}`;
            const existing = conflictsByUserWeekend.get(conflictKey);
            const assignment: RotationConflictAssignment = {
              campusId: periodMeta.campusId,
              campusName: periodMeta.campusName,
              scheduleDate: entry.schedule_date,
              teamId: member.team_id,
              teamName: teamNameMap.get(member.team_id) || "Unknown team",
              ministryType: entry.ministry_type,
              serviceDay: member.service_day,
            };

            if (!existing) {
              conflictsByUserWeekend.set(conflictKey, {
                userId: member.user_id!,
                memberName: member.member_name,
                weekendKey,
                assignments: [assignment],
              });
              return;
            }

            existing.assignments.push(assignment);
          });
        });

      ((dateOverrides || []) as Array<Pick<TeamMemberDateOverrideRow, "rotation_period_id" | "user_id" | "member_name" | "team_id" | "ministry_types" | "schedule_date">>)
        .filter((override) => override.user_id && memberMatchesMinistryFilter(override.ministry_types || [], ministryType))
        .forEach((override) => {
          const periodMeta = periodCampusMap.get(override.rotation_period_id);
          if (!periodMeta) return;

          const matchingSchedule = (schedulesByCampus.get(override.rotation_period_id) || []).find(
            (entry) => entry.team_id === override.team_id && entry.schedule_date === override.schedule_date,
          );

          if (!matchingSchedule) return;

          const weekendKey = getConflictBucketKey(override.schedule_date, ministryType);
          const conflictKey = `${override.user_id}:${weekendKey}`;
          const existing = conflictsByUserWeekend.get(conflictKey);
          const assignment: RotationConflictAssignment = {
            campusId: periodMeta.campusId,
            campusName: periodMeta.campusName,
            scheduleDate: override.schedule_date,
            teamId: override.team_id,
            teamName: teamNameMap.get(override.team_id) || "Unknown team",
            ministryType: matchingSchedule.ministry_type,
            serviceDay: null,
          };

          if (!existing) {
            conflictsByUserWeekend.set(conflictKey, {
              userId: override.user_id!,
              memberName: override.member_name,
              weekendKey,
              assignments: [assignment],
            });
            return;
          }

          existing.assignments.push(assignment);
        });

      return Array.from(conflictsByUserWeekend.values())
        .filter((conflict) => new Set(conflict.assignments.map((assignment) => assignment.campusId || assignment.campusName)).size > 1)
        .map((conflict) => ({
          ...conflict,
          assignments: conflict.assignments.sort((a, b) => a.scheduleDate.localeCompare(b.scheduleDate) || a.campusName.localeCompare(b.campusName)),
        }))
        .sort((a, b) => a.weekendKey.localeCompare(b.weekendKey) || a.memberName.localeCompare(b.memberName));
    },
    onError: (error) => {
      toast({
        title: "Cross-check failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

// Update ministry types for a team member
export function useUpdateMinistryTypes() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      memberId,
      ministryTypes,
    }: {
      memberId: string;
      ministryTypes: string[];
    }) => {
      const { error } = await supabase
        .from("team_members")
        .update({ ministry_types: ministryTypes })
        .eq("id", memberId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members-period"] });
      toast({ title: "Ministry types updated" });
    },
    onError: (error) => {
      toast({
        title: "Failed to update ministry types",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

// Position mapping from profile positions to slot names
const PROFILE_POSITION_TO_SLOTS: Record<string, string[]> = {
  // Vocals
  vocalist: ["vocalist_1", "vocalist_2", "vocalist_3", "vocalist_4"],
  // Instruments
  // Instruments
  drums: ["drums"],
  bass: ["bass"],
  keys: ["keys"],
  piano: ["keys"],
  electric_guitar: ["eg_1", "eg_2"],
  electric_1: ["eg_1"],
  electric_2: ["eg_2"],
  acoustic_guitar: ["ag_1", "ag_2"],
  acoustic_1: ["ag_1"],
  acoustic_2: ["ag_2"],
  // Production
  sound_tech: ["foh"],
  mon: ["mon"],
  broadcast: ["broadcast"],
  audio_shadow: ["audio_shadow"],
  lighting: ["lighting"],
  media: ["propresenter"],
  graphics: ["propresenter"], // Graphics maps to Lyrics/ProPresenter slot
  producer: ["producer"],
  // Video
  tri_pod_camera: ["tri_pod_camera"],
  hand_held_camera: ["hand_held_camera"],
  director: ["director"],
  switcher: ["switcher"],
};

// Get all slots a member can fill based on their positions
function getMemberAvailableSlots(positions: string[]): string[] {
  const slots = new Set<string>();
  positions.forEach(pos => {
    const posKey = pos.toLowerCase().replace(/\s+/g, '_');
    const mappedSlots = PROFILE_POSITION_TO_SLOTS[posKey] || [];
    mappedSlots.forEach(s => slots.add(s));
  });
  return Array.from(slots);
}

function normalizeGender(gender: string | null | undefined): "male" | "female" | null {
  if (!gender) return null;
  const normalized = gender.trim().toLowerCase();
  if (normalized === "male" || normalized === "female") return normalized;
  return null;
}

function memberMatchesSlotGender(
  member: AvailableMember,
  requiredGender: "male" | "female" | null,
) {
  if (!requiredGender) return true;
  return normalizeGender(member.gender) === requiredGender;
}

function canDoubleUpMaleVocalGuitarist(member: AvailableMember, targetSlot: string, existingSlots: Set<string>) {
  if (normalizeGender(member.gender) !== "male") return false;

  const memberSlots = new Set(getMemberAvailableSlots(member.positions));
  const hasVocalSlot = ["vocalist_1", "vocalist_2", "vocalist_3", "vocalist_4"].some((slot) => memberSlots.has(slot));
  const hasGuitarSlot = memberSlots.has("ag_1") || memberSlots.has("eg_2");
  if (!hasVocalSlot || !hasGuitarSlot) return false;

  const targetIsVocal = targetSlot.startsWith("vocalist_");
  const targetIsDoubleUpGuitar = targetSlot === "ag_1" || targetSlot === "eg_2";
  const alreadyHasVocal = [...existingSlots].some((slot) => slot.startsWith("vocalist_"));
  const alreadyHasDoubleUpGuitar = existingSlots.has("ag_1") || existingSlots.has("eg_2");

  if (targetIsVocal) {
    return !alreadyHasVocal && alreadyHasDoubleUpGuitar;
  }

  if (targetIsDoubleUpGuitar) {
    return alreadyHasVocal && !alreadyHasDoubleUpGuitar;
  }

  return false;
}

function exceedsGuitarFamilyLimit(filledSlots: Set<string>, targetSlot: string) {
  if (targetSlot === "ag_1" || targetSlot === "ag_2") {
    const acousticCount = ["ag_1", "ag_2"].filter((slot) => filledSlots.has(slot)).length;
    return acousticCount >= 2;
  }

  if (targetSlot === "eg_1" || targetSlot === "eg_2") {
    const electricCount = ["eg_1", "eg_2"].filter((slot) => filledSlots.has(slot)).length;
    return electricCount >= 2;
  }

  return false;
}

function canAssignMemberToTeam(
  assignedSlotsByTeam: Map<string, Map<string, Set<string>>>,
  member: AvailableMember,
  teamId: string,
  targetSlot: string,
  blockedTeammateIdsByTeam?: Map<string, Set<string>>,
  allowMultiTeamUserIds?: Set<string>,
) {
  const blockedTeammates = blockedTeammateIdsByTeam?.get(teamId);
  if (blockedTeammates?.has(member.id)) return false;

  const teamAssignments = assignedSlotsByTeam.get(member.id);
  if (!teamAssignments) return true;

  if (!allowMultiTeamUserIds?.has(member.id)) {
    const assignedTeamIds = [...teamAssignments.keys()];
    const isAssignedToDifferentTeam = assignedTeamIds.some((assignedTeamId) => assignedTeamId !== teamId);
    if (isAssignedToDifferentTeam) return false;
  }

  const existingSlots = teamAssignments.get(teamId);
  if (!existingSlots || existingSlots.size === 0) return true;

  return canDoubleUpMaleVocalGuitarist(member, targetSlot, existingSlots);
}

function getBlackoutConflictDatesForTeam(
  member: AvailableMember,
  teamId: string,
  blackoutDatesByUser?: Record<string, string[]>,
  teamScheduledDatesByTeam?: Map<string, Set<string>>,
) {
  const memberBlackoutDates = new Set(blackoutDatesByUser?.[member.id] || []);
  const teamScheduledDates = teamScheduledDatesByTeam?.get(teamId) || new Set<string>();

  if (memberBlackoutDates.size === 0 || teamScheduledDates.size === 0) {
    return [];
  }

  return [...teamScheduledDates].filter((scheduleDate) => memberBlackoutDates.has(scheduleDate)).sort();
}

function findBestCandidateForTeam(
  pool: AvailableMember[],
  team: WorshipTeam,
  targetSlot: string,
  assignedSlotsByTeam: Map<string, Map<string, Set<string>>>,
  blockedTeammateIdsByTeam?: Map<string, Set<string>>,
  allowMultiTeamUserIds?: Set<string>,
  blackoutDatesByUser?: Record<string, string[]>,
  teamScheduledDatesByTeam?: Map<string, Set<string>>,
  preferZeroConflicts = false,
) {
  let bestCandidate: AvailableMember | undefined;
  let bestConflictCount = Number.POSITIVE_INFINITY;

  for (const member of pool) {
    if (!canAssignMemberToTeam(assignedSlotsByTeam, member, team.id, targetSlot, blockedTeammateIdsByTeam, allowMultiTeamUserIds)) {
      continue;
    }

    const conflictCount = getBlackoutConflictDatesForTeam(
      member,
      team.id,
      blackoutDatesByUser,
      teamScheduledDatesByTeam,
    ).length;

    if (preferZeroConflicts && conflictCount > 0) {
      continue;
    }

    if (conflictCount < bestConflictCount) {
      bestCandidate = member;
      bestConflictCount = conflictCount;

      if (conflictCount === 0) {
        break;
      }
    }
  }

  return bestCandidate;
}

function memberHasBlackoutDates(
  member: AvailableMember,
  blackoutDatesByUser?: Record<string, string[]>,
) {
  return (blackoutDatesByUser?.[member.id] || []).length > 0;
}

function findBestTeamForMemberSlot(
  member: AvailableMember,
  targetTeams: WorshipTeam[],
  targetSlot: string,
  assignedSlotsByTeam: Map<string, Map<string, Set<string>>>,
  slotFilledPerTeam: Map<string, Set<string>>,
  blockedTeammateIdsByTeam?: Map<string, Set<string>>,
  blackoutDatesByUser?: Record<string, string[]>,
  teamScheduledDatesByTeam?: Map<string, Set<string>>,
  allowMultiTeamUserIds?: Set<string>,
) {
  let bestTeam: WorshipTeam | undefined;
  let bestConflictCount = Number.POSITIVE_INFINITY;

  for (const team of targetTeams) {
    const filledSlots = slotFilledPerTeam.get(team.id);
    if (filledSlots?.has(targetSlot)) continue;
    if (exceedsGuitarFamilyLimit(filledSlots || new Set<string>(), targetSlot)) continue;
    if (!isTeamSlotVisible(team.template_config, targetSlot)) continue;
    if (!canAssignMemberToTeam(assignedSlotsByTeam, member, team.id, targetSlot, blockedTeammateIdsByTeam, allowMultiTeamUserIds)) {
      continue;
    }

    const conflictCount = getBlackoutConflictDatesForTeam(
      member,
      team.id,
      blackoutDatesByUser,
      teamScheduledDatesByTeam,
    ).length;

    if (conflictCount < bestConflictCount) {
      bestTeam = team;
      bestConflictCount = conflictCount;

      if (conflictCount === 0) {
        break;
      }
    }
  }

  if (!bestTeam) return null;

  return {
    team: bestTeam,
    conflictCount: bestConflictCount,
  };
}

function trackMemberAssignment(
  assignedSlotsByTeam: Map<string, Map<string, Set<string>>>,
  memberId: string,
  teamId: string,
  slot: string,
) {
  if (!assignedSlotsByTeam.has(memberId)) {
    assignedSlotsByTeam.set(memberId, new Map());
  }

  const memberTeams = assignedSlotsByTeam.get(memberId)!;
  if (!memberTeams.has(teamId)) {
    memberTeams.set(teamId, new Set());
  }

  memberTeams.get(teamId)!.add(slot);
}

function getAssignedSlotsForTeam(
  assignedSlotsByTeam: Map<string, Map<string, Set<string>>>,
  teamId: string,
) {
  const assignedSlots = new Map<string, Set<string>>();

  for (const [memberId, teams] of assignedSlotsByTeam.entries()) {
    const teamSlots = teams.get(teamId);
    if (teamSlots?.size) {
      assignedSlots.set(memberId, teamSlots);
    }
  }

  return assignedSlots;
}

function hasTwoDedicatedBacklineElectrics(
  assignedSlotsByTeam: Map<string, Map<string, Set<string>>>,
  teamId: string,
) {
  let dedicatedElectricCount = 0;

  for (const slots of getAssignedSlotsForTeam(assignedSlotsByTeam, teamId).values()) {
    const hasElectric = slots.has("eg_1") || slots.has("eg_2");
    const hasVocal = [...slots].some((slot) => slot.startsWith("vocalist_"));

    if (hasElectric && !hasVocal) {
      dedicatedElectricCount += 1;
    }
  }

  return dedicatedElectricCount >= 2;
}

function getVisibleVocalSlots(
  teamVisibleSlots: Map<string, ReturnType<typeof getTeamTemplateSlotConfigs>>,
  teamId: string,
) {
  const vocalSlots = teamVisibleSlots.get(teamId)?.vocalSlots;
  return Array.isArray(vocalSlots) ? vocalSlots : [];
}

function assignCampusPastorsToVocalSlots(
  teams: WorshipTeam[],
  campusPastors: AvailableMember[],
  teamVisibleVocalSlots: Map<string, ReturnType<typeof getTeamTemplateSlotConfigs>>,
  assignMemberToSlot: (member: AvailableMember, team: WorshipTeam, targetSlot: string) => boolean,
) {
  for (const pastor of campusPastors) {
    const pastorGender = normalizeGender(pastor.gender);
    if (!pastorGender) continue;

    for (const team of teams) {
      const teamVocalSlots = getVisibleVocalSlots(teamVisibleVocalSlots, team.id);
      const preferredVocalSlots = teamVocalSlots
        .filter((slot) => slot.vocalGender === pastorGender)
        .map((slot) => slot.slot);
      const assigned = preferredVocalSlots.some((slot) =>
        assignMemberToSlot(pastor, team, slot),
      );

      if (!assigned) {
        const fallbackSlots = teamVocalSlots
          .filter((slot) => slot.vocalGender !== pastorGender)
          .map((slot) => slot.slot);

        fallbackSlots.some((slot) => assignMemberToSlot(pastor, team, slot));
      }
    }
  }
}

function isWeekendRosterBreakLogicMinistry(ministryType: string) {
  return ministryType === "weekend" || ministryType === "weekend_team" || ministryType === "video";
}

function countsAsTrimesterRosterAssignment(
  member: Pick<TeamMemberAssignment, "service_day">,
  ministryType: string,
) {
  if (isWeekendRosterBreakLogicMinistry(ministryType) && member.service_day) {
    return false;
  }

  return true;
}

// Auto-builder algorithm with ministry filtering, break rotation, and team variety
export function useAutoBuildTeams() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      rotationPeriodId,
      teams,
      members,
      ministryType,
      campusName,
      campusWorshipPastorIds,
      allowMultiTeamUserIds,
      previousPeriodMembers,
      breakExcludedUserIds,
      previousApprovedBreakUserIds,
      blackoutDatesByUser,
      scheduleEntries,
    }: {
      rotationPeriodId: string;
      teams: WorshipTeam[];
      members: AvailableMember[];
      ministryType: string;
      campusName?: string | null;
      campusWorshipPastorIds?: string[];
      allowMultiTeamUserIds?: string[];
      previousPeriodMembers: TeamMemberAssignment[];
      breakExcludedUserIds: string[];
      previousApprovedBreakUserIds: string[];
      blackoutDatesByUser: Record<string, string[]>;
      scheduleEntries: Array<{ team_id: string; schedule_date: string }>;
    }) => {
      const slotPriority = [
        "drums", "bass", "keys",
        "eg_1", "eg_2", "ag_1", "ag_2",
        "vocalist_1", "vocalist_2", "vocalist_3", "vocalist_4",
        "teacher", "announcement", "closing_prayer",
        "foh", "mon", "broadcast", "audio_shadow", "lighting", "propresenter", "producer",
        "tri_pod_camera", "hand_held_camera",
        "director", "graphics", "switcher",
      ];
      const allowedCategories =
        MINISTRY_SLOT_CATEGORIES[ministryType] || MINISTRY_SLOT_CATEGORIES.all;
      const visibleSlotsByTeam = new Map(
        teams.map((team) => [team.id, getTeamTemplateSlotConfigs(team.template_config)]),
      );
      const teamScheduledDatesByTeam = new Map<string, Set<string>>();
      for (const entry of scheduleEntries) {
        if (!teamScheduledDatesByTeam.has(entry.team_id)) {
          teamScheduledDatesByTeam.set(entry.team_id, new Set());
        }
        teamScheduledDatesByTeam.get(entry.team_id)!.add(entry.schedule_date);
      }
      const relevantSlots = new Set(
        teams.flatMap((team) =>
          slotPriority.filter((slot) => {
            const slotConfig = POSITION_SLOTS.find((positionSlot) => positionSlot.slot === slot);
            if (!slotConfig || !allowedCategories.includes(slotConfig.category)) return false;
            return isTeamSlotVisible(team.template_config, slot);
          }),
        ),
      );

      // 1. Filter members by ministry type
      const ministryEligibleMembers = ministryType === "all" 
        ? members 
        : members.filter((member) =>
            memberMatchesMinistryFilter(member.ministry_types, ministryType)
          );
      const eligibleMembers = ministryEligibleMembers.filter((member) =>
        getMemberAvailableSlots(member.positions).some((slot) => relevantSlots.has(slot)),
      );

      // 2. Exclude members with approved break requests
      const availablePool = eligibleMembers.filter(
        m => !breakExcludedUserIds.includes(m.id)
      );

      // 3. Build previous period tracking (filter by ministry if applicable)
      const prevPeriodFiltered = ministryType === "all"
        ? previousPeriodMembers
        : previousPeriodMembers.filter((member) =>
            memberMatchesMinistryFilter(member.ministry_types, ministryType)
          );
      const previousTrimesterRosterMembers = prevPeriodFiltered.filter((member) =>
        countsAsTrimesterRosterAssignment(member, ministryType),
      );
      
      const previousTeamMap = new Map<string, string>(); // userId -> teamId
      previousTrimesterRosterMembers.forEach(m => {
        if (m.user_id) previousTeamMap.set(m.user_id, m.team_id);
      });

      // 4. Categorize members
      // "Must serve" means they were off the previous trimester roster OR had
      // an approved full-trimester break in the previous period.
      const previousRosterUserIds = new Set(previousTrimesterRosterMembers.map(m => m.user_id).filter(Boolean));
      const previousApprovedBreakUserIdSet = new Set(previousApprovedBreakUserIds);
      const wasOffRosterLastPeriod = availablePool.filter(
        (member) =>
          !previousRosterUserIds.has(member.id) ||
          previousApprovedBreakUserIdSet.has(member.id),
      );
      const servedLastPeriod = availablePool.filter(m => previousRosterUserIds.has(m.id));
      const membersWithBlackoutDates = availablePool.filter((member) =>
        memberHasBlackoutDates(member, blackoutDatesByUser),
      );
      const membersWithoutBlackoutDates = availablePool.filter((member) =>
        !memberHasBlackoutDates(member, blackoutDatesByUser),
      );
      const wasOffRosterWithBlackoutDates = wasOffRosterLastPeriod.filter((member) =>
        membersWithBlackoutDates.some((candidate) => candidate.id === member.id),
      );
      const servedLastPeriodWithBlackoutDates = servedLastPeriod.filter((member) =>
        membersWithBlackoutDates.some((candidate) => candidate.id === member.id),
      );
      const wasOffRosterWithoutBlackoutDates = wasOffRosterLastPeriod.filter((member) =>
        membersWithoutBlackoutDates.some((candidate) => candidate.id === member.id),
      );
      const servedLastPeriodWithoutBlackoutDates = servedLastPeriod.filter((member) =>
        membersWithoutBlackoutDates.some((candidate) => candidate.id === member.id),
      );

      // 5. Clear existing assignments for this period and ministry
      if (ministryType === "all") {
        await supabase
          .from("team_members")
          .delete()
          .eq("rotation_period_id", rotationPeriodId);
      } else {
        // Get all members for this period, then delete only those with matching ministry
        const { data: existingMembers } = await supabase
          .from("team_members")
          .select("id, ministry_types")
          .eq("rotation_period_id", rotationPeriodId);
        
        const idsToDelete = (existingMembers || [])
          .filter((member) =>
            memberMatchesMinistryFilter(member.ministry_types, ministryType)
          )
          .map(m => m.id);
        
        if (idsToDelete.length > 0) {
          await supabase
            .from("team_members")
            .delete()
            .in("id", idsToDelete);
        }
      }

      const assignments: {
        team_id: string;
        user_id: string;
        member_name: string;
        position: string;
        position_slot: string;
        display_order: number;
        rotation_period_id: string;
        ministry_types: string[];
      }[] = [];

      const userAssignedSlotsByTeam = new Map<string, Map<string, Set<string>>>();
      const blockedTeammateIdsByTeam = new Map<string, Set<string>>();
      const slotFilledPerTeam = new Map<string, Set<string>>(); // teamId -> set of slots
      const multiTeamUserIds = new Set(allowMultiTeamUserIds || campusWorshipPastorIds || []);

      teams.forEach(t => slotFilledPerTeam.set(t.id, new Set()));

        const assignMemberToSlot = (member: AvailableMember, team: WorshipTeam, targetSlot: string) => {
        const slotConfig = POSITION_SLOTS.find((positionSlot) => positionSlot.slot === targetSlot);
        if (!slotConfig) return false;
        if (!allowedCategories.includes(slotConfig.category)) return false;
        if (!isTeamSlotVisible(team.template_config, targetSlot)) return false;
        if (!memberMatchesSlotGender(member, getRequiredGenderForSlot(team.template_config, targetSlot))) return false;

        const filledSlots = slotFilledPerTeam.get(team.id)!;
        if (filledSlots.has(targetSlot)) return false;
        if (exceedsGuitarFamilyLimit(filledSlots, targetSlot)) return false;
        if (!canAssignMemberToTeam(userAssignedSlotsByTeam, member, team.id, targetSlot, blockedTeammateIdsByTeam, multiTeamUserIds)) return false;

        filledSlots.add(targetSlot);
        trackMemberAssignment(userAssignedSlotsByTeam, member.id, team.id, targetSlot);

        assignments.push({
          team_id: team.id,
          user_id: member.id,
          member_name: member.full_name,
          position: slotConfig.label,
          position_slot: targetSlot,
          display_order: POSITION_SLOTS.findIndex(s => s.slot === targetSlot) + 1,
          rotation_period_id: rotationPeriodId,
          ministry_types: ministryType === "all" ? ["weekend"] : [ministryType],
        });

        return true;
      };

      const isWeekendWorshipBuild =
        ministryType === "weekend" || ministryType === "weekend_team";
      const isMurfreesboroWeekendBuild =
        campusName === "Murfreesboro Central" && isWeekendWorshipBuild;

      if (isWeekendWorshipBuild && teams.length > 0) {
        const allVisibleVocalSlots = teams.flatMap(
          (team) => getVisibleVocalSlots(visibleSlotsByTeam, team.id),
        );
        const maleVocalists = availablePool.filter((member) => {
          return (
            normalizeGender(member.gender) === "male" &&
            getMemberAvailableSlots(member.positions).some((slot) =>
              allVisibleVocalSlots.some((visibleSlot) => visibleSlot.slot === slot),
            )
          );
        });
        const femaleVocalists = availablePool.filter((member) => {
          return (
            normalizeGender(member.gender) === "female" &&
            getMemberAvailableSlots(member.positions).some((slot) =>
              allVisibleVocalSlots.some((visibleSlot) => visibleSlot.slot === slot),
            )
          );
        });
        const maleMustServeVocalists = maleVocalists.filter((member) =>
          wasOffRosterLastPeriod.some((candidate) => candidate.id === member.id),
        );
        const maleReturningVocalists = maleVocalists.filter((member) =>
          !wasOffRosterLastPeriod.some((candidate) => candidate.id === member.id),
        );
        const femaleMustServeVocalists = femaleVocalists.filter((member) =>
          wasOffRosterLastPeriod.some((candidate) => candidate.id === member.id),
        );
        const femaleReturningVocalists = femaleVocalists.filter((member) =>
          !wasOffRosterLastPeriod.some((candidate) => candidate.id === member.id),
        );

        const currentUserMember = availablePool.find((member) => member.id === user?.id);
        const kyleMember = availablePool.find((member) => member.full_name === "Kyle Elkins");
        const campusPastors = availablePool.filter((member) =>
          campusWorshipPastorIds?.includes(member.id)
        );
        assignCampusPastorsToVocalSlots(teams, campusPastors, visibleSlotsByTeam, assignMemberToSlot);

        if (isMurfreesboroWeekendBuild) {
          const prioritizedTeams = teams.slice(0, Math.min(3, teams.length));
          const kyleTeam = teams.find((team) => !prioritizedTeams.some((prioritizedTeam) => prioritizedTeam.id === team.id));

          if (currentUserMember && normalizeGender(currentUserMember.gender) === "male") {
            for (const team of prioritizedTeams) {
              if (kyleMember) {
              if (!blockedTeammateIdsByTeam.has(team.id)) {
                  blockedTeammateIdsByTeam.set(team.id, new Set());
                }
                blockedTeammateIdsByTeam.get(team.id)!.add(kyleMember.id);
              }
              const defaultMaleSlot = getVisibleVocalSlots(visibleSlotsByTeam, team.id).find(
                (slot) => slot.vocalGender === "male",
              )?.slot;
              if (defaultMaleSlot) {
                assignMemberToSlot(currentUserMember, team, defaultMaleSlot);
              }
              if (getMemberAvailableSlots(currentUserMember.positions).includes("ag_1")) {
                assignMemberToSlot(currentUserMember, team, "ag_1");
              } else if (getMemberAvailableSlots(currentUserMember.positions).includes("eg_2")) {
                assignMemberToSlot(currentUserMember, team, "eg_2");
              }
            }
          }

          if (kyleMember && kyleTeam) {
            if (currentUserMember) {
              if (!blockedTeammateIdsByTeam.has(kyleTeam.id)) {
                blockedTeammateIdsByTeam.set(kyleTeam.id, new Set());
              }
              blockedTeammateIdsByTeam.get(kyleTeam.id)!.add(currentUserMember.id);
            }
            const defaultMaleSlot = getVisibleVocalSlots(visibleSlotsByTeam, kyleTeam.id).find(
              (slot) => slot.vocalGender === "male",
            )?.slot;
            if (defaultMaleSlot) {
              assignMemberToSlot(kyleMember, kyleTeam, defaultMaleSlot);
            }
          }
        }

        const assignGenderedVocalists = (
          targetTeams: WorshipTeam[],
          targetGender: "male" | "female",
          mustServePool: AvailableMember[],
          returningPool: AvailableMember[],
        ) => {
          const shuffledMustServePool = [...mustServePool].sort(() => Math.random() - 0.5);
          const shuffledReturningPool = [...returningPool].sort(() => Math.random() - 0.5);

          for (const team of targetTeams) {
            const targetSlots = getVisibleVocalSlots(visibleSlotsByTeam, team.id)
              .filter((slot) => slot.vocalGender === targetGender)
              .map((slot) => slot.slot);

            for (const targetSlot of targetSlots) {
              const filledSlots = slotFilledPerTeam.get(team.id)!;
              if (filledSlots.has(targetSlot)) continue;

              let candidate = findBestCandidateForTeam(
                shuffledMustServePool.filter((member) => getMemberAvailableSlots(member.positions).includes(targetSlot)),
                team,
                targetSlot,
                userAssignedSlotsByTeam,
                blockedTeammateIdsByTeam,
                multiTeamUserIds,
                blackoutDatesByUser,
                teamScheduledDatesByTeam,
                true,
              );

              if (!candidate) {
                candidate = findBestCandidateForTeam(
                  shuffledReturningPool.filter((member) => getMemberAvailableSlots(member.positions).includes(targetSlot)),
                  team,
                  targetSlot,
                  userAssignedSlotsByTeam,
                  blockedTeammateIdsByTeam,
                  multiTeamUserIds,
                  blackoutDatesByUser,
                  teamScheduledDatesByTeam,
                  true,
                );
              }

              if (!candidate) continue;
              assignMemberToSlot(candidate, team, targetSlot);

              const mustServeCandidateIndex = shuffledMustServePool.indexOf(candidate);
              if (mustServeCandidateIndex > -1 && !canDoubleUpMaleVocalGuitarist(candidate, targetSlot, new Set())) {
                shuffledMustServePool.splice(mustServeCandidateIndex, 1);
              }

              const returningCandidateIndex = shuffledReturningPool.indexOf(candidate);
              if (returningCandidateIndex > -1 && !canDoubleUpMaleVocalGuitarist(candidate, targetSlot, new Set())) {
                shuffledReturningPool.splice(returningCandidateIndex, 1);
              }
            }
          }
        };

        const assignBlackoutPriorityVocalists = (
          targetTeams: WorshipTeam[],
          targetGender: "male" | "female",
          mustServePool: AvailableMember[],
          returningPool: AvailableMember[],
        ) => {
          const assignPool = (pool: AvailableMember[]) => {
            const prioritizedMembers = [...pool]
              .sort(() => Math.random() - 0.5)
              .sort((a, b) => {
                const aBest = Math.min(
                  ...targetTeams
                    .filter((team) =>
                      getVisibleVocalSlots(visibleSlotsByTeam, team.id).some(
                        (slot) => slot.vocalGender === targetGender && getMemberAvailableSlots(a.positions).includes(slot.slot),
                      ),
                    )
                    .map((team) =>
                      getBlackoutConflictDatesForTeam(a, team.id, blackoutDatesByUser, teamScheduledDatesByTeam).length,
                    ),
                );
                const bBest = Math.min(
                  ...targetTeams
                    .filter((team) =>
                      getVisibleVocalSlots(visibleSlotsByTeam, team.id).some(
                        (slot) => slot.vocalGender === targetGender && getMemberAvailableSlots(b.positions).includes(slot.slot),
                      ),
                    )
                    .map((team) =>
                      getBlackoutConflictDatesForTeam(b, team.id, blackoutDatesByUser, teamScheduledDatesByTeam).length,
                    ),
                );
                const aHasZero = Number.isFinite(aBest) && aBest === 0 ? 1 : 0;
                const bHasZero = Number.isFinite(bBest) && bBest === 0 ? 1 : 0;
                if (aHasZero !== bHasZero) return aHasZero - bHasZero;
                return aBest - bBest;
              });

            for (const member of prioritizedMembers) {
              const eligibleTeams = targetTeams.filter((team) =>
                getVisibleVocalSlots(visibleSlotsByTeam, team.id).some(
                  (slot) => slot.vocalGender === targetGender && getMemberAvailableSlots(member.positions).includes(slot.slot),
                ),
              );
              let bestOption:
                | { team: WorshipTeam; conflictCount: number; slot: string }
                | null = null;

              for (const team of eligibleTeams) {
                const candidateSlots = getVisibleVocalSlots(visibleSlotsByTeam, team.id)
                  .filter((slot) => slot.vocalGender === targetGender)
                  .map((slot) => slot.slot)
                  .filter((slot) => getMemberAvailableSlots(member.positions).includes(slot));

                for (const slot of candidateSlots) {
                  const option = findBestTeamForMemberSlot(
                    member,
                    [team],
                    slot,
                    userAssignedSlotsByTeam,
                    slotFilledPerTeam,
                    blockedTeammateIdsByTeam,
                    blackoutDatesByUser,
                    teamScheduledDatesByTeam,
                    multiTeamUserIds,
                  );

                  if (!option) continue;
                  if (!bestOption || option.conflictCount < bestOption.conflictCount) {
                    bestOption = { ...option, slot };
                    if (option.conflictCount === 0) break;
                  }
                }

                if (bestOption?.conflictCount === 0) break;
              }

              if (bestOption) {
                assignMemberToSlot(member, bestOption.team, bestOption.slot);
              }
            }
          };

          assignPool(mustServePool);
          assignPool(returningPool);
        };

        assignBlackoutPriorityVocalists(teams, "male", maleMustServeVocalists.filter((member) =>
          memberHasBlackoutDates(member, blackoutDatesByUser),
        ), maleReturningVocalists.filter((member) =>
          memberHasBlackoutDates(member, blackoutDatesByUser),
        ));
        assignBlackoutPriorityVocalists(teams, "female", femaleMustServeVocalists.filter((member) =>
          memberHasBlackoutDates(member, blackoutDatesByUser),
        ), femaleReturningVocalists.filter((member) =>
          memberHasBlackoutDates(member, blackoutDatesByUser),
        ));

        assignGenderedVocalists(teams, "male", maleMustServeVocalists, maleReturningVocalists);
        assignGenderedVocalists(teams, "female", femaleMustServeVocalists, femaleReturningVocalists);
      }

      // For each slot in priority order
      for (const targetSlot of slotPriority) {
        if (
          isMurfreesboroWeekendBuild &&
          targetSlot === "ag_2"
        ) {
          continue;
        }

        const slotConfig = POSITION_SLOTS.find(s => s.slot === targetSlot);
        if (!slotConfig) continue;
        if (!allowedCategories.includes(slotConfig.category)) continue;

        // Find members who can fill this slot
        const getCandidates = (pool: AvailableMember[]) => 
          pool.filter(m => getMemberAvailableSlots(m.positions).includes(targetSlot));

        // Candidates who were on break (must serve this period - no consecutive breaks)
        const mustServeCandidates = getCandidates(wasOffRosterWithoutBlackoutDates);
        // Candidates who served last period
        const canServeCandidates = getCandidates(servedLastPeriodWithoutBlackoutDates);

        // Shuffle for randomness
        const shuffleMustServe = [...mustServeCandidates].sort(() => Math.random() - 0.5);
        const shuffleCanServe = [...canServeCandidates].sort(() => Math.random() - 0.5);

        // Sort canServe by team variety (prefer different team from last period)
        const sortByTeamVariety = (pool: AvailableMember[], team: WorshipTeam) => {
          return [...pool].sort((a, b) => {
            const aPrevTeam = previousTeamMap.get(a.id);
            const bPrevTeam = previousTeamMap.get(b.id);
            // Prefer members who were NOT on this team before
            const aWasOnSameTeam = aPrevTeam === team.id ? 1 : 0;
            const bWasOnSameTeam = bPrevTeam === team.id ? 1 : 0;
            return aWasOnSameTeam - bWasOnSameTeam;
          });
        };

        const assignBlackoutPriorityPool = (pool: AvailableMember[]) => {
          const prioritizedMembers = [...getCandidates(pool)]
            .sort(() => Math.random() - 0.5)
            .sort((a, b) => {
              const aBest = findBestTeamForMemberSlot(
                a,
                teams,
                targetSlot,
                userAssignedSlotsByTeam,
                slotFilledPerTeam,
                blockedTeammateIdsByTeam,
                blackoutDatesByUser,
                teamScheduledDatesByTeam,
                multiTeamUserIds,
              );
              const bBest = findBestTeamForMemberSlot(
                b,
                teams,
                targetSlot,
                userAssignedSlotsByTeam,
                slotFilledPerTeam,
                blockedTeammateIdsByTeam,
                blackoutDatesByUser,
                teamScheduledDatesByTeam,
                multiTeamUserIds,
              );
              const aScore = aBest?.conflictCount ?? Number.POSITIVE_INFINITY;
              const bScore = bBest?.conflictCount ?? Number.POSITIVE_INFINITY;
              const aHasZero = aScore === 0 ? 1 : 0;
              const bHasZero = bScore === 0 ? 1 : 0;
              if (aHasZero !== bHasZero) return aHasZero - bHasZero;
              return aScore - bScore;
            });

          for (const member of prioritizedMembers) {
            const bestOption = findBestTeamForMemberSlot(
              member,
              teams,
              targetSlot,
              userAssignedSlotsByTeam,
              slotFilledPerTeam,
              blockedTeammateIdsByTeam,
              blackoutDatesByUser,
              teamScheduledDatesByTeam,
              multiTeamUserIds,
            );

            if (bestOption) {
              assignMemberToSlot(member, bestOption.team, targetSlot);
            }
          }
        };

        assignBlackoutPriorityPool(wasOffRosterWithBlackoutDates);
        assignBlackoutPriorityPool(servedLastPeriodWithBlackoutDates);

        // Assign to each team
        for (const team of teams) {
          if (!isTeamSlotVisible(team.template_config, targetSlot)) continue;
          const filledSlots = slotFilledPerTeam.get(team.id)!;
          if (filledSlots.has(targetSlot)) continue;

          // Find best candidate
          let assigned: AvailableMember | undefined;

          // First priority: Must serve (was off the previous roster)
          assigned = findBestCandidateForTeam(
            shuffleMustServe,
            team,
            targetSlot,
            userAssignedSlotsByTeam,
            blockedTeammateIdsByTeam,
            multiTeamUserIds,
            blackoutDatesByUser,
            teamScheduledDatesByTeam,
            true,
          );

          // Second priority: Can serve, prefer different team
          if (!assigned) {
            const sortedCanServe = sortByTeamVariety(shuffleCanServe, team);
            assigned = findBestCandidateForTeam(
              sortedCanServe,
              team,
              targetSlot,
              userAssignedSlotsByTeam,
              blockedTeammateIdsByTeam,
              multiTeamUserIds,
              blackoutDatesByUser,
              teamScheduledDatesByTeam,
              true,
            );
          }

          if (assigned && assignMemberToSlot(assigned, team, targetSlot)) {
            // Remove from pools to avoid double assignment to same slot
            const mustServeIdx = shuffleMustServe.indexOf(assigned);
            if (mustServeIdx > -1) shuffleMustServe.splice(mustServeIdx, 1);
            const canServeIdx = shuffleCanServe.indexOf(assigned);
            if (canServeIdx > -1) shuffleCanServe.splice(canServeIdx, 1);
          }
        }
      }

      if (isMurfreesboroWeekendBuild) {
        for (const team of teams) {
          if (hasTwoDedicatedBacklineElectrics(userAssignedSlotsByTeam, team.id)) {
            continue;
          }

          const ag2Candidates = [
            ...wasOffRosterLastPeriod,
            ...servedLastPeriod,
          ]
            .filter((member, index, pool) =>
              pool.findIndex((candidate) => candidate.id === member.id) === index
            )
            .filter((member) => getMemberAvailableSlots(member.positions).includes("ag_2"));

        const candidate = findBestCandidateForTeam(
          ag2Candidates,
          team,
          "ag_2",
          userAssignedSlotsByTeam,
          blockedTeammateIdsByTeam,
          multiTeamUserIds,
          blackoutDatesByUser,
          teamScheduledDatesByTeam,
          true,
        );

        if (candidate) {
          assignMemberToSlot(candidate, team, "ag_2");
        }
      }
    }

      if (assignments.length > 0) {
        const { error } = await supabase.from("team_members").insert(assignments);
        if (error) throw error;
      }

      const blackoutConflictAssignments = assignments
        .map((assignment) => {
          const member = members.find((candidate) => candidate.id === assignment.user_id);
          if (!member) return null;

          const conflictDates = getBlackoutConflictDatesForTeam(
            member,
            assignment.team_id,
            blackoutDatesByUser,
            teamScheduledDatesByTeam,
          );

          if (conflictDates.length === 0) return null;

          return {
            memberName: assignment.member_name,
            teamId: assignment.team_id,
            conflictDates,
          };
        })
        .filter(Boolean);

      return {
        totalAssignments: assignments.length,
        teamsBuilt: teams.length,
        eligibleMembers: availablePool.length,
        mustServe: wasOffRosterLastPeriod.length,
        blackoutConflictAssignments,
      };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["team-members-period"] });
      toast({ 
        title: `Auto-built ${result.teamsBuilt} teams`,
        description:
          result.blackoutConflictAssignments.length > 0
            ? `${result.totalAssignments} assignments made with ${result.blackoutConflictAssignments.length} blackout conflict${result.blackoutConflictAssignments.length === 1 ? "" : "s"} to review`
            : `${result.totalAssignments} assignments made from ${result.eligibleMembers} eligible members`,
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to auto-build teams",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

// Fetch locks for a rotation period
export function useTeamLocksForPeriod(rotationPeriodId: string | null) {
  return useQuery({
    queryKey: ["team-locks", rotationPeriodId],
    enabled: !!rotationPeriodId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_period_locks")
        .select("*")
        .eq("rotation_period_id", rotationPeriodId);

      if (error) throw error;
      return (data || []) as TeamPeriodLock[];
    },
  });
}

// Toggle lock for a team in a rotation period
export function useToggleTeamLock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      teamId,
      rotationPeriodId,
      isCurrentlyLocked,
    }: {
      teamId: string;
      rotationPeriodId: string;
      isCurrentlyLocked: boolean;
    }) => {
      if (isCurrentlyLocked) {
        // Unlock - delete the lock record
        const { error } = await supabase
          .from("team_period_locks")
          .delete()
          .eq("team_id", teamId)
          .eq("rotation_period_id", rotationPeriodId);

        if (error) throw error;
      } else {
        // Lock - insert a new lock record
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase
          .from("team_period_locks")
          .insert({
            team_id: teamId,
            rotation_period_id: rotationPeriodId,
            locked_by: user?.id || null,
          });

        if (error) throw error;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["team-locks", variables.rotationPeriodId] });
      toast({ 
        title: variables.isCurrentlyLocked ? "Team unlocked" : "Team locked",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to toggle lock",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useUpdateTeamTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      teamId,
      campusId,
      templateConfig,
    }: {
      teamId: string;
      campusId: string;
      templateConfig: TeamTemplateConfig;
    }) => {
      const { data: existingConfig, error: existingConfigError } = await supabase
        .from("team_template_configs")
        .select("id")
        .eq("team_id", teamId)
        .eq("campus_id", campusId)
        .maybeSingle();

      if (isMissingTeamTemplateConfigsTable(existingConfigError)) {
        const { error: fallbackError } = await supabase
          .from("worship_teams")
          .update({ template_config: templateConfig })
          .eq("id", teamId);

        if (fallbackError) throw fallbackError;
        return;
      }

      if (existingConfigError) throw existingConfigError;

      const payload = {
        team_id: teamId,
        campus_id: campusId,
        template_config: templateConfig,
      };

      const { error } = existingConfig?.id
        ? await supabase
            .from("team_template_configs")
            .update({ template_config: templateConfig })
            .eq("id", existingConfig.id)
        : await supabase
            .from("team_template_configs")
            .insert(payload);

      if (isMissingTeamTemplateConfigsTable(error)) {
        const { error: fallbackError } = await supabase
          .from("worship_teams")
          .update({ template_config: templateConfig })
          .eq("id", teamId);

        if (fallbackError) throw fallbackError;
        return;
      }

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["worship-teams"] });
      queryClient.invalidateQueries({ queryKey: ["worship-teams", variables.campusId] });
      toast({ title: "Team template updated" });
    },
    onError: (error) => {
      toast({
        title: "Failed to update team template",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
