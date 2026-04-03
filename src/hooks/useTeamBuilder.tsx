import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { MINISTRY_SLOT_CATEGORIES, POSITION_SLOTS, memberMatchesMinistryFilter } from "@/lib/constants";
import { TeamTemplateConfig, getRequiredGenderForSlot, getTeamTemplateSlotConfigs, isTeamSlotVisible } from "@/lib/teamTemplates";
import { useAuth } from "@/hooks/useAuth";

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

export interface AvailableMember {
  id: string;
  full_name: string;
  avatar_url: string | null;
  gender: string | null;
  positions: string[];
  ministry_types: string[];
}

export interface Campus {
  id: string;
  name: string;
}

export interface CampusWorshipPastor {
  id: string;
  full_name: string;
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

// Re-export POSITION_SLOTS for backwards compatibility
export { POSITION_SLOTS } from "@/lib/constants";

// Fetch all campuses for admin dropdown
export function useAllCampuses() {
  return useQuery({
    queryKey: ["all-campuses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campuses")
        .select("id, name")
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

      const { data, error } = await supabase
        .from("user_roles")
        .select("admin_campus_id, role")
        .eq("user_id", user.id);

      if (error) throw error;
      
      // Check if user is org admin
      const isOrgAdmin = data?.some(r => r.role === "admin");
      if (isOrgAdmin) return { isOrgAdmin: true, campusId: null };
      
      // Get campus admin's campus
      const campusAdminRole = data?.find(r => r.role === "campus_admin");
      return { 
        isOrgAdmin: false, 
        campusId: campusAdminRole?.admin_campus_id || null 
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

export function useWorshipTeams() {
  return useQuery({
    queryKey: ["worship-teams"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worship_teams")
        .select("*")
        .order("name");

      if (error) throw error;
      return sortWorshipTeams((data || []) as WorshipTeam[]);
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
        .eq("role", "campus_worship_pastor");

      if (roleError) throw roleError;

      const pastorUserIds = [...new Set((roleRows || []).map((row) => row.user_id).filter(Boolean))];
      if (pastorUserIds.length === 0) return [];

      const { data: campusRows, error: campusError } = await supabase
        .from("user_campuses")
        .select("user_id")
        .eq("campus_id", campusId)
        .in("user_id", pastorUserIds);

      if (campusError) throw campusError;

      const campusPastorIds = [...new Set((campusRows || []).map((row) => row.user_id).filter(Boolean))];
      if (campusPastorIds.length === 0) return [];

      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", campusPastorIds);

      if (profilesError) throw profilesError;
      return (profiles || []) as CampusWorshipPastor[];
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

        const activeMinistryAssignments = new Set(
          (ministryAssignments || []).map((assignment) => `${assignment.user_id}:${assignment.ministry_type}`),
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

        // Build a map of user_id -> { ministry_types, positions } for this campus
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
          // Use campus+ministry specific positions from new table
          positions: campusId && memberDataMap[p.id] 
            ? memberDataMap[p.id].positions 
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
      const { data: existing } = await supabase
        .from("team_members")
        .select("id")
        .eq("team_id", teamId)
        .eq("position_slot", positionSlot)
        .eq("rotation_period_id", rotationPeriodId)
        .single();

      if (existing) {
        // Update existing
        const updateData: Record<string, unknown> = {
          user_id: userId,
          member_name: memberName,
          position,
          service_day: serviceDay,
        };
        updateData.ministry_types = normalizedMinistryTypes;
        const { error } = await supabase
          .from("team_members")
          .update(updateData)
          .eq("id", existing.id);

        if (error) throw error;
      } else {
        // Insert new
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
    }: {
      teamId: string;
      positionSlot: string;
      rotationPeriodId: string;
    }) => {
      const { error } = await supabase
        .from("team_members")
        .delete()
        .eq("team_id", teamId)
        .eq("position_slot", positionSlot)
        .eq("rotation_period_id", rotationPeriodId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members-period"] });
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
  camera_1: ["camera_1"],
  camera_2: ["camera_2"],
  camera_3: ["camera_3"],
  camera_4: ["camera_4"],
  camera_5: ["camera_5"],
  camera_6: ["camera_6"],
  chat_host: ["chat_host"],
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
) {
  const blockedTeammates = blockedTeammateIdsByTeam?.get(teamId);
  if (blockedTeammates?.has(member.id)) return false;

  const teamAssignments = assignedSlotsByTeam.get(member.id);
  if (!teamAssignments) return true;

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
  blackoutDatesByUser?: Record<string, string[]>,
  teamScheduledDatesByTeam?: Map<string, Set<string>>,
  preferZeroConflicts = false,
) {
  let bestCandidate: AvailableMember | undefined;
  let bestConflictCount = Number.POSITIVE_INFINITY;

  for (const member of pool) {
    if (!canAssignMemberToTeam(assignedSlotsByTeam, member, team.id, targetSlot, blockedTeammateIdsByTeam)) {
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

function assignCampusPastorsToVocalSlots(
  teams: WorshipTeam[],
  campusPastors: AvailableMember[],
  teamVisibleVocalSlots: Map<string, ReturnType<typeof getTeamTemplateSlotConfigs>["vocalSlots"]>,
  assignMemberToSlot: (member: AvailableMember, team: WorshipTeam, targetSlot: string) => boolean,
) {
  for (const pastor of campusPastors) {
    const pastorGender = normalizeGender(pastor.gender);
    if (!pastorGender) continue;

    for (const team of teams) {
      const teamVocalSlots = teamVisibleVocalSlots.get(team.id) || [];
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
  return ministryType === "weekend" || ministryType === "weekend_team";
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
        "camera_1", "camera_2", "camera_3", "camera_4", "camera_5", "camera_6",
        "chat_host", "director", "graphics", "switcher",
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

      teams.forEach(t => slotFilledPerTeam.set(t.id, new Set()));

      const assignMemberToSlot = (member: AvailableMember, team: WorshipTeam, targetSlot: string) => {
        const slotConfig = POSITION_SLOTS.find((positionSlot) => positionSlot.slot === targetSlot);
        if (!slotConfig) return false;
        if (!isTeamSlotVisible(team.template_config, targetSlot)) return false;
        if (!memberMatchesSlotGender(member, getRequiredGenderForSlot(team.template_config, targetSlot))) return false;

        const filledSlots = slotFilledPerTeam.get(team.id)!;
        if (filledSlots.has(targetSlot)) return false;
        if (exceedsGuitarFamilyLimit(filledSlots, targetSlot)) return false;
        if (!canAssignMemberToTeam(userAssignedSlotsByTeam, member, team.id, targetSlot, blockedTeammateIdsByTeam)) return false;

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
          (team) => visibleSlotsByTeam.get(team.id)?.vocalSlots || [],
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
              const defaultMaleSlot = (visibleSlotsByTeam.get(team.id)?.vocalSlots || []).find(
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
            const defaultMaleSlot = (visibleSlotsByTeam.get(kyleTeam.id)?.vocalSlots || []).find(
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
          pool: AvailableMember[],
        ) => {
          const shuffledPool = [...pool].sort(() => Math.random() - 0.5);

          for (const team of targetTeams) {
            const targetSlots = (visibleSlotsByTeam.get(team.id)?.vocalSlots || [])
              .filter((slot) => slot.vocalGender === targetGender)
              .map((slot) => slot.slot);

            for (const targetSlot of targetSlots) {
              const filledSlots = slotFilledPerTeam.get(team.id)!;
              if (filledSlots.has(targetSlot)) continue;

            const candidate = findBestCandidateForTeam(
              shuffledPool.filter((member) => getMemberAvailableSlots(member.positions).includes(targetSlot)),
              team,
              targetSlot,
              userAssignedSlotsByTeam,
              blockedTeammateIdsByTeam,
              blackoutDatesByUser,
              teamScheduledDatesByTeam,
            );

              if (!candidate) continue;
              assignMemberToSlot(candidate, team, targetSlot);

              const candidateIndex = shuffledPool.indexOf(candidate);
              if (candidateIndex > -1 && !canDoubleUpMaleVocalGuitarist(candidate, targetSlot, new Set())) {
                shuffledPool.splice(candidateIndex, 1);
              }
            }
          }
        };

        assignGenderedVocalists(teams, "male", maleVocalists);
        assignGenderedVocalists(teams, "female", femaleVocalists);
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

        // Find members who can fill this slot
        const getCandidates = (pool: AvailableMember[]) => 
          pool.filter(m => getMemberAvailableSlots(m.positions).includes(targetSlot));

        // Candidates who were on break (must serve this period - no consecutive breaks)
        const mustServeCandidates = getCandidates(wasOffRosterLastPeriod);
        // Candidates who served last period
        const canServeCandidates = getCandidates(servedLastPeriod);

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
              blackoutDatesByUser,
              teamScheduledDatesByTeam,
              true,
            );
          }

          if (!assigned) {
            assigned = findBestCandidateForTeam(
              shuffleMustServe,
              team,
              targetSlot,
              userAssignedSlotsByTeam,
              blockedTeammateIdsByTeam,
              blackoutDatesByUser,
              teamScheduledDatesByTeam,
            );
          }

          if (!assigned) {
            const sortedCanServe = sortByTeamVariety(shuffleCanServe, team);
            assigned = findBestCandidateForTeam(
              sortedCanServe,
              team,
              targetSlot,
              userAssignedSlotsByTeam,
              blockedTeammateIdsByTeam,
              blackoutDatesByUser,
              teamScheduledDatesByTeam,
            );
          }

          if (assigned) {
            assignMemberToSlot(assigned, team, targetSlot);

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
            blackoutDatesByUser,
            teamScheduledDatesByTeam,
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
      templateConfig,
    }: {
      teamId: string;
      templateConfig: TeamTemplateConfig;
    }) => {
      const { error } = await supabase
        .from("worship_teams")
        .update({ template_config: templateConfig })
        .eq("id", teamId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["worship-teams"] });
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
