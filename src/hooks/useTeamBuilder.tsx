import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { POSITION_SLOTS } from "@/lib/constants";

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
  positions: string[];
  ministry_types: string[];
}

export interface Campus {
  id: string;
  name: string;
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

// Helper to get previous period ID
function getPreviousPeriodId(periods: RotationPeriod[], currentPeriodId: string | null): string | null {
  if (!currentPeriodId || periods.length === 0) return null;
  const currentIndex = periods.findIndex(p => p.id === currentPeriodId);
  // Periods are sorted desc by year, so previous is next in array
  return periods[currentIndex + 1]?.id || null;
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
      })) as TeamMemberAssignment[];
    },
  });
}

// Get approved break user IDs from the previous period
export function usePreviousPeriodApprovedBreaks(periods: RotationPeriod[], currentPeriodId: string | null) {
  const previousPeriodId = useMemo(() => {
    return getPreviousPeriodId(periods, currentPeriodId);
  }, [periods, currentPeriodId]);

  return useQuery({
    queryKey: ["break-requests", "approved", previousPeriodId],
    enabled: !!previousPeriodId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("break_requests")
        .select("user_id")
        .eq("rotation_period_id", previousPeriodId)
        .eq("status", "approved");

      if (error) throw error;
      return (data || []).map(r => r.user_id) as string[];
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
      return data as WorshipTeam[];
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
  return useQuery({
    queryKey: ["available-members", campusId, ministryType],
    queryFn: async () => {
      // Use secure RPC that returns profiles for the current user's accessible campuses
      // (avoids relying on direct profiles table reads, which are restricted by consent + campus sharing rules)
      const { data: profiles, error: profilesError } = await supabase.rpc("get_profiles_for_campus");

      if (profilesError) throw profilesError;

      // If we have a campusId, fetch campus-specific ministry+position assignments
      // This determines which members are assigned to serve at this campus with which positions
      let memberDataMap: Record<string, { ministry_types: string[]; positions: string[] }> = {};
      
      if (campusId) {
        // Query the new user_campus_ministry_positions table for positions
        let positionsQuery = supabase
          .from("user_campus_ministry_positions")
          .select("user_id, ministry_type, position")
          .eq("campus_id", campusId);
        
        // Filter by ministry type if provided
        if (ministryType && ministryType !== "all") {
          positionsQuery = positionsQuery.eq("ministry_type", ministryType);
        }
        
        const { data: positionAssignments, error: positionsError } = await positionsQuery;
        
        if (positionsError) throw positionsError;
        
        // Build a map of user_id -> { ministry_types, positions } for this campus
        (positionAssignments || []).forEach((a: any) => {
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

      return (profiles || [])
        .filter((p: any) => !campusId || assignedUserIds.has(p.id))
        .map((p: any) => ({
          id: p.id,
          full_name: p.full_name,
          avatar_url: p.avatar_url || null,
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

// Auto-builder algorithm with ministry filtering, break rotation, and team variety
export function useAutoBuildTeams() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      rotationPeriodId,
      teams,
      members,
      ministryType,
      previousPeriodMembers,
      approvedBreakUserIds,
    }: {
      rotationPeriodId: string;
      teams: WorshipTeam[];
      members: AvailableMember[];
      ministryType: string;
      previousPeriodMembers: TeamMemberAssignment[];
      approvedBreakUserIds: string[];
    }) => {
      // 1. Filter members by ministry type
      const eligibleMembers = ministryType === "all" 
        ? members 
        : members.filter(m => m.ministry_types?.includes(ministryType));

      // 2. Exclude members with approved break requests
      const availablePool = eligibleMembers.filter(
        m => !approvedBreakUserIds.includes(m.id)
      );

      // 3. Build previous period tracking (filter by ministry if applicable)
      const prevPeriodFiltered = ministryType === "all"
        ? previousPeriodMembers
        : previousPeriodMembers.filter(m => m.ministry_types?.includes(ministryType));
      
      const previouslyAssignedIds = new Set(prevPeriodFiltered.map(m => m.user_id).filter(Boolean));
      const previousTeamMap = new Map<string, string>(); // userId -> teamId
      prevPeriodFiltered.forEach(m => {
        if (m.user_id) previousTeamMap.set(m.user_id, m.team_id);
      });

      // 4. Categorize members
      const wasOnBreakLastPeriod = availablePool.filter(m => !previouslyAssignedIds.has(m.id));
      const servedLastPeriod = availablePool.filter(m => previouslyAssignedIds.has(m.id));

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
          .filter(m => m.ministry_types?.includes(ministryType))
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

      // Track assignments per user to prevent duplicate assignments
      const userAssignedToTeam = new Map<string, Set<string>>(); // userId -> set of teamIds
      const slotFilledPerTeam = new Map<string, Set<string>>(); // teamId -> set of slots

      teams.forEach(t => slotFilledPerTeam.set(t.id, new Set()));

      // Priority: Fill harder positions first (drums, bass, keys, then guitars, then vocals)
      const slotPriority = [
        "drums", "bass", "keys",
        "eg_1", "eg_2", "ag_1", "ag_2",
        "vocalist_1", "vocalist_2", "vocalist_3", "vocalist_4",
        // Production
        "foh", "mon", "broadcast", "audio_shadow", "lighting", "propresenter", "producer",
        // Video
        "camera_1", "camera_2", "camera_3", "camera_4", "camera_5", "camera_6",
        "chat_host", "director", "graphics", "switcher",
      ];

      // For each slot in priority order
      for (const targetSlot of slotPriority) {
        const slotConfig = POSITION_SLOTS.find(s => s.slot === targetSlot);
        if (!slotConfig) continue;

        // Find members who can fill this slot
        const getCandidates = (pool: AvailableMember[]) => 
          pool.filter(m => getMemberAvailableSlots(m.positions).includes(targetSlot));

        // Candidates who were on break (must serve this period - no consecutive breaks)
        const mustServeCandidates = getCandidates(wasOnBreakLastPeriod);
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
          const filledSlots = slotFilledPerTeam.get(team.id)!;
          if (filledSlots.has(targetSlot)) continue;

          // Find best candidate
          let assigned: AvailableMember | undefined;

          // First priority: Must serve (was on break last period)
          assigned = shuffleMustServe.find(m => {
            const assignedTeams = userAssignedToTeam.get(m.id) || new Set();
            return !assignedTeams.has(team.id);
          });

          // Second priority: Can serve, prefer different team
          if (!assigned) {
            const sortedCanServe = sortByTeamVariety(shuffleCanServe, team);
            assigned = sortedCanServe.find(m => {
              const assignedTeams = userAssignedToTeam.get(m.id) || new Set();
              return !assignedTeams.has(team.id);
            });
          }

          if (assigned) {
            // Track assignment
            if (!userAssignedToTeam.has(assigned.id)) {
              userAssignedToTeam.set(assigned.id, new Set());
            }
            userAssignedToTeam.get(assigned.id)!.add(team.id);
            filledSlots.add(targetSlot);

            assignments.push({
              team_id: team.id,
              user_id: assigned.id,
              member_name: assigned.full_name,
              position: slotConfig.label,
              position_slot: targetSlot,
              display_order: POSITION_SLOTS.findIndex(s => s.slot === targetSlot) + 1,
              rotation_period_id: rotationPeriodId,
              ministry_types: ministryType === "all" ? ["weekend"] : [ministryType],
            });

            // Remove from pools to avoid double assignment to same slot
            const mustServeIdx = shuffleMustServe.indexOf(assigned);
            if (mustServeIdx > -1) shuffleMustServe.splice(mustServeIdx, 1);
            const canServeIdx = shuffleCanServe.indexOf(assigned);
            if (canServeIdx > -1) shuffleCanServe.splice(canServeIdx, 1);
          }
        }
      }

      if (assignments.length > 0) {
        const { error } = await supabase.from("team_members").insert(assignments);
        if (error) throw error;
      }

      return {
        totalAssignments: assignments.length,
        teamsBuilt: teams.length,
        eligibleMembers: availablePool.length,
        mustServe: wasOnBreakLastPeriod.length,
      };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["team-members-period"] });
      toast({ 
        title: `Auto-built ${result.teamsBuilt} teams`,
        description: `${result.totalAssignments} assignments made from ${result.eligibleMembers} eligible members`,
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
