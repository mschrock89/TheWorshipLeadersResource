import { useState, useMemo } from "react";
import { Wand2, AlertTriangle, Loader2, Users, UserCheck, Coffee, ArrowLeft, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import {
  useAutoBuildTeams,
  WorshipTeam,
  AvailableMember,
  TeamMemberAssignment,
} from "@/hooks/useTeamBuilder";
import { MINISTRY_SLOT_CATEGORIES, MINISTRY_TYPES, POSITION_SLOTS, memberMatchesMinistryFilter } from "@/lib/constants";
import { getRequiredGenderForSlot, getTeamTemplateSlotConfigs, isTeamSlotVisible } from "@/lib/teamTemplates";

interface AutoBuilderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rotationPeriodId: string;
  campusName?: string | null;
  campusWorshipPastorIds?: string[];
  teams: WorshipTeam[];
  members: AvailableMember[];
  ministryType: string;
  previousPeriodMembers: TeamMemberAssignment[];
  breakExcludedUserIds: string[];
  previousApprovedBreakUserIds: string[];
  blackoutDatesByUser: Record<string, string[]>;
  scheduleEntries: Array<{ team_id: string; schedule_date: string }>;
}

// Position mapping from profile positions to slot names
const PROFILE_POSITION_TO_SLOTS: Record<string, string[]> = {
  vocalist: ["vocalist_1", "vocalist_2", "vocalist_3", "vocalist_4"],
  teacher: ["teacher"],
  announcement: ["announcement"],
  annoucement: ["announcement"],
  closing_prayer: ["closing_prayer"],
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
  sound_tech: ["foh"],
  mon: ["mon"],
  broadcast: ["broadcast"],
  audio_shadow: ["audio_shadow"],
  lighting: ["lighting"],
  media: ["propresenter"],
  graphics: ["propresenter"],
  producer: ["producer"],
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
  teamVisibleVocalSlots: Map<string, ReturnType<typeof getTeamTemplateSlotConfigs>>,
  assignMemberToSlot: (member: AvailableMember, team: WorshipTeam, targetSlot: string) => boolean,
) {
  for (const pastor of campusPastors) {
    const pastorGender = normalizeGender(pastor.gender);
    if (!pastorGender) continue;

    for (const team of teams) {
      const teamVocalSlots = teamVisibleVocalSlots.get(team.id)?.vocalSlots || [];
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

interface PreviewAssignment {
  team_id: string;
  team_name: string;
  user_id: string;
  member_name: string;
  avatar_url?: string | null;
  position: string;
  position_slot: string;
  was_on_break: boolean;
  previous_team?: string;
  blackout_conflict_dates?: string[];
}

export function AutoBuilderDialog({
  open,
  onOpenChange,
  rotationPeriodId,
  campusName,
  campusWorshipPastorIds = [],
  teams,
  members,
  ministryType,
  previousPeriodMembers,
  breakExcludedUserIds,
  previousApprovedBreakUserIds,
  blackoutDatesByUser,
  scheduleEntries,
}: AutoBuilderDialogProps) {
  const { user } = useAuth();
  const autoBuild = useAutoBuildTeams();
  const [isBuilding, setIsBuilding] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewAssignment[] | null>(null);

  const ministryLabel = MINISTRY_TYPES.find(m => m.value === ministryType)?.label || ministryType;
  const slotPriority = [
    "drums", "bass", "keys",
    "eg_1", "eg_2", "ag_1", "ag_2",
    "vocalist_1", "vocalist_2", "vocalist_3", "vocalist_4",
    "teacher", "announcement", "closing_prayer",
    "foh", "mon", "broadcast", "audio_shadow", "lighting", "propresenter", "producer",
    "camera_1", "camera_2", "camera_3", "camera_4", "camera_5", "camera_6",
    "chat_host", "director", "graphics", "switcher",
  ];
  const allowedCategories = MINISTRY_SLOT_CATEGORIES[ministryType] || MINISTRY_SLOT_CATEGORIES.all;
  const visibleSlotsByTeam = useMemo(
    () => new Map(teams.map((team) => [team.id, getTeamTemplateSlotConfigs(team.template_config)])),
    [teams],
  );
  const teamScheduledDatesByTeam = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const entry of scheduleEntries) {
      if (!map.has(entry.team_id)) {
        map.set(entry.team_id, new Set());
      }
      map.get(entry.team_id)!.add(entry.schedule_date);
    }
    return map;
  }, [scheduleEntries]);
  const relevantSlots = useMemo(() => {
    return new Set(
      teams.flatMap((team) =>
        slotPriority.filter((slot) => {
          const slotConfig = POSITION_SLOTS.find((positionSlot) => positionSlot.slot === slot);
          if (!slotConfig || !allowedCategories.includes(slotConfig.category)) return false;
          return isTeamSlotVisible(team.template_config, slot);
        }),
      ),
    );
  }, [allowedCategories, teams]);

  // Filter members by ministry
  const eligibleMembers = useMemo(() => {
    const ministryEligibleMembers = ministryType === "all"
      ? members
      : members.filter((member) =>
          memberMatchesMinistryFilter(member.ministry_types, ministryType)
        );

    return ministryEligibleMembers.filter((member) =>
      getMemberAvailableSlots(member.positions).some((slot) => relevantSlots.has(slot))
    );
  }, [members, ministryType, relevantSlots]);

  // Exclude approved breaks
  const availablePool = useMemo(() => {
    return eligibleMembers.filter(m => !breakExcludedUserIds.includes(m.id));
  }, [eligibleMembers, breakExcludedUserIds]);

  // Track previous period assignments
  const prevPeriodFiltered = useMemo(() => {
    if (ministryType === "all") return previousPeriodMembers;
    return previousPeriodMembers.filter((member) =>
      memberMatchesMinistryFilter(member.ministry_types, ministryType)
    );
  }, [previousPeriodMembers, ministryType]);
  const previousTrimesterRosterMembers = useMemo(() => {
    return prevPeriodFiltered.filter((member) =>
      countsAsTrimesterRosterAssignment(member, ministryType),
    );
  }, [prevPeriodFiltered, ministryType]);

  const previousTeamMap = useMemo(() => {
    const map = new Map<string, string>();
    previousTrimesterRosterMembers.forEach(m => {
      if (m.user_id) {
        const team = teams.find(t => t.id === m.team_id);
        if (team) map.set(m.user_id, team.name);
      }
    });
    return map;
  }, [previousTrimesterRosterMembers, teams]);

  const previousRosterUserIds = useMemo(() => {
    return new Set(previousTrimesterRosterMembers.map((member) => member.user_id).filter(Boolean));
  }, [previousTrimesterRosterMembers]);

  const previousApprovedBreakUserIdSet = useMemo(() => {
    return new Set(previousApprovedBreakUserIds);
  }, [previousApprovedBreakUserIds]);

  // Members who must serve were either off the previous roster or on an approved
  // full-trimester break in the previous period.
  const mustServeMembers = useMemo(() => {
    return availablePool.filter(
      (member) =>
        !previousRosterUserIds.has(member.id) ||
        previousApprovedBreakUserIdSet.has(member.id),
    );
  }, [availablePool, previousApprovedBreakUserIdSet, previousRosterUserIds]);

  // Position availability stats
  const positionStats = useMemo(() => {
    const criticalPositions = ["drums", "bass", "keys"];
    const stats: { name: string; required: number; available: number }[] = [];

    criticalPositions.forEach(slot => {
      const slotConfig = POSITION_SLOTS.find(s => s.slot === slot);
      if (!slotConfig) return;

      const available = availablePool.filter(m => 
        getMemberAvailableSlots(m.positions).includes(slot)
      ).length;

      stats.push({
        name: slotConfig.label,
        required: teams.length,
        available,
      });
    });

    return stats.filter(s => s.available < s.required);
  }, [availablePool, teams]);

  // Generate preview without saving
  const handlePreview = () => {
    setIsPreviewing(true);
    
    // Run the same algorithm locally to generate preview
    const preview = generatePreview();
    setPreviewData(preview);
    setIsPreviewing(false);
  };

  const generatePreview = (): PreviewAssignment[] => {
    const assignments: PreviewAssignment[] = [];
    
    const userAssignedSlotsByTeam = new Map<string, Map<string, Set<string>>>();
    const blockedTeammateIdsByTeam = new Map<string, Set<string>>();
    const slotFilledPerTeam = new Map<string, Set<string>>();
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
        team_name: team.name,
        user_id: member.id,
        member_name: member.full_name,
        avatar_url: member.avatar_url,
        position: slotConfig.label,
        position_slot: targetSlot,
        was_on_break: !previousRosterUserIds.has(member.id),
        previous_team: previousTeamMap.get(member.id),
        blackout_conflict_dates: getBlackoutConflictDatesForTeam(
          member,
          team.id,
          blackoutDatesByUser,
          teamScheduledDatesByTeam,
        ),
      });

      return true;
    };

    // Members who were off the previous roster or on an approved full-trimester
    // break last period should be prioritized.
    const wasOffRosterLastPeriod = availablePool.filter(
      (member) =>
        !previousRosterUserIds.has(member.id) ||
        previousApprovedBreakUserIdSet.has(member.id),
    );
    const otherMembers = availablePool.filter(m => previousRosterUserIds.has(m.id));

    const isWeekendWorshipBuild =
      ministryType === "weekend" || ministryType === "weekend_team";
    const isMurfreesboroWeekendBuild =
      campusName === "Murfreesboro Central" && isWeekendWorshipBuild;

    if (isWeekendWorshipBuild && teams.length > 0) {
      const allVocalSlots = teams.flatMap((team) => visibleSlotsByTeam.get(team.id)?.vocalSlots || []);
      const maleVocalists = availablePool.filter((member) =>
        normalizeGender(member.gender) === "male" &&
        getMemberAvailableSlots(member.positions).some((slot) =>
          allVocalSlots.some((visibleSlot) => visibleSlot.slot === slot),
        )
      );
      const femaleVocalists = availablePool.filter((member) =>
        normalizeGender(member.gender) === "female" &&
        getMemberAvailableSlots(member.positions).some((slot) =>
          allVocalSlots.some((visibleSlot) => visibleSlot.slot === slot),
        )
      );
      const campusPastors = availablePool.filter((member) => campusWorshipPastorIds.includes(member.id));
      assignCampusPastorsToVocalSlots(teams, campusPastors, visibleSlotsByTeam, assignMemberToSlot);

      const currentUserMember = availablePool.find((member) => member.id === user?.id);
      const kyleMember = availablePool.find((member) => member.full_name === "Kyle Elkins");
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
            if (candidateIndex > -1) {
              shuffledPool.splice(candidateIndex, 1);
            }
          }
        }
      };

      assignGenderedVocalists(teams, "male", maleVocalists);
      assignGenderedVocalists(teams, "female", femaleVocalists);
    }

    for (const targetSlot of slotPriority) {
      if (
        isMurfreesboroWeekendBuild &&
        targetSlot === "ag_2"
      ) {
        continue;
      }

      const slotConfig = POSITION_SLOTS.find(s => s.slot === targetSlot);
      if (!slotConfig) continue;

      const getCandidates = (pool: AvailableMember[]) => 
        pool.filter(m => getMemberAvailableSlots(m.positions).includes(targetSlot));

      const shuffleMustServe = [...getCandidates(wasOffRosterLastPeriod)].sort(() => Math.random() - 0.5);
      const shuffleCanServe = [...getCandidates(otherMembers)].sort(() => Math.random() - 0.5);

      const sortByTeamVariety = (pool: AvailableMember[], team: WorshipTeam) => {
        return [...pool].sort((a, b) => {
          const aPrevTeam = previousTeamMap.get(a.id);
          const bPrevTeam = previousTeamMap.get(b.id);
          const aWasOnSameTeam = aPrevTeam === team.name ? 1 : 0;
          const bWasOnSameTeam = bPrevTeam === team.name ? 1 : 0;
          return aWasOnSameTeam - bWasOnSameTeam;
        });
      };

      for (const team of teams) {
        if (!isTeamSlotVisible(team.template_config, targetSlot)) continue;
        const filledSlots = slotFilledPerTeam.get(team.id)!;
        if (filledSlots.has(targetSlot)) continue;

        let assigned: AvailableMember | undefined;

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
          ...otherMembers,
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

    return assignments;
  };

  const handleConfirm = async () => {
    setIsBuilding(true);
    try {
      await autoBuild.mutateAsync({
        rotationPeriodId,
        campusName,
        campusWorshipPastorIds,
        teams,
        members,
        ministryType,
        previousPeriodMembers,
        breakExcludedUserIds,
        previousApprovedBreakUserIds,
        blackoutDatesByUser,
        scheduleEntries,
      });
      setPreviewData(null);
      onOpenChange(false);
    } finally {
      setIsBuilding(false);
    }
  };

  const handleBack = () => {
    setPreviewData(null);
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      setPreviewData(null);
    }
    onOpenChange(open);
  };

  // Group preview by team
  const previewByTeam = useMemo(() => {
    if (!previewData) return null;
    const grouped = new Map<string, PreviewAssignment[]>();
    teams.forEach(t => grouped.set(t.id, []));
    previewData.forEach(a => {
      const teamAssignments = grouped.get(a.team_id) || [];
      teamAssignments.push(a);
      grouped.set(a.team_id, teamAssignments);
    });
    return grouped;
  }, [previewData, teams]);

  // Members who will be on break (not assigned in preview)
  const onBreakPreview = useMemo(() => {
    if (!previewData) return [];
    const assignedIds = new Set(previewData.map(a => a.user_id));
    return availablePool.filter(m => !assignedIds.has(m.id));
  }, [previewData, availablePool]);

  const blackoutConflictPreview = useMemo(() => {
    return (previewData || []).filter((assignment) => (assignment.blackout_conflict_dates?.length || 0) > 0);
  }, [previewData]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg h-[85vh] max-h-[85vh] overflow-hidden grid grid-rows-[auto_minmax(0,1fr)_auto]">
        <DialogHeader className="min-h-0">
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-primary" />
            {previewData ? "Preview Build" : `Auto-Build ${ministryType !== "all" ? ministryLabel : ""} Teams`}
          </DialogTitle>
          <DialogDescription>
            {previewData 
              ? `Review ${previewData.length} proposed assignments across ${teams.length} teams`
              : `Automatically distribute members across ${teams.length} teams`
            }
          </DialogDescription>
        </DialogHeader>

        {!previewData ? (
          // Initial view
          <div className="min-h-0 space-y-4 overflow-y-auto py-4 pr-2">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-muted p-3 text-center">
                <Users className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                <p className="text-lg font-semibold">{availablePool.length}</p>
                <p className="text-xs text-muted-foreground">Available</p>
              </div>
              <div className="rounded-lg bg-muted p-3 text-center">
                <UserCheck className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                <p className="text-lg font-semibold">{mustServeMembers.length}</p>
                <p className="text-xs text-muted-foreground">Must Serve</p>
              </div>
              <div className="rounded-lg bg-muted p-3 text-center">
                <Coffee className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                <p className="text-lg font-semibold">{breakExcludedUserIds.length}</p>
                <p className="text-xs text-muted-foreground">On Break</p>
              </div>
            </div>

            <div className="rounded-lg bg-muted p-4 space-y-2">
              <p className="text-sm font-medium">Algorithm will:</p>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>Fill hardest positions first (drums, bass, keys)</li>
                <li>Prioritize members who were off the previous trimester roster</li>
                <li>Rotate members to different teams for variety</li>
                <li>Filter by {ministryType === "all" ? "all ministries" : ministryLabel}</li>
              </ul>
            </div>

            {positionStats.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Low availability:{" "}
                  {positionStats.map(p => `${p.name} (${p.available}/${p.required})`).join(", ")}
                </AlertDescription>
              </Alert>
            )}

            {mustServeMembers.length > 0 && (
              <div className="rounded-lg border border-border p-3 space-y-2">
                <p className="text-sm font-medium flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-primary" />
                  Must serve this period (off previous roster or on approved break last period):
                </p>
                <div className="flex flex-wrap gap-1">
                  {mustServeMembers.slice(0, 8).map(m => (
                    <Badge key={m.id} variant="secondary" className="text-xs">
                      {m.full_name.split(' ')[0]}
                    </Badge>
                  ))}
                  {mustServeMembers.length > 8 && (
                    <Badge variant="outline" className="text-xs">
                      +{mustServeMembers.length - 8} more
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          // Preview view
          <div className="min-h-0 overflow-hidden">
            <ScrollArea className="h-full -mx-6 px-6">
              <div className="space-y-4 py-2">
              {blackoutConflictPreview.length > 0 && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    {blackoutConflictPreview.length} assignment{blackoutConflictPreview.length === 1 ? "" : "s"} still conflict with blackout dates. Review these before confirming.
                  </AlertDescription>
                </Alert>
              )}
              {teams.map(team => {
                const teamAssignments = previewByTeam?.get(team.id) || [];
                return (
                  <div key={team.id} className="rounded-lg border border-border overflow-hidden">
                    <div 
                      className="px-3 py-2 font-medium text-sm flex items-center justify-between"
                      style={{ backgroundColor: `${team.color}20` }}
                    >
                      <span>{team.name}</span>
                      <Badge variant="secondary" className="text-xs">
                        {teamAssignments.length} members
                      </Badge>
                    </div>
                    <div className="divide-y divide-border">
                      {teamAssignments.length === 0 ? (
                        <p className="px-3 py-2 text-sm text-muted-foreground italic">
                          No assignments
                        </p>
                      ) : (
                        teamAssignments.map((a, idx) => (
                          <div key={idx} className="px-3 py-2 flex items-center gap-2">
                            <Avatar className="h-6 w-6">
                              <AvatarImage src={a.avatar_url || undefined} />
                              <AvatarFallback className="text-xs">
                                {a.member_name.split(' ').map(n => n[0]).join('')}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{a.member_name}</p>
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs text-muted-foreground">{a.position}</span>
                                {a.was_on_break && (
                                  <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 bg-green-500/10 text-green-600 border-green-200">
                                    off previous roster
                                  </Badge>
                                )}
                                {a.previous_team && a.previous_team !== a.team_name && (
                                  <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 bg-blue-500/10 text-blue-600 border-blue-200">
                                    from {a.previous_team}
                                  </Badge>
                                )}
                                {(a.blackout_conflict_dates?.length || 0) > 0 && (
                                  <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 bg-orange-500/10 text-orange-700 border-orange-200">
                                    {a.blackout_conflict_dates?.length} blackout conflict{a.blackout_conflict_dates?.length === 1 ? "" : "s"}
                                  </Badge>
                                )}
                              </div>
                              {(a.blackout_conflict_dates?.length || 0) > 0 && (
                                <p className="text-[11px] text-orange-700 dark:text-orange-300 mt-1">
                                  Conflicts: {a.blackout_conflict_dates?.join(", ")}
                                </p>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}

              {onBreakPreview.length > 0 && (
                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="px-3 py-2 font-medium text-sm flex items-center justify-between bg-muted">
                    <span className="flex items-center gap-2">
                      <Coffee className="h-4 w-4" />
                      Will Be On Break
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      {onBreakPreview.length}
                    </Badge>
                  </div>
                  <div className="px-3 py-2 flex flex-wrap gap-1">
                    {onBreakPreview.map(m => (
                      <Badge key={m.id} variant="outline" className="text-xs">
                        {m.full_name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              </div>
            </ScrollArea>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {previewData ? (
            <>
              <Button variant="outline" onClick={handleBack} disabled={isBuilding}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button onClick={handleConfirm} disabled={isBuilding}>
                {isBuilding ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Building...
                  </>
                ) : (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Confirm & Build
                  </>
                )}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handlePreview} disabled={isPreviewing || availablePool.length === 0}>
                {isPreviewing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Wand2 className="mr-2 h-4 w-4" />
                    Preview Build
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
