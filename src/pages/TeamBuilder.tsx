import { useState, useMemo, useEffect } from "react";
import { Wand2, Trash2, Copy, Loader2, Settings, Save, SearchCheck, AlertTriangle } from "lucide-react";
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
  useRemoveMember,
  useClearPeriod,
  useCopyFromPreviousPeriod,
  useAllCampuses,
  useAdminCampusId,
  useTeamLocksForPeriod,
  useToggleTeamLock,
  useUpdateMinistryTypes,
  useUpdateTeamTemplate,
  usePreviousPeriodMembers,
  getPreviousPeriodId,
  useCampusWorshipPastors,
  useSaveRotationDraft,
  useRotationDraftSummary,
  useCrossCheckRotationAssignments,
  AvailableMember,
  TeamMemberAssignment,
  WorshipTeam,
  RotationConflict,
} from "@/hooks/useTeamBuilder";
import { useBreakRequestsForPeriod } from "@/hooks/useBreakRequests";
import { useTeamScheduleForCampus } from "@/hooks/useTeamScheduleEditor";
import { useAuth } from "@/hooks/useAuth";
import { useProfilesWithCampuses } from "@/hooks/useCampuses";
import {
  isTeamVisibleForMinistry,
  resolveTeamBuilderSlotMinistryType,
  breakRequestMatchesMinistryFilter,
  memberMatchesMinistryFilter,
} from "@/lib/constants";
import { getRequiredGenderForSlot, TeamTemplateConfig } from "@/lib/teamTemplates";

const MANAGED_SIT_REASON_PREFIX = "Sat from Team Builder";

