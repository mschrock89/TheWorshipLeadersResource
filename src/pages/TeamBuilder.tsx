import { useState, useMemo, useEffect } from "react";
import { Wand2, Trash2, Copy, Loader2, Settings, Save, SearchCheck, AlertTriangle, BellRing } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TeamCard } from "@/components/team-builder/TeamCard";
import { TeamBuilderHeader } from "@/components/team-builder/TeamBuilderHeader";
import { MyTeamView } from "@/components/team-builder/MyTeamView";
import { OnBreakList } from "@/components/team-builder/OnBreakList";
import { AutoBuilderDialog } from "@/components/team-builder/AutoBuilderDialog";
import { AssignMemberDialog } from "@/components/team-builder/AssignMemberDialog";
import { MinistryEditDialog } from "@/components/team-builder/MinistryEditDialog";
import { BreakRequestsWidget } from "@/components/team-builder/BreakRequestsWidget";
import { TeamScheduleWidget } from "@/components/team-builder/TeamScheduleWidget";
import { TeamTemplateDialog } from "@/components/team-builder/TeamTemplateDialog";
import { RefreshableContainer } from "@/components/layout/RefreshableContainer";
import {
  useRotationPeriodsForCampus,
  useWorshipTeams,
  useTeamMembersForPeriod,
  useAvailableMembers,
  useHistoricalTeamMemberIds,
  useAssignMember,
  useAssignMemberDateOverride,
  useRemoveMember,
  useRemoveMemberDateOverride,
  useClearPeriod,
  useCopyFromPreviousPeriod,
  useAllCampuses,
  useAdminCampusId,
  useTeamLocksForPeriod,
  useToggleTeamLock,
  useUpdateMinistryTypes,
  useUpdateTeamTemplate,
  usePreviousPeriodMembers,
  useTeamMemberDateOverrides,
  getPreviousPeriodId,
  useCampusWorshipPastors,
  useMultiTeamAssignableMembers,
  useSaveRotationDraft,
  usePublishRotation,
  useRotationDraftSummary,
  useCrossCheckRotationAssignments,
  AvailableMember,
  RotationPublishNotification,
  TeamMemberAssignment,
  WorshipTeam,
  RotationConflict,
} from "@/hooks/useTeamBuilder";
import { useBreakRequestsForPeriod } from "@/hooks/useBreakRequests";
import { useTeamScheduleForCampus } from "@/hooks/useTeamScheduleEditor";
import { useAuth } from "@/hooks/useAuth";
import { useProfilesWithCampuses, useUserCampuses } from "@/hooks/useCampuses";
import { useUserRoles } from "@/hooks/useUserRoles";
import {
  POSITION_SLOTS,
  isTeamVisibleForMinistry,
  resolveTeamBuilderSlotMinistryType,
  breakRequestMatchesMinistryFilter,
  memberMatchesMinistryFilter,
} from "@/lib/constants";
import { getRequiredGenderForSlot, TeamTemplateConfig } from "@/lib/teamTemplates";
import { formatPositionLabel, getWeekendKey, isWeekend } from "@/lib/utils";

const MANAGED_SIT_REASON_PREFIX = "Sat from Team Builder";

const GUITAR_POSITION_SLOTS = new Set(["ag_1", "ag_2", "eg_1", "eg_2"]);

function isVocalAndGuitarPair(existingSlot?: string | null, targetSlot?: string | null) {
  if (!existingSlot || !targetSlot) return false;

  const existingCategory = POSITION_SLOTS.find((slot) => slot.slot === existingSlot)?.category;
  const targetCategory = POSITION_SLOTS.find((slot) => slot.slot === targetSlot)?.category;

  const existingIsVocal = existingCategory === "Vocalists";
  const targetIsVocal = targetCategory === "Vocalists";
  const existingIsGuitar = GUITAR_POSITION_SLOTS.has(existingSlot);
  const targetIsGuitar = GUITAR_POSITION_SLOTS.has(targetSlot);

  return (existingIsVocal && targetIsGuitar) || (existingIsGuitar && targetIsVocal);
}

function formatPreviewDate(date: string) {
  try {
    return format(parseISO(date), "MMM d");
  } catch {
    return date;
  }
}

function shouldCollapseWeekendIntoSingleBucket(ministryType: string) {
  return ministryType !== "video";
}

