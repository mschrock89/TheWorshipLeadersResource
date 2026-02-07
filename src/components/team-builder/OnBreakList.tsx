import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, Coffee, AlertTriangle, Mic, Music } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AvailableMember, TeamMemberAssignment } from "@/hooks/useTeamBuilder";
import { cn } from "@/lib/utils";

interface OnBreakListProps {
  allMembers: AvailableMember[];
  assignedMembers: TeamMemberAssignment[];
  previousPeriodMembers?: TeamMemberAssignment[];
  historicalMemberIds?: Set<string>;
  isLoading?: boolean;
  periodName?: string;
  campusId?: string | null;
  userCampusMap?: Record<string, { names: string[]; ids: string[] }>;
  ministryFilter?: string;
}

interface PositionGroup {
  category: string;
  icon: React.ReactNode;
  positions: string[];
  members: (AvailableMember & { wasOnBreakBefore: boolean })[];
}

// Tech positions to exclude from the On Break list (until weekend tech schedule is uploaded)
const TECH_POSITIONS = ["sound_tech", "lighting", "media", "broadcast", "other"];

const POSITION_GROUPS = [
  { 
    category: "Vocalists", 
    icon: <Mic className="h-4 w-4" />,
    positions: ["Vocalist", "Vocals", "vocalist"]
  },
  { 
    category: "Drums", 
    icon: <Music className="h-4 w-4" />,
    positions: ["Drums", "drums"]
  },
  { 
    category: "Bass", 
    icon: <Music className="h-4 w-4" />,
    positions: ["Bass", "bass"]
  },
  { 
    category: "Keys", 
    icon: <Music className="h-4 w-4" />,
    positions: ["Keys", "Piano", "keys", "piano"]
  },
  { 
    category: "Electric Guitar", 
    icon: <Music className="h-4 w-4" />,
    positions: ["Electric", "Electric 1", "Electric 2", "electric_guitar", "electric_1", "electric_2"]
  },
  { 
    category: "Acoustic Guitar", 
    icon: <Music className="h-4 w-4" />,
    positions: ["Acoustic", "Acoustic 1", "Acoustic 2", "acoustic_guitar"]
  },
];

