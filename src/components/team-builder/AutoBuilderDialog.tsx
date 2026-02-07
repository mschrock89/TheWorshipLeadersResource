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
import {
  useAutoBuildTeams,
  WorshipTeam,
  AvailableMember,
  TeamMemberAssignment,
} from "@/hooks/useTeamBuilder";
import { MINISTRY_TYPES, POSITION_SLOTS } from "@/lib/constants";

interface AutoBuilderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rotationPeriodId: string;
  teams: WorshipTeam[];
  members: AvailableMember[];
  ministryType: string;
  previousPeriodMembers: TeamMemberAssignment[];
  approvedBreakUserIds: string[];
  previousPeriodApprovedBreakUserIds: string[];
}

// Position mapping from profile positions to slot names
const PROFILE_POSITION_TO_SLOTS: Record<string, string[]> = {
  vocalist: ["vocalist_1", "vocalist_2", "vocalist_3", "vocalist_4"],
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
}

export function AutoBuilderDialog({
  open,
  onOpenChange,
  rotationPeriodId,
  teams,
  members,
  ministryType,
  previousPeriodMembers,
  approvedBreakUserIds,
  previousPeriodApprovedBreakUserIds,
}: AutoBuilderDialogProps) {
  const autoBuild = useAutoBuildTeams();
  const [isBuilding, setIsBuilding] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewAssignment[] | null>(null);

  const ministryLabel = MINISTRY_TYPES.find(m => m.value === ministryType)?.label || ministryType;

  // Filter members by ministry
  const eligibleMembers = useMemo(() => {
    if (ministryType === "all") return members;
    return members.filter(m => m.ministry_types?.includes(ministryType));
  }, [members, ministryType]);

  // Exclude approved breaks
  const availablePool = useMemo(() => {
    return eligibleMembers.filter(m => !approvedBreakUserIds.includes(m.id));
  }, [eligibleMembers, approvedBreakUserIds]);

  // Track previous period assignments
  const prevPeriodFiltered = useMemo(() => {
    if (ministryType === "all") return previousPeriodMembers;
    return previousPeriodMembers.filter(m => m.ministry_types?.includes(ministryType));
  }, [previousPeriodMembers, ministryType]);

  const previouslyAssignedIds = useMemo(() => {
    return new Set(prevPeriodFiltered.map(m => m.user_id).filter(Boolean));
  }, [prevPeriodFiltered]);

  const previousTeamMap = useMemo(() => {
    const map = new Map<string, string>();
    prevPeriodFiltered.forEach(m => {
      if (m.user_id) {
        const team = teams.find(t => t.id === m.team_id);
        if (team) map.set(m.user_id, team.name);
      }
    });
    return map;
  }, [prevPeriodFiltered, teams]);

  // Members who must serve (had an approved break in the previous period)
  const mustServeMembers = useMemo(() => {
    const prevBreakSet = new Set(previousPeriodApprovedBreakUserIds);
    return availablePool.filter(m => prevBreakSet.has(m.id));
  }, [availablePool, previousPeriodApprovedBreakUserIds]);

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
    
    const userAssignedToTeam = new Map<string, Set<string>>();
    const slotFilledPerTeam = new Map<string, Set<string>>();
    teams.forEach(t => slotFilledPerTeam.set(t.id, new Set()));

    // Members who had an approved break last period should be prioritized
    const prevBreakSet = new Set(previousPeriodApprovedBreakUserIds);
    const wasOnBreakLastPeriod = availablePool.filter(m => prevBreakSet.has(m.id));
    const otherMembers = availablePool.filter(m => !prevBreakSet.has(m.id));

    const slotPriority = [
      "drums", "bass", "keys",
      "eg_1", "eg_2", "ag_1", "ag_2",
      "vocalist_1", "vocalist_2", "vocalist_3", "vocalist_4",
      "foh", "mon", "broadcast", "audio_shadow", "lighting", "propresenter", "producer",
      "camera_1", "camera_2", "camera_3", "camera_4", "camera_5", "camera_6",
      "chat_host", "director", "graphics", "switcher",
    ];

    for (const targetSlot of slotPriority) {
      const slotConfig = POSITION_SLOTS.find(s => s.slot === targetSlot);
      if (!slotConfig) continue;

      const getCandidates = (pool: AvailableMember[]) => 
        pool.filter(m => getMemberAvailableSlots(m.positions).includes(targetSlot));

      const shuffleMustServe = [...getCandidates(wasOnBreakLastPeriod)].sort(() => Math.random() - 0.5);
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
        const filledSlots = slotFilledPerTeam.get(team.id)!;
        if (filledSlots.has(targetSlot)) continue;

        let assigned: AvailableMember | undefined;

        assigned = shuffleMustServe.find(m => {
          const assignedTeams = userAssignedToTeam.get(m.id) || new Set();
          return !assignedTeams.has(team.id);
        });

        if (!assigned) {
          const sortedCanServe = sortByTeamVariety(shuffleCanServe, team);
          assigned = sortedCanServe.find(m => {
            const assignedTeams = userAssignedToTeam.get(m.id) || new Set();
            return !assignedTeams.has(team.id);
          });
        }

        if (assigned) {
          if (!userAssignedToTeam.has(assigned.id)) {
            userAssignedToTeam.set(assigned.id, new Set());
          }
          userAssignedToTeam.get(assigned.id)!.add(team.id);
          filledSlots.add(targetSlot);

          assignments.push({
            team_id: team.id,
            team_name: team.name,
            user_id: assigned.id,
            member_name: assigned.full_name,
            avatar_url: assigned.avatar_url,
            position: slotConfig.label,
            position_slot: targetSlot,
            was_on_break: !previouslyAssignedIds.has(assigned.id),
            previous_team: previousTeamMap.get(assigned.id),
          });

          const mustServeIdx = shuffleMustServe.indexOf(assigned);
          if (mustServeIdx > -1) shuffleMustServe.splice(mustServeIdx, 1);
          const canServeIdx = shuffleCanServe.indexOf(assigned);
          if (canServeIdx > -1) shuffleCanServe.splice(canServeIdx, 1);
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
        teams,
        members,
        ministryType,
        previousPeriodMembers,
        approvedBreakUserIds,
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

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
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
          <div className="space-y-4 py-4">
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
                <p className="text-lg font-semibold">{approvedBreakUserIds.length}</p>
                <p className="text-xs text-muted-foreground">On Break</p>
              </div>
            </div>

            <div className="rounded-lg bg-muted p-4 space-y-2">
              <p className="text-sm font-medium">Algorithm will:</p>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>Fill hardest positions first (drums, bass, keys)</li>
                <li>Prioritize members who were on break last period</li>
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
                  Must serve this period (was on break):
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
          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-4 py-2">
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
                                    was on break
                                  </Badge>
                                )}
                                {a.previous_team && a.previous_team !== a.team_name && (
                                  <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 bg-blue-500/10 text-blue-600 border-blue-200">
                                    from {a.previous_team}
                                  </Badge>
                                )}
                              </div>
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
