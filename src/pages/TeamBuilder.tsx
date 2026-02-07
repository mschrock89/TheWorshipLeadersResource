import { useState, useMemo, useEffect } from "react";
import { Wand2, Trash2, Copy, Loader2, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  usePreviousPeriodMembers,
  usePreviousPeriodApprovedBreaks,
  AvailableMember,
  TeamMemberAssignment,
} from "@/hooks/useTeamBuilder";
import { useBreakRequestsForPeriod } from "@/hooks/useBreakRequests";
import { useAuth } from "@/hooks/useAuth";
import { useProfilesWithCampuses } from "@/hooks/useCampuses";
import { MINISTRY_TEAM_FILTER } from "@/lib/constants";

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
  } | null>(null);
  const [editingMinistry, setEditingMinistry] = useState<TeamMemberAssignment | null>(null);

  const { data: campuses = [], isLoading: campusesLoading } = useAllCampuses();
  const { data: adminCampusInfo, isLoading: adminCampusLoading } = useAdminCampusId();
  const { data: periods = [], isLoading: periodsLoading } = useRotationPeriodsForCampus(selectedCampusId);
  const { data: teams = [], isLoading: teamsLoading } = useWorshipTeams();
  const { data: members = [], isLoading: membersLoading } = useTeamMembersForPeriod(selectedPeriodId);
  const { data: availableMembers = [] } = useAvailableMembers(selectedCampusId, selectedMinistryType);
  const { data: historicalMemberIds } = useHistoricalTeamMemberIds();
  const { data: teamLocks = [] } = useTeamLocksForPeriod(selectedPeriodId);
  const { data: previousPeriodMembers = [] } = usePreviousPeriodMembers(periods, selectedPeriodId);
  const { data: previousPeriodApprovedBreakUserIds = [] } = usePreviousPeriodApprovedBreaks(periods, selectedPeriodId);
  const { data: breakRequests = [] } = useBreakRequestsForPeriod(selectedPeriodId);
  const { data: userCampusMap } = useProfilesWithCampuses();

  const assignMember = useAssignMember();
  const removeMember = useRemoveMember();
  const clearPeriod = useClearPeriod();
  const copyFromPrevious = useCopyFromPreviousPeriod();
  const toggleLock = useToggleTeamLock();
  const updateMinistryTypes = useUpdateMinistryTypes();

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

  const selectedPeriod = periods.find(p => p.id === selectedPeriodId);
  const selectedCampus = campuses.find(c => c.id === selectedCampusId);

  // Filter members by ministry type
  const filteredMembers = useMemo(() => {
    if (selectedMinistryType === "all") return members;
    return members.filter(m => 
      m.ministry_types?.includes(selectedMinistryType)
    );
  }, [members, selectedMinistryType]);

  // Filter available members by ministry type for OnBreakList
  const filteredAvailableMembers = useMemo(() => {
    if (selectedMinistryType === "all") return availableMembers;
    return availableMembers.filter(m => 
      m.ministry_types?.includes(selectedMinistryType)
    );
  }, [availableMembers, selectedMinistryType]);

  // Filter teams by selected ministry type
  const filteredTeams = useMemo(() => {
    const allowedTeams = MINISTRY_TEAM_FILTER[selectedMinistryType];
    if (!allowedTeams) return teams; // null means show all
    return teams.filter(team => allowedTeams.includes(team.name));
  }, [teams, selectedMinistryType]);

  // Get members by team (uses all members, not filtered - filtering is done via slot visibility)
  const getMembersForTeam = (teamId: string) => {
    return members.filter(m => m.team_id === teamId);
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

  const handleAssign = (teamId: string, teamName: string, slot: string) => {
    if (!canEditCampus || isTeamLocked(teamId)) return;
    setAssigningSlot({ teamId, teamName, slot });
  };

  const handleRemove = (teamId: string, slot: string) => {
    if (!selectedPeriodId || !canEditCampus || isTeamLocked(teamId)) return;
    removeMember.mutate({
      teamId,
      positionSlot: slot,
      rotationPeriodId: selectedPeriodId,
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
    const currentIndex = periods.findIndex(p => p.id === selectedPeriodId);
    const previousPeriod = periods[currentIndex + 1];
    copyFromPrevious.mutate({
      fromPeriodId: previousPeriod?.id || null,
      toPeriodId: selectedPeriodId,
    });
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
                />
              </TabsContent>

              <TabsContent value="all-teams" className="space-y-6">
                {/* Team Schedule Widget */}
                {canEditCampus && (
                  <TeamScheduleWidget
                    campusId={selectedCampusId}
                    rotationPeriodName={selectedPeriod?.name || null}
                    ministryFilter={selectedMinistryType}
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

                <div className="grid gap-4 sm:grid-cols-2">
                  {filteredTeams.map(team => (
                    <TeamCard
                      key={team.id}
                      team={team}
                      members={getMembersForTeam(team.id)}
                      availableMembers={availableMembers}
                      onAssign={slot => handleAssign(team.id, team.name, slot)}
                      onRemove={slot => handleRemove(team.id, slot)}
                      onEditMinistry={handleEditMinistry}
                      readOnly={!canEditCampus}
                      isLocked={isTeamLocked(team.id)}
                      onToggleLock={() => handleToggleLock(team.id)}
                      canLock={canEditCampus}
                      canEditBroadcast={isVideoDirector || isAdmin}
                      canEditAudio={isProductionManager || isAdmin}
                      ministryFilter={selectedMinistryType}
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
          teams={filteredTeams}
          members={availableMembers}
          ministryType={selectedMinistryType}
          previousPeriodMembers={previousPeriodMembers}
          approvedBreakUserIds={breakRequests.filter(r => r.status === "approved").map(r => r.user_id)}
          previousPeriodApprovedBreakUserIds={previousPeriodApprovedBreakUserIds}
        />
      )}

      {/* Assign member dialog */}
      {assigningSlot && (
        <AssignMemberDialog
          open={!!assigningSlot}
          onOpenChange={open => !open && setAssigningSlot(null)}
          slot={assigningSlot.slot}
          teamName={assigningSlot.teamName}
          members={availableMembers}
          onSelect={handleSelectMember}
          ministryFilter={selectedMinistryType !== "all" ? selectedMinistryType : undefined}
        />
      )}

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