export function OnBreakList({
  allMembers,
  assignedMembers,
  previousPeriodMembers = [],
  historicalMemberIds,
  isLoading = false,
  periodName,
  campusId,
  userCampusMap,
  ministryFilter,
}: OnBreakListProps) {
  const [isOpen, setIsOpen] = useState(true);

  // Find members on break (not assigned in current period)
  // Include members who have historical assignments OR have positions defined (active worship team members)
  // Only include members who belong to the selected campus
  // Exclude members who only have tech positions
  const onBreakMembers = useMemo(() => {
    // Filter assigned members by ministry type BEFORE building the set
    // This ensures members assigned to other ministries (e.g., EON) appear in "On Break" when viewing Weekend
    const ministryFilteredAssignedMembers = ministryFilter && ministryFilter !== "all"
      ? assignedMembers.filter(m => m.ministry_types?.includes(ministryFilter))
      : assignedMembers;
    const assignedUserIds = new Set(ministryFilteredAssignedMembers.map(m => m.user_id).filter(Boolean));
    const previousAssignedUserIds = new Set(previousPeriodMembers.map(m => m.user_id).filter(Boolean));
    
    // Check if this is T1 2026 (the start of history) - no consecutive breaks before this
    const isFirstHistoricalPeriod = periodName?.includes("T1 2026");
    // Also consider it first period if there's no previous period data to compare
    const hasPreviousPeriodData = previousPeriodMembers.length > 0;

    return allMembers
      .filter(m => {
        // Must belong to the selected campus if campusId is provided
        if (campusId && userCampusMap) {
          const memberCampuses = userCampusMap[m.id];
          if (!memberCampuses || !memberCampuses.ids.includes(campusId)) {
            return false;
          }
        }
        // Must not be currently assigned
        if (assignedUserIds.has(m.id)) return false;
        // Include if they have historical assignments OR if they have positions (active worship team members)
        const hasHistoricalAssignment = historicalMemberIds?.has(m.id);
        const hasPositions = m.positions && m.positions.length > 0;
        if (!hasHistoricalAssignment && !hasPositions) return false;
        
        // Exclude members who ONLY have tech positions
        if (m.positions && m.positions.length > 0) {
          const hasNonTechPosition = m.positions.some(p => !TECH_POSITIONS.includes(p));
          if (!hasNonTechPosition) return false;
        }
        
        return true;
      })
      .map(m => ({
        ...m,
        // Only flag as consecutive break if we have previous period data AND it's not the first historical period
        wasOnBreakBefore: hasPreviousPeriodData && !isFirstHistoricalPeriod && !previousAssignedUserIds.has(m.id),
      }));
  }, [allMembers, assignedMembers, previousPeriodMembers, historicalMemberIds, campusId, userCampusMap, periodName]);

  // Filter by ministry type for display (after computing who is on break)
  const filteredOnBreakMembers = useMemo(() => {
    if (!ministryFilter || ministryFilter === "all") return onBreakMembers;
    return onBreakMembers.filter(m => 
      m.ministry_types?.includes(ministryFilter)
    );
  }, [onBreakMembers, ministryFilter]);

  // Group by position category
  const groupedMembers = useMemo(() => {
    const groups: PositionGroup[] = POSITION_GROUPS.map(pg => ({
      ...pg,
      members: [],
    }));

    for (const member of filteredOnBreakMembers) {
      for (const group of groups) {
        if (member.positions.some(p => group.positions.includes(p))) {
          group.members.push(member);
          break;
        }
      }
    }

    return groups.filter(g => g.members.length > 0);
  }, [filteredOnBreakMembers]);

  const totalOnBreak = filteredOnBreakMembers.length;
  const consecutiveBreakCount = filteredOnBreakMembers.filter(m => m.wasOnBreakBefore).length;

  if (isLoading) {
    return null;
  }

  // Show empty state if no team schedule has been built yet
  if (assignedMembers.length === 0) {
    return (
      <Card className="mt-6">
        <CardHeader className="py-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Coffee className="h-4 w-4 text-muted-foreground" />
            <span>On Break This Trimester</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm text-muted-foreground">
            Build the {periodName || "trimester"} schedule to see who's on break.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (totalOnBreak === 0) {
    return (
      <Card className="mt-6">
        <CardHeader className="py-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Coffee className="h-4 w-4 text-muted-foreground" />
            <span>On Break This Trimester</span>
            <Badge variant="secondary" className="ml-1">0</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm text-muted-foreground">
            Everyone is scheduled for {periodName || "this trimester"}! 🎉
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mt-6">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardHeader className="py-3">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between p-0 h-auto hover:bg-transparent">
              <CardTitle className="flex items-center gap-2 text-base">
                <Coffee className="h-4 w-4 text-muted-foreground" />
                <span>On Break This Trimester</span>
                <Badge variant="secondary" className="ml-1">
                  {totalOnBreak}
                </Badge>
                {consecutiveBreakCount > 0 && (
                  <Badge variant="outline" className="ml-1 gap-1 text-amber-600 border-amber-300">
                    <AlertTriangle className="h-3 w-3" />
                    {consecutiveBreakCount} consecutive
                  </Badge>
                )}
              </CardTitle>
              {isOpen ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </Button>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            {groupedMembers.map(group => (
              <div key={group.category}>
                <div className="flex items-center gap-2 mb-2">
                  {group.icon}
                  <h4 className="text-sm font-medium text-muted-foreground">
                    {group.category}
                  </h4>
                  <Badge variant="outline" className="text-xs">
                    {group.members.length}
                  </Badge>
                </div>
                <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                  {group.members.map(member => (
                    <div
                      key={member.id}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border p-2 text-sm",
                        member.wasOnBreakBefore 
                          ? "border-amber-300 bg-amber-50 dark:bg-amber-950/20" 
                          : "border-border bg-card"
                      )}
                    >
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={member.avatar_url || undefined} />
                        <AvatarFallback className="text-[10px] bg-muted">
                          {member.full_name?.split(" ").map(n => n[0]).join("").slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="truncate flex-1">{member.full_name}</span>
                      {member.wasOnBreakBefore && (
                        <span title="Consecutive break - was also on break last trimester">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
