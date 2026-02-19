import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useScheduledTeamForDate } from "@/hooks/useScheduledTeamForDate";
import { useTeamRosterForDate } from "@/hooks/useTeamRosterForDate";
import { Mic, Guitar, ArrowRightLeft, Users, Video, Headphones } from "lucide-react";
import { formatPositionLabel, sortPositionsByPriority } from "@/lib/utils";

interface ScheduledTeamRosterProps {
  targetDate: Date;
  ministryType?: string;
  campusId?: string;
}

// Match position names (case-insensitive, supports various formats)
const isVocalPosition = (pos: string) => {
  const lower = pos.toLowerCase();
  return lower.includes("vocal") || lower === "vocals";
};

const isBandPosition = (pos: string) => {
  const lower = pos.toLowerCase();
  const bandKeywords = [
    "guitar", "acoustic", "electric", "bass", "drums", "keys", "piano",
    "violin", "cello", "saxophone", "trumpet", "instrument"
  ];
  return bandKeywords.some(keyword => lower.includes(keyword));
};

const isVideoPosition = (pos: string) => {
  const lower = pos.toLowerCase();
  const videoKeywords = [
    "camera", "director", "broadcast", "stream", "video", "graphics", "propresenter"
  ];
  return videoKeywords.some(keyword => lower.includes(keyword));
};

const isProductionPosition = (pos: string) => {
  const lower = pos.toLowerCase();
  const productionKeywords = [
    "foh", "monitor", "audio", "sound", "lighting", "lights", "stage"
  ];
  return productionKeywords.some(keyword => lower.includes(keyword));
};

interface RosterMember {
  id: string;
  memberName: string;
  positions: string[];
  avatarUrl: string | null;
  isSwapped: boolean;
  originalMemberName?: string;
}

function TeamMemberRow({ member }: { member: RosterMember }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarImage src={member.avatarUrl || undefined} />
        <AvatarFallback className="text-xs bg-muted">
          {member.memberName?.charAt(0) || "?"}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium block truncate">
          {member.memberName}
        </span>
        <div className="flex items-center gap-1 mt-0.5">
          {sortPositionsByPriority(member.positions).map((pos) => (
            <Badge key={pos} variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
              {formatPositionLabel(pos)}
            </Badge>
          ))}
          {member.isSwapped && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-500">
              <ArrowRightLeft className="h-2.5 w-2.5" />
              <span className="text-muted-foreground">for {member.originalMemberName}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function MemberSection({ 
  icon: Icon, 
  title, 
  members, 
  teamColor 
}: { 
  icon: React.ElementType; 
  title: string; 
  members: RosterMember[]; 
  teamColor?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 pb-2 border-b border-border/50">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold">{title}</span>
        <Badge 
          variant="outline" 
          className="text-xs ml-auto"
          style={teamColor ? { borderColor: teamColor, color: teamColor } : undefined}
        >
          {members.length}
        </Badge>
      </div>
      {members.length > 0 ? (
        <div className="divide-y divide-border/30">
          {members.map((member) => (
            <TeamMemberRow key={member.id} member={member} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground py-2">None assigned</p>
      )}
    </div>
  );
}

export function ScheduledTeamRoster({ targetDate, ministryType, campusId }: ScheduledTeamRosterProps) {
  const { data: scheduledTeam, isLoading: teamLoading } = useScheduledTeamForDate(targetDate, campusId);
  
  // For "weekend_team", we want all weekend/production/video members
  // The hook now handles "weekend_team" expansion internally
  const isWeekendTeam = ministryType === 'weekend_team';
  const showProduction = ministryType === "production" || isWeekendTeam;
  const showVideo = ministryType === "video" || isWeekendTeam;
  
  const { data: roster, isLoading: rosterLoading } = useTeamRosterForDate(
    targetDate,
    scheduledTeam?.teamId,
    isWeekendTeam ? 'weekend' : ministryType,
    campusId
  );
  const isLoading = teamLoading || rosterLoading;

  // Filter members and positions by category
  const vocalists = roster?.filter(member => 
    member.positions.some(pos => isVocalPosition(pos))
  ).map(member => ({
    ...member,
    positions: member.positions.filter(pos => isVocalPosition(pos))
  })) || [];

  const bandMembers = roster?.filter(member => 
    member.positions.some(pos => isBandPosition(pos))
  ).map(member => ({
    ...member,
    positions: member.positions.filter(pos => isBandPosition(pos))
  })) || [];

  const videoMembers = roster?.filter(member => 
    member.positions.some(pos => isVideoPosition(pos))
  ).map(member => ({
    ...member,
    positions: member.positions.filter(pos => isVideoPosition(pos))
  })) || [];

  const productionMembers = roster?.filter(member => 
    member.positions.some(pos => isProductionPosition(pos))
  ).map(member => ({
    ...member,
    positions: member.positions.filter(pos => isProductionPosition(pos))
  })) || [];

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center gap-2 mb-3">
            <Users className="h-4 w-4" />
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center gap-2">
                  <Skeleton className="h-7 w-7 rounded-full" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </div>
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center gap-2">
                  <Skeleton className="h-7 w-7 rounded-full" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!scheduledTeam) {
    return (
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="h-4 w-4" />
            <span className="text-sm">No team scheduled for this date</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b">
          <Users className="h-4 w-4" />
          <span className="font-semibold">{scheduledTeam.teamName}</span>
          <Badge 
            variant="outline" 
            className="text-xs"
            style={{ borderColor: scheduledTeam.teamColor, color: scheduledTeam.teamColor }}
          >
            {(vocalists.length + bandMembers.length + (showVideo ? videoMembers.length : 0) + (showProduction ? productionMembers.length : 0))} members
          </Badge>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <MemberSection 
            icon={Mic} 
            title="Vocalists" 
            members={vocalists} 
            teamColor={scheduledTeam.teamColor}
          />
          <MemberSection 
            icon={Guitar} 
            title="Band" 
            members={bandMembers} 
            teamColor={scheduledTeam.teamColor}
          />
          {showProduction && (
            <MemberSection 
              icon={Headphones} 
              title="Production" 
              members={productionMembers} 
              teamColor={scheduledTeam.teamColor}
            />
          )}
          {showVideo && (
            <MemberSection 
              icon={Video} 
              title="Video" 
              members={videoMembers} 
              teamColor={scheduledTeam.teamColor}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