export default function TeamBuilder() {
  const { user, isLoading: authLoading, isVideoDirector, isProductionManager, isAdmin } = useAuth();
  const { data: currentUserRoles = [] } = useUserRoles(user?.id);

  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const [selectedCampusId, setSelectedCampusId] = useState<string | null>(null);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [selectedMinistryType, setSelectedMinistryType] = useState<string>("weekend");
  const [showAutoBuilder, setShowAutoBuilder] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [assigningSlot, setAssigningSlot] = useState<{
    teamId: string;
    teamName: string;
    slot: string;
    requiredGender: "male" | "female" | null;
    scheduleDate?: string;
    serviceDay?: "saturday" | "sunday" | null;
  } | null>(null);
  const [editingMinistry, setEditingMinistry] = useState<TeamMemberAssignment | null>(null);
  const [editingTemplateTeam, setEditingTemplateTeam] = useState<WorshipTeam | null>(null);
  const [crossCheckDialogOpen, setCrossCheckDialogOpen] = useState(false);
  const [crossCheckResults, setCrossCheckResults] = useState<RotationConflict[]>([]);
  const [rotationPushPreviewOpen, setRotationPushPreviewOpen] = useState(false);
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const assigningMinistryType = resolveTeamBuilderSlotMinistryType(
    selectedMinistryType,
    assigningSlot?.slot,
  );
  const { data: campuses = [], isLoading: campusesLoading } = useAllCampuses();
  const { data: adminCampusInfo, isLoading: adminCampusLoading } = useAdminCampusId();
  const { data: periods = [], isLoading: periodsLoading } = useRotationPeriodsForCampus(selectedCampusId);
  const { data: teams = [], isLoading: teamsLoading } = useWorshipTeams(selectedCampusId);
  const { data: members = [], isLoading: membersLoading } = useTeamMembersForPeriod(selectedPeriodId);
  const { data: dateOverrides = [] } = useTeamMemberDateOverrides(selectedPeriodId);
  const { data: availableMembers = [] } = useAvailableMembers(
    selectedCampusId,
    null,
  );
  const { data: historicalMemberIds } = useHistoricalTeamMemberIds();
  const { data: teamLocks = [] } = useTeamLocksForPeriod(selectedPeriodId);
  const { data: previousPeriodMembers = [] } = usePreviousPeriodMembers(periods, selectedPeriodId);
  const { data: campusWorshipPastors = [] } = useCampusWorshipPastors(selectedCampusId);
  const { data: multiTeamAssignableMembers = [] } = useMultiTeamAssignableMembers(selectedCampusId);
  const { data: breakRequests = [] } = useBreakRequestsForPeriod(selectedPeriodId);
  const selectedPeriod = periods.find(p => p.id === selectedPeriodId);
  const selectedCampus = campuses.find(c => c.id === selectedCampusId);
  const { data: scheduleEntries = [] } = useTeamScheduleForCampus(
    selectedCampusId,
    selectedPeriod?.name || null,
    selectedMinistryType,
  );
  const { data: userCampusMap } = useProfilesWithCampuses();
  const { data: currentUserCampuses = [] } = useUserCampuses(user?.id);
  const previousPeriodId = useMemo(() => {
    return getPreviousPeriodId(periods, selectedPeriodId);
  }, [periods, selectedPeriodId]);
  const { data: previousBreakRequests = [] } = useBreakRequestsForPeriod(previousPeriodId);

  const assignMember = useAssignMember();
  const assignMemberDateOverride = useAssignMemberDateOverride();
  const removeMember = useRemoveMember();
  const removeMemberDateOverride = useRemoveMemberDateOverride();
  const clearPeriod = useClearPeriod();
  const copyFromPrevious = useCopyFromPreviousPeriod();
  const toggleLock = useToggleTeamLock();
  const updateMinistryTypes = useUpdateMinistryTypes();
  const updateTeamTemplate = useUpdateTeamTemplate();
  const saveRotationDraft = useSaveRotationDraft();
  const publishRotation = usePublishRotation();
  const crossCheckRotationAssignments = useCrossCheckRotationAssignments();
  const { data: rotationDraftSummary } = useRotationDraftSummary(
    selectedPeriodId,
    selectedCampusId,
    selectedMinistryType,
  );

  // Determine if user can edit the selected campus
  const canEditCampus = useMemo(() => {
    if (!adminCampusInfo) return false;
    if (adminCampusInfo.isOrgAdmin) return true;
    if (adminCampusInfo.campusIds.length > 0) {
      return adminCampusInfo.campusIds.includes(selectedCampusId ?? "");
    }
    if (currentUserRoles.some(({ role }) => role === "campus_admin")) {
      return currentUserCampuses.some((campus) => campus.campus_id === selectedCampusId);
    }
    return adminCampusInfo.campusId === selectedCampusId;
  }, [adminCampusInfo, currentUserCampuses, currentUserRoles, selectedCampusId]);

  const hasWorshipPastorTeamBuilderAccess = useMemo(
    () =>
      currentUserRoles.some(({ role }) =>
        role === "campus_worship_pastor" || role === "student_worship_pastor",
      ),
    [currentUserRoles],
  );

  const hasFullTeamBuilderAccess =
    canEditCampus && (isVideoDirector || isAdmin || hasWorshipPastorTeamBuilderAccess);

  const isAdminUser = adminCampusInfo?.isOrgAdmin || !!adminCampusInfo?.campusId;

  // Auto-select campus on load
  useEffect(() => {
    if (campuses.length > 0 && !selectedCampusId && adminCampusInfo) {
      if (adminCampusInfo.isOrgAdmin) {
        const murfCentral = campuses.find(c => c.name === "Murfreesboro Central");
        setSelectedCampusId(murfCentral?.id || campuses[0].id);
      } else if (adminCampusInfo.campusId) {
        setSelectedCampusId(adminCampusInfo.campusId);
      } else {
        setSelectedCampusId(campuses[0].id);
      }
    }
  }, [campuses, adminCampusInfo, selectedCampusId]);

  // Auto-select active period when campus changes
  useEffect(() => {
    if (periods.length > 0) {
      const active = periods.find(p => p.is_active);
      setSelectedPeriodId(active?.id || periods[0].id);
    } else {
      setSelectedPeriodId(null);
    }
  }, [periods]);

  // Normalize legacy weekend aliases to the Weekend Worship value used by Team Builder.
  useEffect(() => {
    if (selectedMinistryType === "weekend_team") {
      setSelectedMinistryType("weekend");
    }
  }, [selectedMinistryType]);

  const previousApprovedBreakUserIds = useMemo(() => {
    const matchingBreaks = previousBreakRequests.filter(
      (request) =>
        request.status === "approved" &&
        request.request_scope === "full_trimester" &&
        breakRequestMatchesMinistryFilter(request.ministry_type, selectedMinistryType),
    );

    return [...new Set(matchingBreaks.map((request) => request.user_id))];
  }, [previousBreakRequests, selectedMinistryType]);

  const requestedBreakUserIds = useMemo(() => {
    const matchingBreaks = breakRequests.filter(
      (request) =>
        request.status !== "denied" &&
        request.request_scope === "full_trimester" &&
        !request.reason?.startsWith(MANAGED_SIT_REASON_PREFIX) &&
        breakRequestMatchesMinistryFilter(request.ministry_type, selectedMinistryType),
    );

    return [...new Set(matchingBreaks.map((request) => request.user_id))];
  }, [breakRequests, selectedMinistryType]);

  const satUserIds = useMemo(() => {
    const matchingBreaks = breakRequests.filter(
      (request) =>
        request.status !== "denied" &&
        request.request_scope === "full_trimester" &&
        request.reason?.startsWith(MANAGED_SIT_REASON_PREFIX) &&
        breakRequestMatchesMinistryFilter(request.ministry_type, selectedMinistryType),
    );

    return [...new Set(matchingBreaks.map((request) => request.user_id))];
  }, [breakRequests, selectedMinistryType]);

  const autoBuildExcludedUserIds = useMemo(() => {
    return [...new Set([...requestedBreakUserIds, ...satUserIds])];
  }, [requestedBreakUserIds, satUserIds]);

  const satRequestIdsByUser = useMemo(() => {
    const matchingBreaks = breakRequests.filter(
      (request) =>
        request.status !== "denied" &&
        request.request_scope === "full_trimester" &&
        request.reason?.startsWith(MANAGED_SIT_REASON_PREFIX) &&
        breakRequestMatchesMinistryFilter(request.ministry_type, selectedMinistryType),
    );

    return matchingBreaks.reduce<Record<string, string>>((acc, request) => {
      acc[request.user_id] = request.id;
      return acc;
    }, {});
  }, [breakRequests, selectedMinistryType]);

  const blackoutDateUserIds = useMemo(() => {
    const matchingBreaks = breakRequests.filter(
      (request) =>
        request.status !== "denied" &&
        request.request_scope === "blackout_dates",
    );

    return [...new Set(matchingBreaks.map((request) => request.user_id))];
  }, [breakRequests]);

  const blackoutDatesByUser = useMemo(() => {
    const entries = breakRequests.filter(
      (request) =>
        request.status !== "denied" &&
        request.request_scope === "blackout_dates",
    );

    return entries.reduce<Record<string, string[]>>((acc, request) => {
      const existing = new Set(acc[request.user_id] || []);
      (request.blackout_dates || []).forEach((date) => existing.add(date));
      acc[request.user_id] = Array.from(existing);
      return acc;
    }, {});
  }, [breakRequests]);

  const selectedPeriodBreakUserIds = useMemo(() => {
    const matchingBreaks = breakRequests.filter(
      (request) =>
        request.status !== "denied" &&
        request.request_scope === "full_trimester" &&
        breakRequestMatchesMinistryFilter(request.ministry_type, selectedMinistryType),
    );

    return [...new Set(matchingBreaks.map((request) => request.user_id))];
  }, [breakRequests, selectedMinistryType]);

  // Filter teams by selected ministry type
  const filteredTeams = useMemo(() => {
    return teams.filter((team) => isTeamVisibleForMinistry(team.name, selectedMinistryType));
  }, [teams, selectedMinistryType]);

  const teamById = useMemo(() => {
    return teams.reduce<Record<string, WorshipTeam>>((acc, team) => {
      acc[team.id] = team;
      return acc;
    }, {});
  }, [teams]);

  const visibleAssignments = useMemo(() => {
    if (selectedMinistryType === "all") {
      return members;
    }

    return members.filter((member) =>
      memberMatchesMinistryFilter(member.ministry_types, selectedMinistryType)
    );
  }, [members, selectedMinistryType]);

  const blackoutConflictDatesByTeamSlot = useMemo(() => {
    const teamScheduleDates = scheduleEntries.reduce<Map<string, Set<string>>>((acc, entry) => {
      if (!acc.has(entry.team_id)) {
        acc.set(entry.team_id, new Set());
      }
      acc.get(entry.team_id)!.add(entry.schedule_date);
      return acc;
    }, new Map());

    const overriddenScheduleDatesByTeamSlot = dateOverrides.reduce<Map<string, Set<string>>>((acc, override) => {
      const key = `${override.team_id}:${override.position_slot}`;
      if (!acc.has(key)) {
        acc.set(key, new Set());
      }
      acc.get(key)!.add(override.schedule_date);
      return acc;
    }, new Map());

    return visibleAssignments.reduce<Record<string, Record<string, string[]>>>((acc, member) => {
      if (!member.user_id) return acc;

      const memberBlackoutDates = new Set(blackoutDatesByUser[member.user_id] || []);
      const scheduledDates = teamScheduleDates.get(member.team_id) || new Set<string>();
      const overriddenDates =
        overriddenScheduleDatesByTeamSlot.get(`${member.team_id}:${member.position_slot}`) || new Set<string>();
      const conflictDates = [...scheduledDates]
        .filter(
          (scheduleDate) =>
            memberBlackoutDates.has(scheduleDate) &&
            !overriddenDates.has(scheduleDate) &&
            (!member.service_day ||
              member.service_day === "both" ||
              member.service_day === "weekend" ||
              (member.service_day === "saturday" && new Date(`${scheduleDate}T00:00:00`).getDay() === 6) ||
              (member.service_day === "sunday" && new Date(`${scheduleDate}T00:00:00`).getDay() === 0)),
        )
        .sort();

      if (conflictDates.length === 0) return acc;

      if (!acc[member.team_id]) {
        acc[member.team_id] = {};
      }

      acc[member.team_id][member.position_slot] = conflictDates;
      return acc;
    }, {});
  }, [visibleAssignments, blackoutDatesByUser, scheduleEntries, dateOverrides]);

  const teamScheduleBuckets = useMemo(() => {
    return scheduleEntries.reduce<Record<string, Array<{ key: string; dates: string[] }>>>((acc, entry) => {
      const bucketKey =
        shouldCollapseWeekendIntoSingleBucket(selectedMinistryType) && isWeekend(entry.schedule_date)
          ? getWeekendKey(entry.schedule_date)
          : entry.schedule_date;

      if (!acc[entry.team_id]) {
        acc[entry.team_id] = [];
      }

      const existingBucket = acc[entry.team_id].find((bucket) => bucket.key === bucketKey);
      if (existingBucket) {
        if (!existingBucket.dates.includes(entry.schedule_date)) {
          existingBucket.dates.push(entry.schedule_date);
          existingBucket.dates.sort();
        }
      } else {
        acc[entry.team_id].push({
          key: bucketKey,
          dates: [entry.schedule_date],
        });
        acc[entry.team_id].sort((a, b) => a.key.localeCompare(b.key));
      }

      return acc;
    }, {});
  }, [scheduleEntries, selectedMinistryType]);

  const dateOverridesByTeamSlot = useMemo(() => {
    return dateOverrides.reduce<Record<string, Record<string, Record<string, TeamMemberAssignment>>>>((acc, override) => {
      const scheduleBucketKey = isWeekend(override.schedule_date) &&
        shouldCollapseWeekendIntoSingleBucket(selectedMinistryType)
          ? getWeekendKey(override.schedule_date)
          : override.schedule_date;

      if (!acc[override.team_id]) {
        acc[override.team_id] = {};
      }

      if (!acc[override.team_id][override.position_slot]) {
        acc[override.team_id][override.position_slot] = {};
      }

      if (!acc[override.team_id][override.position_slot][scheduleBucketKey]) {
        acc[override.team_id][override.position_slot][scheduleBucketKey] = {
          id: override.id,
          team_id: override.team_id,
          user_id: override.user_id,
          member_name: override.member_name,
          position: override.position,
          position_slot: override.position_slot,
          display_order: 0,
          rotation_period_id: override.rotation_period_id,
          ministry_types: override.ministry_types,
          service_day: null,
        };
      }

      return acc;
    }, {});
  }, [dateOverrides, selectedMinistryType]);

  const blackoutConflictDatesByTeamSlotDateOverride = useMemo(() => {
    return dateOverrides.reduce<Record<string, Record<string, Record<string, string[]>>>>((acc, override) => {
      if (!override.user_id) return acc;

      const scheduleBucketKey = isWeekend(override.schedule_date) &&
        shouldCollapseWeekendIntoSingleBucket(selectedMinistryType)
          ? getWeekendKey(override.schedule_date)
          : override.schedule_date;

      const conflictDates = (blackoutDatesByUser[override.user_id] || [])
        .filter((date) => date === override.schedule_date)
        .sort();

      if (conflictDates.length === 0) return acc;

      if (!acc[override.team_id]) {
        acc[override.team_id] = {};
      }

      if (!acc[override.team_id][override.position_slot]) {
        acc[override.team_id][override.position_slot] = {};
      }

      const existing = new Set(acc[override.team_id][override.position_slot][scheduleBucketKey] || []);
      conflictDates.forEach((date) => existing.add(date));
      acc[override.team_id][override.position_slot][scheduleBucketKey] = Array.from(existing).sort();
      return acc;
    }, {});
  }, [dateOverrides, blackoutDatesByUser, selectedMinistryType]);

  const combinedConflictDatesByTeamSlot = useMemo(() => {
    const combined: Record<string, Record<string, string[]>> = {};

    Object.entries(blackoutConflictDatesByTeamSlot).forEach(([teamId, bySlot]) => {
      combined[teamId] = combined[teamId] || {};
      Object.entries(bySlot).forEach(([slot, dates]) => {
        combined[teamId][slot] = [...dates];
      });
    });

    Object.entries(blackoutConflictDatesByTeamSlotDateOverride).forEach(([teamId, bySlot]) => {
      combined[teamId] = combined[teamId] || {};
      Object.entries(bySlot).forEach(([slot, byDate]) => {
        const existing = new Set(combined[teamId][slot] || []);
        Object.values(byDate).flat().forEach((date) => existing.add(date));
        combined[teamId][slot] = Array.from(existing).sort();
      });
    });

    return combined;
  }, [blackoutConflictDatesByTeamSlot, blackoutConflictDatesByTeamSlotDateOverride]);

  const scheduleDatesByTeam = useMemo(() => {
    return Object.entries(teamScheduleBuckets).reduce<Record<string, string[]>>((acc, [teamId, buckets]) => {
      acc[teamId] = buckets.map((bucket) => bucket.key);
      return acc;
    }, {});
  }, [teamScheduleBuckets]);

  const effectiveTeamSnapshotByBucket = useMemo(() => {
    const snapshots: Record<string, Record<string, Record<string, string>>> = {};

    filteredTeams.forEach((team) => {
      const teamMembers = members.filter((member) => member.team_id === team.id);
      const bucketKeys = scheduleDatesByTeam[team.id] || [];

      snapshots[team.id] = {};
      bucketKeys.forEach((bucketKey) => {
        const slotMap: Record<string, string> = {};

        teamMembers.forEach((member) => {
          if (!member.position_slot) return;
          const override = dateOverridesByTeamSlot[team.id]?.[member.position_slot]?.[bucketKey];
          slotMap[member.position_slot] = override?.member_name || member.member_name;
        });

        Object.entries(dateOverridesByTeamSlot[team.id] || {}).forEach(([slot, overridesByBucket]) => {
          if (slotMap[slot]) return;
          const override = overridesByBucket[bucketKey];
          if (override) {
            slotMap[slot] = override.member_name;
          }
        });

        snapshots[team.id][bucketKey] = slotMap;
      });
    });

    return snapshots;
  }, [dateOverridesByTeamSlot, filteredTeams, members, scheduleDatesByTeam]);

  const rotationPushPreviewRecipients = useMemo(() => {
    const recipientMap = new Map<
      string,
      {
        userId: string;
        memberName: string;
        teams: Map<
          string,
          {
            teamId: string;
            teamName: string;
            teamColor: string;
            bucketKeys: Set<string>;
          }
        >;
      }
    >();

    visibleAssignments.forEach((assignment) => {
      if (!assignment.user_id || !assignment.position_slot) return;

      const team = teamById[assignment.team_id];
      if (!team) return;

      const overriddenBuckets = new Set(
        Object.keys(dateOverridesByTeamSlot[assignment.team_id]?.[assignment.position_slot] || {}),
      );
      const bucketKeys = (scheduleDatesByTeam[assignment.team_id] || []).filter(
        (bucketKey) => !overriddenBuckets.has(bucketKey),
      );

      if (bucketKeys.length === 0) return;

      const recipient = recipientMap.get(assignment.user_id) || {
        userId: assignment.user_id,
        memberName: assignment.member_name,
        teams: new Map(),
      };

      const teamEntry = recipient.teams.get(assignment.team_id) || {
        teamId: assignment.team_id,
        teamName: team.name,
        teamColor: team.color,
        bucketKeys: new Set<string>(),
      };

      bucketKeys.forEach((bucketKey) => teamEntry.bucketKeys.add(bucketKey));
      recipient.teams.set(assignment.team_id, teamEntry);
      recipientMap.set(assignment.user_id, recipient);
    });

    dateOverrides.forEach((override) => {
      if (!override.user_id) return;

      const team = teamById[override.team_id];
      if (!team) return;

      const bucketKey = isWeekend(override.schedule_date) &&
        shouldCollapseWeekendIntoSingleBucket(selectedMinistryType)
          ? getWeekendKey(override.schedule_date)
          : override.schedule_date;
      const recipient = recipientMap.get(override.user_id) || {
        userId: override.user_id,
        memberName: override.member_name,
        teams: new Map(),
      };

      const teamEntry = recipient.teams.get(override.team_id) || {
        teamId: override.team_id,
        teamName: team.name,
        teamColor: team.color,
        bucketKeys: new Set<string>(),
      };

      teamEntry.bucketKeys.add(bucketKey);
      recipient.teams.set(override.team_id, teamEntry);
      recipientMap.set(override.user_id, recipient);
    });

    return Array.from(recipientMap.values())
      .map((recipient) => ({
        userId: recipient.userId,
        memberName: recipient.memberName,
        teams: Array.from(recipient.teams.values())
          .map((teamEntry) => {
            const sortedBucketKeys = Array.from(teamEntry.bucketKeys).sort();
            const teamSnapshot = POSITION_SLOTS
              .map((slot) => {
                const byMember = new Map<string, string[]>();

                sortedBucketKeys.forEach((bucketKey, index) => {
                  const memberName = effectiveTeamSnapshotByBucket[teamEntry.teamId]?.[bucketKey]?.[slot.slot];
                  if (!memberName) return;
                  const labels = byMember.get(memberName) || [];
                  labels.push(`W${index + 1}`);
                  byMember.set(memberName, labels);
                });

                if (byMember.size === 0) return null;

                const summary = Array.from(byMember.entries())
                  .map(([memberName, labels]) =>
                    labels.length === sortedBucketKeys.length
                      ? memberName
                      : `${memberName} (${labels.join(", ")})`,
                  )
                  .join(" / ");

                return {
                  slot: slot.label,
                  summary,
                };
              })
              .filter((entry): entry is { slot: string; summary: string } => Boolean(entry));

            const dateSummary = sortedBucketKeys.map((bucketKey, index) => ({
              label: `W${index + 1}`,
              date: formatPreviewDate(bucketKey),
            }));

            return {
              ...teamEntry,
              title: selectedPeriod?.name
                ? `${selectedPeriod.name}: ${teamEntry.teamName}`
                : `New Rotation: ${teamEntry.teamName}`,
              message: `You're on ${teamEntry.teamName} for ${dateSummary.map((entry) => entry.date).join(", ")}. Tap to view your team and schedule.`,
              dateSummary,
              teamSnapshot,
            };
          })
          .sort((a, b) => a.teamName.localeCompare(b.teamName)),
      }))
      .filter((recipient) => recipient.teams.length > 0)
      .sort((a, b) => a.memberName.localeCompare(b.memberName));
  }, [
    dateOverrides,
    dateOverridesByTeamSlot,
    effectiveTeamSnapshotByBucket,
    scheduleDatesByTeam,
    selectedMinistryType,
    selectedPeriod?.name,
    teamById,
    visibleAssignments,
  ]);

  const breakPushPreviewRecipients = useMemo(() => {
    const breakUserIdSet = new Set(selectedPeriodBreakUserIds);

    return availableMembers
      .filter((member) => breakUserIdSet.has(member.id))
      .map((member) => ({
        userId: member.id,
        memberName: member.full_name,
        title: selectedPeriod?.name
          ? `${selectedPeriod.name}: Time to Recharge`
          : "Time to Recharge",
        message:
          "This trimester is a chance to reset, breathe, and stay connected in a different way.",
        encouragement:
          "Use this time to recharge and, if you’d like, serve in another area while you rest from your usual rotation.",
        positions: member.positions,
      }))
      .sort((a, b) => a.memberName.localeCompare(b.memberName));
  }, [availableMembers, selectedPeriod?.name, selectedPeriodBreakUserIds]);

  const publishNotifications = useMemo<RotationPublishNotification[]>(() => {
    const assignmentNotifications = rotationPushPreviewRecipients.flatMap((recipient) =>
      recipient.teams.map((teamEntry) => ({
        userId: recipient.userId,
        title: `Welcome to ${teamEntry.teamName}`,
        message: teamEntry.message,
        url: "/team-builder",
        tag: `rotation-publish-${selectedPeriodId || "unknown"}-${teamEntry.teamId}-${recipient.userId}`,
        metadata: {
          type: "rotation_assignment",
          rotationPeriodId: selectedPeriodId,
          teamId: teamEntry.teamId,
          teamName: teamEntry.teamName,
          ministryType: selectedMinistryType,
        },
      })),
    );

    const breakNotifications = breakPushPreviewRecipients.map((recipient) => ({
      userId: recipient.userId,
      title: recipient.title,
      message: recipient.message,
      url: "/team-builder",
      tag: `rotation-break-${selectedPeriodId || "unknown"}-${recipient.userId}`,
      metadata: {
        type: "rotation_break",
        rotationPeriodId: selectedPeriodId,
        ministryType: selectedMinistryType,
      },
    }));

    return [...assignmentNotifications, ...breakNotifications];
  }, [
    breakPushPreviewRecipients,
    rotationPushPreviewRecipients,
    selectedMinistryType,
    selectedPeriodId,
  ]);

  const assignableMembersForSlot = useMemo(() => {
    if (!assigningSlot) return availableMembers;

    const multiTeamLeaderIds = new Set(
      multiTeamAssignableMembers.map((member) => member.id),
    );

    const allowedCurrentUserIds = new Set<string>();
    const currentBaseAssignment = members.find(
      (member) =>
        member.team_id === assigningSlot.teamId &&
        member.position_slot === assigningSlot.slot,
    );

    if (currentBaseAssignment?.user_id) {
      allowedCurrentUserIds.add(currentBaseAssignment.user_id);
    }

    if (assigningSlot.scheduleDate) {
      const currentOverrideAssignment =
        dateOverridesByTeamSlot[assigningSlot.teamId]?.[assigningSlot.slot]?.[assigningSlot.scheduleDate];

      if (currentOverrideAssignment?.user_id) {
        allowedCurrentUserIds.add(currentOverrideAssignment.user_id);
      }
    }

    const assignmentsByUser = new Map<string, Array<{ teamId: string; positionSlot: string | null }>>();

    members.forEach((member) => {
      if (!member.user_id || allowedCurrentUserIds.has(member.user_id)) return;

      const existingAssignments = assignmentsByUser.get(member.user_id) || [];
      existingAssignments.push({
        teamId: member.team_id,
        positionSlot: member.position_slot,
      });
      assignmentsByUser.set(member.user_id, existingAssignments);
    });

    dateOverrides.forEach((override) => {
      if (!override.user_id || allowedCurrentUserIds.has(override.user_id)) return;

      const existingAssignments = assignmentsByUser.get(override.user_id) || [];
      existingAssignments.push({
        teamId: override.team_id,
        positionSlot: override.position_slot,
      });
      assignmentsByUser.set(override.user_id, existingAssignments);
    });

    return availableMembers.filter((member) => {
      if (selectedPeriodBreakUserIds.includes(member.id)) {
        return false;
      }

      const existingAssignments = assignmentsByUser.get(member.id) || [];
      if (existingAssignments.length === 0) {
        return true;
      }

      if (multiTeamLeaderIds.has(member.id)) {
        return true;
      }

      if (
        existingAssignments.length === 1 &&
        existingAssignments[0].teamId === assigningSlot.teamId &&
        isVocalAndGuitarPair(existingAssignments[0].positionSlot, assigningSlot.slot)
      ) {
        return true;
      }

      return false;
    });
  }, [
    assigningSlot,
    availableMembers,
    multiTeamAssignableMembers,
    dateOverrides,
    dateOverridesByTeamSlot,
    members,
    selectedPeriodBreakUserIds,
  ]);

  const blackoutConflictDatesForAssigningSlot = useMemo(() => {
    if (!assigningSlot) return {};

    const scheduledDatesForTeam = new Set(
      assigningSlot.scheduleDate
        ? (teamScheduleBuckets[assigningSlot.teamId] || [])
            .find((bucket) => bucket.key === assigningSlot.scheduleDate)
            ?.dates || [assigningSlot.scheduleDate]
        : scheduleEntries
            .filter((entry) => entry.team_id === assigningSlot.teamId)
            .map((entry) => entry.schedule_date),
    );

    return assignableMembersForSlot.reduce<Record<string, string[]>>((acc, member) => {
      const memberBlackoutDates = blackoutDatesByUser[member.id] || [];
      const conflictDates = memberBlackoutDates
        .filter((date) => scheduledDatesForTeam.has(date))
        .sort();

      if (conflictDates.length > 0) {
        acc[member.id] = conflictDates;
      }

      return acc;
    }, {});
  }, [assigningSlot, assignableMembersForSlot, blackoutDatesByUser, scheduleEntries, teamScheduleBuckets]);

  // Get members by team. Rotation periods are already campus-scoped, so keep
  // cross-campus fill-ins visible here so admins can edit/remove them.
  const getMembersForTeam = (teamId: string) => {
    return members.filter((member) => member.team_id === teamId);
  };

  const getMembersForTeamServiceDay = (
    teamId: string,
    serviceDay: "saturday" | "sunday" | null,
  ) => {
    return members.filter((member) => {
      if (member.team_id !== teamId) return false;
      if (!serviceDay) return true;
      return member.service_day === serviceDay;
    });
  };

  const isTeamLocked = (teamId: string) => {
    return teamLocks.some(lock => lock.team_id === teamId);
  };

  const handleToggleLock = (teamId: string) => {
    if (!selectedPeriodId || !canEditCampus) return;
    toggleLock.mutate({
      teamId,
      rotationPeriodId: selectedPeriodId,
      isCurrentlyLocked: isTeamLocked(teamId),
    });
  };

  const handleAssign = (
    team: WorshipTeam,
    slot: string,
    scheduleDate?: string,
    serviceDay?: "saturday" | "sunday" | null,
  ) => {
    if (!canEditCampus || isTeamLocked(team.id)) return;
    setAssigningSlot({
      teamId: team.id,
      teamName: team.name,
      slot,
      requiredGender: getRequiredGenderForSlot(team.template_config, slot),
      scheduleDate,
      serviceDay: serviceDay || null,
    });
  };

  const handleRemove = (
    teamId: string,
    slot: string,
    scheduleDate?: string,
    serviceDay?: "saturday" | "sunday" | null,
  ) => {
    if (!selectedPeriodId || !canEditCampus || isTeamLocked(teamId)) return;
    const targetMinistryType = resolveTeamBuilderSlotMinistryType(selectedMinistryType, slot);

    if (scheduleDate) {
      const matchingBucketDates =
        (teamScheduleBuckets[teamId] || [])
          .find((bucket) => bucket.key === scheduleDate)
          ?.dates || [scheduleDate];

      Promise.all(
        matchingBucketDates.map((bucketDate, index) =>
          removeMemberDateOverride.mutateAsync({
            teamId,
            positionSlot: slot,
            rotationPeriodId: selectedPeriodId,
            scheduleDate: bucketDate,
            ministryType: targetMinistryType,
            suppressToast: index < matchingBucketDates.length - 1,
          }),
        ),
      );
      return;
    }

    removeMember.mutate({
      teamId,
      positionSlot: slot,
      rotationPeriodId: selectedPeriodId,
      serviceDay: serviceDay || null,
      ministryType: targetMinistryType,
    });
  };

  const handleSelectMember = (member: AvailableMember, ministryTypes: string[]) => {
    if (!assigningSlot || !selectedPeriodId) return;

    if (assigningSlot.scheduleDate) {
      const matchingBucketDates =
        (teamScheduleBuckets[assigningSlot.teamId] || [])
          .find((bucket) => bucket.key === assigningSlot.scheduleDate)
          ?.dates || [assigningSlot.scheduleDate];

      Promise.all(
        matchingBucketDates.map((scheduleDate, index) =>
          assignMemberDateOverride.mutateAsync({
            teamId: assigningSlot.teamId,
            userId: member.id,
            memberName: member.full_name,
            positionSlot: assigningSlot.slot,
            rotationPeriodId: selectedPeriodId,
            scheduleDate,
            ministryTypes,
            suppressToast: index < matchingBucketDates.length - 1,
          }),
        ),
      ).finally(() => {
        setAssigningSlot(null);
      });
      return;
    }

    assignMember.mutate({
      teamId: assigningSlot.teamId,
      userId: member.id,
      memberName: member.full_name,
      positionSlot: assigningSlot.slot,
      rotationPeriodId: selectedPeriodId,
      ministryTypes: ministryTypes,
      serviceDay: assigningSlot.serviceDay || null,
    });
    setAssigningSlot(null);
  };

  const teamCards = useMemo(() => {
    if (selectedMinistryType !== "video") {
      return filteredTeams.map((team) => ({
        key: team.id,
        team,
        title: team.name,
        serviceDay: null as "saturday" | "sunday" | null,
      }));
    }

    const serviceDays = [
      selectedCampus?.has_saturday_service ? ("saturday" as const) : null,
      selectedCampus?.has_sunday_service ? ("sunday" as const) : null,
    ].filter((value): value is "saturday" | "sunday" => Boolean(value));

    return filteredTeams.flatMap((team) =>
      serviceDays.map((serviceDay) => ({
        key: `${team.id}-${serviceDay}`,
        team,
        title: `${team.name} ${serviceDay === "saturday" ? "Saturday" : "Sunday"}`,
        serviceDay,
      })),
    );
  }, [filteredTeams, selectedCampus, selectedMinistryType]);

  const handleEditMinistry = (member: TeamMemberAssignment) => {
    if (!canEditCampus) return;
    setEditingMinistry(member);
  };

  const handleSaveMinistry = async (ministries: string[]) => {
    if (!editingMinistry) return;
    await updateMinistryTypes.mutateAsync({
      memberId: editingMinistry.id,
      ministryTypes: ministries,
    });
  };

  const handleClear = () => {
    if (!selectedPeriodId) return;
    clearPeriod.mutate(selectedPeriodId);
    setShowClearConfirm(false);
  };

  const handleCopyFromPrevious = () => {
    if (!selectedPeriodId) return;
    copyFromPrevious.mutate({
      fromPeriodId: getPreviousPeriodId(periods, selectedPeriodId),
      toPeriodId: selectedPeriodId,
    });
  };

  const handleSaveTemplate = async (templateConfig: TeamTemplateConfig) => {
    if (!editingTemplateTeam || !selectedCampusId) return;

    await updateTeamTemplate.mutateAsync({
      teamId: editingTemplateTeam.id,
      campusId: selectedCampusId,
      templateConfig,
    });
    setEditingTemplateTeam(null);
  };

  const handleSaveDraft = async () => {
    if (!selectedPeriodId || !selectedCampusId) return;

    await saveRotationDraft.mutateAsync({
      rotationPeriodId: selectedPeriodId,
      campusId: selectedCampusId,
      ministryType: selectedMinistryType,
      assignments: visibleAssignments,
    });
  };

  const handlePublishRotation = async () => {
    if (!selectedPeriodId || !selectedCampusId) return;

    await publishRotation.mutateAsync({
      rotationPeriodId: selectedPeriodId,
      campusId: selectedCampusId,
      ministryType: selectedMinistryType,
      assignments: visibleAssignments,
      notifications: publishNotifications,
    });
    setPublishConfirmOpen(false);
  };

  const handleCrossCheck = async () => {
    if (!selectedPeriodId || !selectedPeriod) return;

    const results = await crossCheckRotationAssignments.mutateAsync({
      rotationPeriodId: selectedPeriodId,
      rotationPeriodName: selectedPeriod.name,
      year: selectedPeriod.year,
      trimester: selectedPeriod.trimester,
      ministryType: selectedMinistryType,
    });

    setCrossCheckResults(results);
    setCrossCheckDialogOpen(true);
  };

  const isLoading = periodsLoading || teamsLoading || membersLoading || authLoading || campusesLoading || adminCampusLoading;

  return (
    <RefreshableContainer queryKeys={[["rotation-periods"], ["worship-teams"], ["team-members"], ["break-requests"]]}>
      <TeamBuilderHeader
        isAdminUser={isAdminUser}
        canEditCampus={canEditCampus}
        campuses={campuses}
        selectedCampusId={selectedCampusId}
        onCampusChange={setSelectedCampusId}
        periods={periods}
        selectedPeriodId={selectedPeriodId}
        onPeriodChange={setSelectedPeriodId}
        selectedMinistryType={selectedMinistryType}
        onMinistryTypeChange={setSelectedMinistryType}
      />

      {/* No periods message */}
      {!isLoading && periods.length === 0 && selectedCampusId && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-muted-foreground">
            No rotation periods configured for {selectedCampus?.name}.
          </p>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {/* Main content */}
      {!isLoading && periods.length > 0 && (
        <>
          {isAdminUser ? (
            <Tabs defaultValue="my-team" className="space-y-6">
              <TabsList>
                <TabsTrigger value="my-team">My Team</TabsTrigger>
                <TabsTrigger value="all-teams" className="gap-1.5">
                  <Settings className="h-3.5 w-3.5" />
                  Manage All Teams
                </TabsTrigger>
              </TabsList>

              <TabsContent value="my-team" className="space-y-6">
                <MyTeamView
                  userId={user?.id || ""}
                  teams={teams}
                  members={members}
                  isLoading={membersLoading}
                  periodName={selectedPeriod?.name}
                  isAdmin={true}
                  periods={periods}
                  ministryFilter={selectedMinistryType}
                  canEditAudio={isProductionManager || hasFullTeamBuilderAccess}
                  canEditBroadcast={hasFullTeamBuilderAccess}
                />
                
                <OnBreakList
                  allMembers={availableMembers}
                  assignedMembers={members}
                  previousPeriodMembers={previousPeriodMembers}
                  historicalMemberIds={historicalMemberIds}
                  periodName={selectedPeriod?.name}
                  campusId={selectedCampusId}
                  userCampusMap={userCampusMap}
                  ministryFilter={selectedMinistryType}
                  requestedBreakUserIds={requestedBreakUserIds}
                  satUserIds={satUserIds}
                  satRequestIdsByUser={satRequestIdsByUser}
                  blackoutDateUserIds={blackoutDateUserIds}
                  canSitUpcomingRotation={canEditCampus}
                  nextRotationPeriodId={selectedPeriodId}
                  nextRotationBreakUserIds={selectedPeriodBreakUserIds}
                />
              </TabsContent>

              <TabsContent value="all-teams" className="space-y-6">
                {/* Team Schedule Widget */}
                {canEditCampus && (
                  <TeamScheduleWidget
                    campusId={selectedCampusId}
                    rotationPeriodName={selectedPeriod?.name || null}
                    rotationPeriodStartDate={selectedPeriod?.start_date || null}
                    rotationPeriodEndDate={selectedPeriod?.end_date || null}
                    ministryFilter={selectedMinistryType}
                    canPublishNetworkWide={adminCampusInfo?.isOrgAdmin === true}
                  />
                )}

                {/* Action buttons */}
                {canEditCampus && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="default"
                      onClick={() => setShowAutoBuilder(true)}
                      disabled={!selectedPeriodId}
                    >
                      <Wand2 className="mr-2 h-4 w-4" />
                      Auto-Build
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleSaveDraft}
                      disabled={!selectedPeriodId || !selectedCampusId || visibleAssignments.length === 0 || saveRotationDraft.isPending}
                    >
                      {saveRotationDraft.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="mr-2 h-4 w-4" />
                      )}
                      Save as Draft
                    </Button>
                    <Button
                      variant="default"
                      onClick={() => setPublishConfirmOpen(true)}
                      disabled={
                        !selectedPeriodId ||
                        !selectedCampusId ||
                        (visibleAssignments.length === 0 && breakPushPreviewRecipients.length === 0) ||
                        publishRotation.isPending
                      }
                    >
                      {publishRotation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <BellRing className="mr-2 h-4 w-4" />
                      )}
                      Publish Rotation
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleCrossCheck}
                      disabled={!selectedPeriodId || !selectedPeriod || visibleAssignments.length === 0 || crossCheckRotationAssignments.isPending}
                    >
                      {crossCheckRotationAssignments.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <SearchCheck className="mr-2 h-4 w-4" />
                      )}
                      Cross Check
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setRotationPushPreviewOpen(true)}
                      disabled={rotationPushPreviewRecipients.length === 0 && breakPushPreviewRecipients.length === 0}
                    >
                      <BellRing className="mr-2 h-4 w-4" />
                      Preview Rotation Push
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleCopyFromPrevious}
                      disabled={!selectedPeriodId || copyFromPrevious.isPending}
                    >
                      {copyFromPrevious.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Copy className="mr-2 h-4 w-4" />
                      )}
                      Copy from Previous
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setShowClearConfirm(true)}
                      disabled={!selectedPeriodId || members.length === 0}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Clear All
                    </Button>
                  </div>
                )}

                {(rotationDraftSummary || crossCheckResults.length > 0) && (
                  <div className="space-y-3">
                    {rotationDraftSummary && (
                      <Alert>
                        <Save className="h-4 w-4" />
                        <AlertDescription>
                          Draft saved for this campus/ministry on{" "}
                          {new Date(rotationDraftSummary.updated_at).toLocaleString()}.
                          {rotationDraftSummary.published_at && (
                            <>
                              {" "}Published{" "}
                              {new Date(rotationDraftSummary.published_at).toLocaleString()}.
                            </>
                          )}
                        </AlertDescription>
                      </Alert>
                    )}
                    {crossCheckResults.length > 0 && (
                      <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                          Cross Check found {crossCheckResults.length} volunteer overlap{crossCheckResults.length === 1 ? "" : "s"} across campuses for this rotation.
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  {teamCards.map(({ key, team, title, serviceDay }) => (
                    <TeamCard
                      key={key}
                      team={team}
                      members={
                        serviceDay
                          ? getMembersForTeamServiceDay(team.id, serviceDay)
                          : getMembersForTeam(team.id)
                      }
                      availableMembers={availableMembers}
                      onAssign={(slot, scheduleDate) => handleAssign(team, slot, scheduleDate, serviceDay)}
                      onRemove={(slot, scheduleDate) => handleRemove(team.id, slot, scheduleDate, serviceDay)}
                      onEditMinistry={handleEditMinistry}
                      onEditTemplate={canEditCampus ? () => setEditingTemplateTeam(team) : undefined}
                      readOnly={!canEditCampus}
                      isLocked={isTeamLocked(team.id)}
                      onToggleLock={() => handleToggleLock(team.id)}
                      canLock={canEditCampus}
                      canEditBroadcast={hasFullTeamBuilderAccess}
                      canEditAudio={isProductionManager || hasFullTeamBuilderAccess}
                      ministryFilter={selectedMinistryType}
                      slotConflictDates={combinedConflictDatesByTeamSlot[team.id] || {}}
                      slotScheduleDates={serviceDay ? [] : scheduleDatesByTeam[team.id] || []}
                      slotDateOverrides={serviceDay ? {} : dateOverridesByTeamSlot[team.id] || {}}
                      slotDateOverrideConflictDates={serviceDay ? {} : blackoutConflictDatesByTeamSlotDateOverride[team.id] || {}}
                      titleOverride={title}
                    />
                  ))}
                </div>

                {/* Break Requests Widget */}
                <BreakRequestsWidget
                  requests={breakRequests}
                  periodName={selectedPeriod?.name}
                  ministryFilter={selectedMinistryType}
                />

                <OnBreakList
                  allMembers={availableMembers}
                  assignedMembers={members}
                  previousPeriodMembers={previousPeriodMembers}
                  historicalMemberIds={historicalMemberIds}
                  periodName={selectedPeriod?.name}
                  campusId={selectedCampusId}
                  userCampusMap={userCampusMap}
                  ministryFilter={selectedMinistryType}
                  requestedBreakUserIds={requestedBreakUserIds}
                  satUserIds={satUserIds}
                  satRequestIdsByUser={satRequestIdsByUser}
                  blackoutDateUserIds={blackoutDateUserIds}
                  canSitUpcomingRotation={canEditCampus}
                  nextRotationPeriodId={selectedPeriodId}
                  nextRotationBreakUserIds={selectedPeriodBreakUserIds}
                />
              </TabsContent>
            </Tabs>
          ) : (
            <>
              <MyTeamView
                userId={user?.id || ""}
                teams={teams}
                members={members}
                isLoading={membersLoading}
                periodName={selectedPeriod?.name}
                periods={periods}
                ministryFilter={selectedMinistryType}
                canEditAudio={isProductionManager || hasFullTeamBuilderAccess}
                canEditBroadcast={hasFullTeamBuilderAccess}
              />
              
              
              <OnBreakList
                allMembers={availableMembers}
                assignedMembers={members}
                previousPeriodMembers={previousPeriodMembers}
                historicalMemberIds={historicalMemberIds}
                periodName={selectedPeriod?.name}
                campusId={selectedCampusId}
                userCampusMap={userCampusMap}
                ministryFilter={selectedMinistryType}
                requestedBreakUserIds={requestedBreakUserIds}
                satUserIds={satUserIds}
                satRequestIdsByUser={satRequestIdsByUser}
                blackoutDateUserIds={blackoutDateUserIds}
                canSitUpcomingRotation={canEditCampus}
                nextRotationPeriodId={selectedPeriodId}
                nextRotationBreakUserIds={selectedPeriodBreakUserIds}
              />
            </>
          )}
        </>
      )}

      {/* Ministry edit dialog */}
      {editingMinistry && (
        <MinistryEditDialog
          open={!!editingMinistry}
          onOpenChange={open => !open && setEditingMinistry(null)}
          memberName={editingMinistry.member_name}
          currentMinistries={editingMinistry.ministry_types}
          onSave={handleSaveMinistry}
        />
      )}

      {/* Auto-builder dialog */}
      {selectedPeriodId && (
        <AutoBuilderDialog
          open={showAutoBuilder}
          onOpenChange={setShowAutoBuilder}
          rotationPeriodId={selectedPeriodId}
          campusName={selectedCampus?.name}
          campusWorshipPastorIds={campusWorshipPastors.map((pastor) => pastor.id)}
          allowMultiTeamUserIds={multiTeamAssignableMembers.map((member) => member.id)}
          teams={filteredTeams}
          members={availableMembers}
          ministryType={selectedMinistryType}
          previousPeriodMembers={previousPeriodMembers}
          breakExcludedUserIds={autoBuildExcludedUserIds}
          previousApprovedBreakUserIds={previousApprovedBreakUserIds}
          blackoutDatesByUser={blackoutDatesByUser}
          scheduleEntries={scheduleEntries.map((entry) => ({
            team_id: entry.team_id,
            schedule_date: entry.schedule_date,
          }))}
        />
      )}

      {/* Assign member dialog */}
      {assigningSlot && (
        <AssignMemberDialog
          open={!!assigningSlot}
          onOpenChange={open => !open && setAssigningSlot(null)}
          slot={assigningSlot.slot}
          teamName={assigningSlot.teamName}
          members={assignableMembersForSlot}
          blackoutConflictDatesByMember={blackoutConflictDatesForAssigningSlot}
          onSelect={handleSelectMember}
          ministryFilter={selectedMinistryType !== "all" ? selectedMinistryType : undefined}
          requiredGender={assigningSlot.requiredGender}
          scheduleDate={assigningSlot.scheduleDate}
        />
      )}

      {editingTemplateTeam && (
        <TeamTemplateDialog
          open={!!editingTemplateTeam}
          onOpenChange={(open) => !open && setEditingTemplateTeam(null)}
          teamName={editingTemplateTeam.name}
          ministryType={selectedMinistryType}
          initialConfig={editingTemplateTeam.template_config}
          onSave={handleSaveTemplate}
          isSaving={updateTeamTemplate.isPending}
        />
      )}

      <Dialog open={crossCheckDialogOpen} onOpenChange={setCrossCheckDialogOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Cross-Campus Conflict Check</DialogTitle>
            <DialogDescription>
              Review volunteers scheduled on the same weekend across multiple campuses for this rotation.
            </DialogDescription>
          </DialogHeader>
          {crossCheckResults.length === 0 ? (
            <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              No cross-campus weekend conflicts were found.
            </div>
          ) : (
            <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-2">
              {crossCheckResults.map((conflict) => (
                <div key={`${conflict.userId}-${conflict.weekendKey}`} className="rounded-lg border border-border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{conflict.memberName}</p>
                    <Badge variant="outline">{conflict.weekendKey}</Badge>
                    <Badge variant="destructive">
                      {conflict.assignments.length} assignments
                    </Badge>
                  </div>
                  <div className="mt-3 space-y-2">
                    {conflict.assignments.map((assignment, index) => (
                      <div key={`${assignment.campusName}-${assignment.teamId}-${assignment.scheduleDate}-${index}`} className="rounded-md bg-muted/40 px-3 py-2 text-sm">
                        <span className="font-medium">{assignment.campusName}</span>
                        {" · "}
                        <span>{assignment.teamName}</span>
                        {" · "}
                        <span>{assignment.scheduleDate}</span>
                        {assignment.serviceDay && (
                          <>
                            {" · "}
                            <span className="capitalize">{assignment.serviceDay}</span>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCrossCheckDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rotationPushPreviewOpen} onOpenChange={setRotationPushPreviewOpen}>
        <DialogContent className="sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Rotation Push Preview</DialogTitle>
            <DialogDescription>
              Personalized push previews for everyone on this rotation, including their team and weekend snapshot.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh] pr-4">
            <div className="space-y-4">
              {rotationPushPreviewRecipients.length === 0 && breakPushPreviewRecipients.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
                  No push notification previews available yet.
                </div>
              ) : (
                <>
                {rotationPushPreviewRecipients.length > 0 && rotationPushPreviewRecipients.map((recipient) => (
                  <div key={recipient.userId} className="rounded-2xl border border-border bg-card/90 p-5 shadow-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold">{recipient.memberName}</h3>
                      <Badge variant="secondary">
                        {recipient.teams.length} team{recipient.teams.length === 1 ? "" : "s"}
                      </Badge>
                    </div>
                    <div className="mt-4 space-y-4">
                      {recipient.teams.map((teamEntry) => (
                        <div
                          key={`${recipient.userId}-${teamEntry.teamId}`}
                          className="overflow-hidden rounded-2xl border border-border bg-muted/20"
                        >
                          <div
                            className="border-b border-white/10 px-5 py-5"
                            style={{
                              background: `linear-gradient(135deg, ${teamEntry.teamColor}33 0%, rgba(15, 23, 42, 0.92) 55%, rgba(10, 10, 10, 1) 100%)`,
                            }}
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className="h-3 w-3 rounded-full ring-4 ring-white/10"
                                style={{ backgroundColor: teamEntry.teamColor }}
                              />
                              <Badge
                                variant="outline"
                                className="border-white/15 bg-white/10 text-white/80"
                              >
                                New Rotation
                              </Badge>
                            </div>
                            <h4 className="mt-4 text-3xl font-black tracking-tight text-white">
                              Welcome to {teamEntry.teamName}
                            </h4>
                            <p className="mt-2 max-w-2xl text-sm text-white/75">
                              {recipient.memberName}, here&apos;s your team, your dates, and the snapshot of who you&apos;re serving with this rotation.
                            </p>
                          </div>
                          <div className="p-5">
                            <div className="rounded-xl border border-border bg-background p-4 shadow-sm">
                              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                              Push Preview
                              </p>
                              <p className="mt-2 text-base font-semibold">{teamEntry.title}</p>
                              <p className="mt-1 text-sm text-muted-foreground">{teamEntry.message}</p>
                            </div>
                            <div className="mt-4">
                              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                Their Dates
                              </p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {teamEntry.dateSummary.map((dateEntry) => (
                                  <div
                                    key={`${teamEntry.teamId}-${dateEntry.label}-${dateEntry.date}`}
                                    className="rounded-full border px-3 py-1.5 text-sm font-medium"
                                    style={{
                                      borderColor: `${teamEntry.teamColor}55`,
                                      backgroundColor: `${teamEntry.teamColor}18`,
                                      color: teamEntry.teamColor,
                                    }}
                                  >
                                    {dateEntry.label} · {dateEntry.date}
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div className="mt-4">
                              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                Team Snapshot
                              </p>
                              <div className="mt-2 grid gap-2 md:grid-cols-2">
                                {teamEntry.teamSnapshot.map((slotEntry) => (
                                  <div
                                    key={`${teamEntry.teamId}-${slotEntry.slot}`}
                                    className="rounded-xl border bg-background px-3 py-3 shadow-sm"
                                    style={{ borderColor: `${teamEntry.teamColor}22` }}
                                  >
                                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                                      {slotEntry.slot}
                                    </p>
                                    <p className="mt-1 text-sm font-medium leading-5">{slotEntry.summary}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {breakPushPreviewRecipients.length > 0 && (
                  <div className="rounded-2xl border border-border bg-card/90 p-5 shadow-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold">Break Notifications</h3>
                      <Badge variant="secondary">
                        {breakPushPreviewRecipients.length} recipient{breakPushPreviewRecipients.length === 1 ? "" : "s"}
                      </Badge>
                    </div>
                    <div className="mt-4 grid gap-4">
                      {breakPushPreviewRecipients.map((recipient) => (
                        <div key={`break-${recipient.userId}`} className="overflow-hidden rounded-2xl border border-border bg-muted/20">
                          <div
                            className="border-b border-white/10 px-5 py-5"
                            style={{
                              background:
                                "linear-gradient(135deg, rgba(251, 191, 36, 0.24) 0%, rgba(120, 53, 15, 0.24) 35%, rgba(10, 10, 10, 1) 100%)",
                            }}
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge
                                variant="outline"
                                className="border-white/15 bg-white/10 text-white/80"
                              >
                                Trimester Break
                              </Badge>
                            </div>
                            <h4 className="mt-4 text-3xl font-black tracking-tight text-white">
                              Time to Recharge
                            </h4>
                            <p className="mt-2 max-w-2xl text-sm text-white/75">
                              {recipient.memberName}, this break is built in so you can rest, reset, and enjoy a little margin this trimester.
                            </p>
                          </div>
                          <div className="p-5">
                            <div className="rounded-xl border border-border bg-background p-4 shadow-sm">
                              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                Push Preview
                              </p>
                              <p className="mt-2 text-base font-semibold">{recipient.title}</p>
                              <p className="mt-1 text-sm text-muted-foreground">{recipient.message}</p>
                            </div>
                            <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">
                                Encouragement
                              </p>
                              <p className="mt-2 text-sm text-amber-900/80 dark:text-amber-100/80">
                                {recipient.encouragement}
                              </p>
                            </div>
                            {recipient.positions.length > 0 && (
                              <div className="mt-4">
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                  Usual Serving Areas
                                </p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {recipient.positions.map((position) => (
                                    <Badge key={`${recipient.userId}-${position}`} variant="outline">
                                      {formatPositionLabel(position)}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                </>
              )}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRotationPushPreviewOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={publishConfirmOpen} onOpenChange={setPublishConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publish rotation?</AlertDialogTitle>
            <AlertDialogDescription>
              This will make the current rotation live and send {publishNotifications.length} push notification{publishNotifications.length === 1 ? "" : "s"} for assignments and breaks.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handlePublishRotation}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Publish Rotation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clear confirmation dialog */}
      <AlertDialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all assignments?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove all team member assignments for{" "}
              {selectedPeriod?.name}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClear}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Clear All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </RefreshableContainer>
  );
}