export default function TeamBuilder() {
  const { user, isLoading: authLoading, isVideoDirector, isProductionManager, isAdmin } = useAuth();

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
    serviceDay: "saturday" | "sunday" | null;
    requiredGender: "male" | "female" | null;
  } | null>(null);
  const [editingMinistry, setEditingMinistry] = useState<TeamMemberAssignment | null>(null);
  const [editingTemplateTeam, setEditingTemplateTeam] = useState<WorshipTeam | null>(null);
  const [crossCheckDialogOpen, setCrossCheckDialogOpen] = useState(false);
  const [crossCheckResults, setCrossCheckResults] = useState<RotationConflict[]>([]);
  const assigningMinistryType = resolveTeamBuilderSlotMinistryType(
    selectedMinistryType,
    assigningSlot?.slot,
  );

  const { data: campuses = [], isLoading: campusesLoading } = useAllCampuses();
  const { data: adminCampusInfo, isLoading: adminCampusLoading } = useAdminCampusId();
  const { data: periods = [], isLoading: periodsLoading } = useRotationPeriodsForCampus(selectedCampusId);
  const { data: teams = [], isLoading: teamsLoading } = useWorshipTeams();
  const { data: members = [], isLoading: membersLoading } = useTeamMembersForPeriod(selectedPeriodId);
  const { data: availableMembers = [] } = useAvailableMembers(
    selectedCampusId,
    assigningSlot ? assigningMinistryType : selectedMinistryType,
  );
  const { data: historicalMemberIds } = useHistoricalTeamMemberIds();
  const { data: teamLocks = [] } = useTeamLocksForPeriod(selectedPeriodId);
  const { data: previousPeriodMembers = [] } = usePreviousPeriodMembers(periods, selectedPeriodId);
  const { data: campusWorshipPastors = [] } = useCampusWorshipPastors(selectedCampusId);
  const { data: breakRequests = [] } = useBreakRequestsForPeriod(selectedPeriodId);
  const selectedPeriod = periods.find(p => p.id === selectedPeriodId);
  const selectedCampus = campuses.find(c => c.id === selectedCampusId);
  const { data: scheduleEntries = [] } = useTeamScheduleForCampus(
    selectedCampusId,
    selectedPeriod?.name || null,
    selectedMinistryType,
  );
  const { data: userCampusMap } = useProfilesWithCampuses();
  const previousPeriodId = useMemo(() => {
    return getPreviousPeriodId(periods, selectedPeriodId);
  }, [periods, selectedPeriodId]);
  const { data: previousBreakRequests = [] } = useBreakRequestsForPeriod(previousPeriodId);

  const assignMember = useAssignMember();
  const removeMember = useRemoveMember();
  const clearPeriod = useClearPeriod();
  const copyFromPrevious = useCopyFromPreviousPeriod();
  const toggleLock = useToggleTeamLock();
  const updateMinistryTypes = useUpdateMinistryTypes();
  const updateTeamTemplate = useUpdateTeamTemplate();
  const saveRotationDraft = useSaveRotationDraft();
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
    return adminCampusInfo.campusId === selectedCampusId;
  }, [adminCampusInfo, selectedCampusId]);

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

  const visibleAssignments = useMemo(() => {
    if (selectedMinistryType === "all") {
      return members;
    }

    return members.filter((member) =>
      memberMatchesMinistryFilter(member.ministry_types, selectedMinistryType)
    );
  }, [members, selectedMinistryType]);

  // Get members by team. Rotation periods are already campus-scoped, so keep
  // cross-campus fill-ins visible here so admins can edit/remove them.
  const getMembersForTeam = (teamId: string) => {
    return members.filter((member) => member.team_id === teamId);
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
    serviceDay: "saturday" | "sunday" | null = null,
  ) => {
    if (!canEditCampus || isTeamLocked(team.id)) return;
    setAssigningSlot({
      teamId: team.id,
      teamName: team.name,
      slot,
      serviceDay,
      requiredGender: getRequiredGenderForSlot(team.template_config, slot),
    });
  };

  const handleRemove = (
    teamId: string,
    slot: string,
    serviceDay: "saturday" | "sunday" | null = null,
  ) => {
    if (!selectedPeriodId || !canEditCampus || isTeamLocked(teamId)) return;
    removeMember.mutate({
      teamId,
      positionSlot: slot,
      rotationPeriodId: selectedPeriodId,
      serviceDay,
    });
  };

  const handleSelectMember = (member: AvailableMember, ministryTypes: string[]) => {
    if (!assigningSlot || !selectedPeriodId) return;
    assignMember.mutate({
      teamId: assigningSlot.teamId,
      userId: member.id,
      memberName: member.full_name,
      positionSlot: assigningSlot.slot,
      rotationPeriodId: selectedPeriodId,
      serviceDay: assigningSlot.serviceDay,
      ministryTypes: ministryTypes,
    });
    setAssigningSlot(null);
  };

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
    if (!editingTemplateTeam) return;

    await updateTeamTemplate.mutateAsync({
      teamId: editingTemplateTeam.id,
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
                  canEditAudio={isProductionManager || isAdmin}
                  canEditBroadcast={isVideoDirector || isAdmin}
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
                  {filteredTeams.map(team => (
                    <TeamCard
                      key={team.id}
                      team={team}
                      members={getMembersForTeam(team.id)}
                      availableMembers={availableMembers}
                      onAssign={(slot, serviceDay) => handleAssign(team, slot, serviceDay)}
                      onRemove={(slot, serviceDay) => handleRemove(team.id, slot, serviceDay)}
                      onEditMinistry={handleEditMinistry}
                      onEditTemplate={canEditCampus ? () => setEditingTemplateTeam(team) : undefined}
                      readOnly={!canEditCampus}
                      isLocked={isTeamLocked(team.id)}
                      onToggleLock={() => handleToggleLock(team.id)}
                      canLock={canEditCampus}
                      canEditBroadcast={isVideoDirector || isAdmin}
                      canEditAudio={isProductionManager || isAdmin}
                      ministryFilter={selectedMinistryType}
                      canSplitWeekendSlots={Boolean(
                        selectedCampus?.has_saturday_service && selectedCampus?.has_sunday_service
                      )}
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
                canEditAudio={isProductionManager || isAdmin}
                canEditBroadcast={isVideoDirector || isAdmin}
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
          serviceDay={assigningSlot.serviceDay}
          members={availableMembers}
          onSelect={handleSelectMember}
          ministryFilter={selectedMinistryType !== "all" ? selectedMinistryType : undefined}
          requiredGender={assigningSlot.requiredGender}
        />
      )}

      {editingTemplateTeam && (
        <TeamTemplateDialog
          open={!!editingTemplateTeam}
          onOpenChange={(open) => !open && setEditingTemplateTeam(null)}
          teamName={editingTemplateTeam.name}
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
