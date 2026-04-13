import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Star, Heart, Zap, Diamond, Coffee, Mic, Guitar, Calendar, Volume2, Video, BookOpen } from "lucide-react";
import { TeamMemberAssignment, WorshipTeam, POSITION_SLOTS } from "@/hooks/useTeamBuilder";
import { cn } from "@/lib/utils";
import { MINISTRY_SLOT_CATEGORIES, memberMatchesMinistryFilter } from "@/lib/constants";
import { getTeamTemplateSlotConfigs } from "@/lib/teamTemplates";
import { BreakRequestDialog } from "./BreakRequestDialog";
import { BreakRequestsList } from "./BreakRequestsList";
import { useMyBreakRequests } from "@/hooks/useBreakRequests";

const TEAM_ICONS: Record<string, React.ReactNode> = {
  star: <Star className="h-4 w-4" />,
  heart: <Heart className="h-4 w-4" />,
  zap: <Zap className="h-4 w-4" />,
  diamond: <Diamond className="h-4 w-4" />,
};

interface MyTeamViewProps {
  userId: string;
  teams: WorshipTeam[];
  members: TeamMemberAssignment[];
  isLoading: boolean;
  periodName?: string;
  isAdmin?: boolean;
  periods?: Array<{
    id: string;
    name: string;
    is_active: boolean;
    start_date: string;
    end_date: string;
  }>;
  ministryFilter?: string;
  canEditAudio?: boolean;
  canEditBroadcast?: boolean;
}

// Condensed team card for admin view
function CondensedTeamCard({
  team,
  members,
  userId,
  ministryFilter,
  canEditAudio = false,
  canEditBroadcast = false,
  titleOverride,
}: {
  team: WorshipTeam;
  members: TeamMemberAssignment[];
  userId: string;
  ministryFilter: string;
  canEditAudio?: boolean;
  canEditBroadcast?: boolean;
  titleOverride?: string;
}) {
  const allowedCategories =
    MINISTRY_SLOT_CATEGORIES[ministryFilter] || MINISTRY_SLOT_CATEGORIES.all;

  const showVocalists = allowedCategories.includes("Vocalists");
  const showSpeaker = allowedCategories.includes("Speaker");
  const showBand = allowedCategories.includes("Band");
  // Only show Production when explicitly in the allowed categories
  const showProduction = allowedCategories.includes("Production");
  // Only show Video when explicitly in the allowed categories (not when viewing Production)
  const showVideo = allowedCategories.includes("Video");

  const visibleMembers = members.filter((member) =>
    memberMatchesMinistryFilter(member.ministry_types, ministryFilter)
  );

  const templateSlots = getTeamTemplateSlotConfigs(team.template_config);
  const vocalSlots = templateSlots.vocalSlots;
  const speakerSlots = POSITION_SLOTS.filter(s => s.category === "Speaker");
  const bandSlots = templateSlots.bandSlots;
  const productionSlots = POSITION_SLOTS.filter(s => s.category === "Production");
  const videoSlots = templateSlots.videoSlots;

  const visibleSlots = [
    ...(showVocalists ? vocalSlots : []),
    ...(showSpeaker ? speakerSlots : []),
    ...(showBand ? bandSlots : []),
    ...(showProduction ? productionSlots : []),
    ...(showVideo ? videoSlots : []),
  ];

  const getMemberForSlot = (slot: string) =>
    visibleMembers.find(m => m.position_slot === slot);
  const renderSlot = (slotConfig: (typeof POSITION_SLOTS)[0]) => {
    const member = getMemberForSlot(slotConfig.slot);
    if (!member) return null;
    const isMe = member.user_id === userId;

    return (
      <div
        key={slotConfig.slot}
        className={cn(
          "flex items-center gap-2 text-xs py-1 px-2 rounded",
          isMe ? "bg-primary/10" : "",
        )}
      >
        <span className="text-muted-foreground w-16 shrink-0 truncate">{slotConfig.label}:</span>
        <span className={cn("truncate", isMe && "font-medium text-primary")}>
          {member.member_name}
          {isMe && " (You)"}
        </span>
      </div>
    );
  };

  const filledCount = visibleSlots.filter(s => !!getMemberForSlot(s.slot)).length;
  const totalSlots = visibleSlots.length;

  const renderSection = (
    title: string,
    Icon: React.ComponentType<{ className?: string }>,
    slots: (typeof POSITION_SLOTS)[number][],
  ) => (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="h-4 w-4 text-primary" />
        <span className="text-sm font-bold text-primary">{title}</span>
      </div>
      <div className="space-y-0.5">
        {slots.map(renderSlot)}
        {slots.every(s => !getMemberForSlot(s.slot)) && (
          <p className="text-xs text-muted-foreground italic px-2">No {title.toLowerCase()} assigned</p>
        )}
      </div>
    </div>
  );

  return (
    <Card className="overflow-hidden">
      <CardHeader className="py-2 px-3" style={{ backgroundColor: `${team.color}20` }}>
        <CardTitle className="flex items-center gap-2 text-sm">
          <span style={{ color: team.color }}>
            {TEAM_ICONS[team.icon] || <Star className="h-4 w-4" />}
          </span>
          <span>{titleOverride || team.name}</span>
          <span className="ml-auto text-xs font-normal text-muted-foreground">
            {filledCount}/{totalSlots}
          </span>
        </CardTitle>
      </CardHeader>

      <CardContent className="p-3 space-y-2">
        {showVocalists && renderSection("Vocalists", Mic, vocalSlots)}
        {showSpeaker && renderSection("Speaker", BookOpen, speakerSlots)}
        {showBand && renderSection("Band", Guitar, bandSlots)}
        {showProduction && renderSection("Production", Volume2, productionSlots)}
        {showVideo && renderSection("Video", Video, videoSlots)}
      </CardContent>
    </Card>
  );
}

// Full team card for volunteer view (their own team)
function FullTeamCard({
  team,
  members,
  userId,
  periodName,
  myPosition,
  ministryFilter,
  canEditAudio = false,
  canEditBroadcast = false,
  titleOverride,
}: {
  team: WorshipTeam;
  members: TeamMemberAssignment[];
  userId: string;
  periodName?: string;
  myPosition?: string;
  ministryFilter: string;
  canEditAudio?: boolean;
  canEditBroadcast?: boolean;
  titleOverride?: string;
}) {
  const allowedCategories =
    MINISTRY_SLOT_CATEGORIES[ministryFilter] || MINISTRY_SLOT_CATEGORIES.all;

  const showVocalists = allowedCategories.includes("Vocalists");
  const showSpeaker = allowedCategories.includes("Speaker");
  const showBand = allowedCategories.includes("Band");
  // Only show Production when explicitly in the allowed categories
  const showProduction = allowedCategories.includes("Production");
  // Only show Video when explicitly in the allowed categories (not when viewing Production)
  const showVideo = allowedCategories.includes("Video");

  const visibleMembers = members.filter((member) =>
    memberMatchesMinistryFilter(member.ministry_types, ministryFilter)
  );

  const templateSlots = getTeamTemplateSlotConfigs(team.template_config);
  const vocalSlots = templateSlots.vocalSlots;
  const speakerSlots = POSITION_SLOTS.filter(s => s.category === "Speaker");
  const bandSlots = templateSlots.bandSlots;
  const productionSlots = POSITION_SLOTS.filter(s => s.category === "Production");
  const videoSlots = templateSlots.videoSlots;

  const getMemberForSlot = (slot: string) =>
    visibleMembers.find(m => m.position_slot === slot);
  const renderMember = (slotConfig: (typeof POSITION_SLOTS)[0]) => {
    const member = getMemberForSlot(slotConfig.slot);
    if (!member) return null;
    const isMe = member.user_id === userId;

    return (
      <div
        key={slotConfig.slot}
        className={cn(
          "flex items-center gap-3 rounded-lg border p-2",
          isMe ? "border-primary bg-primary/5" : "border-border bg-card",
        )}
      >
        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-primary/10 text-primary text-xs">
            {member.member_name?.
              split(" ")
              .map(n => n[0])
              .join("")
              .slice(0, 2)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium truncate">
              {member.member_name}
              {isMe && <span className="text-primary ml-1">(You)</span>}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">{slotConfig.label}</p>
        </div>
      </div>
    );
  };

  const renderSection = (
    title: string,
    Icon: React.ComponentType<{ className?: string }>,
    slots: (typeof POSITION_SLOTS)[number][],
  ) => (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h4 className="text-sm font-medium text-muted-foreground">{title}</h4>
      </div>
      <div className="grid gap-2">{slots.map(renderMember)}</div>
    </div>
  );

  return (
    <Card className="overflow-hidden">
      <CardHeader className="py-4" style={{ backgroundColor: `${team.color}20` }}>
        <CardTitle className="flex items-center gap-2">
          <span style={{ color: team.color }}>
            {TEAM_ICONS[team.icon] || <Star className="h-5 w-5" />}
          </span>
          <span>Your Team: {titleOverride || team.name}</span>
          {myPosition && (
            <Badge variant="secondary" className="ml-auto">
              {myPosition}
            </Badge>
          )}
        </CardTitle>
        {periodName && (
          <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1">
            <Calendar className="h-3.5 w-3.5" />
            {periodName}
          </p>
        )}
      </CardHeader>

      <CardContent className="p-4 space-y-4">
        {showVocalists && renderSection("Vocalists", Mic, vocalSlots)}
        {showSpeaker && renderSection("Speaker", BookOpen, speakerSlots)}
        {showBand && renderSection("Band", Guitar, bandSlots)}
        {showProduction && renderSection("Production", Volume2, productionSlots)}
        {showVideo && renderSection("Video", Video, videoSlots)}
      </CardContent>
    </Card>
  );
}

export function MyTeamView({
  userId,
  teams,
  members,
  isLoading,
  periodName,
  isAdmin = false,
  periods = [],
  ministryFilter = "all",
  canEditAudio = false,
  canEditBroadcast = false,
}: MyTeamViewProps) {
  const [showBreakDialog, setShowBreakDialog] = useState(false);
  const { data: myBreakRequests = [] } = useMyBreakRequests();
  const isVideoSplitView = ministryFilter === "video";
  const visibleTeamIds = new Set(teams.map((team) => team.id));
  const visibleMembers = members.filter((member) => {
    if (!visibleTeamIds.has(member.team_id)) {
      return false;
    }

    return ministryFilter === "all"
      ? true
      : memberMatchesMinistryFilter(member.ministry_types, ministryFilter);
  });

  const getMembersForServiceDay = (
    teamMembers: TeamMemberAssignment[],
    serviceDay: "saturday" | "sunday" | null,
  ) => {
    if (!serviceDay) return teamMembers;
    return teamMembers.filter((member) => member.service_day === serviceDay);
  };
  const myAssignments = visibleMembers.filter((member) => member.user_id === userId);
  
  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {[1, 2, 3, 4].map(i => (
          <Card key={i}>
            <CardHeader className="py-3">
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (myAssignments.length === 0) {
    if (isAdmin) {
      return (
        <div className="space-y-4">
          {periodName && (
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              {periodName}
            </p>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            {teams.flatMap((team) => {
              const teamMembers = visibleMembers.filter((member) => member.team_id === team.id);
              const cards = isVideoSplitView
                ? [
                    {
                      key: `${team.id}-saturday`,
                      title: `${team.name} Saturday`,
                      members: getMembersForServiceDay(teamMembers, "saturday"),
                    },
                    {
                      key: `${team.id}-sunday`,
                      title: `${team.name} Sunday`,
                      members: getMembersForServiceDay(teamMembers, "sunday"),
                    },
                  ]
                : [
                    {
                      key: team.id,
                      title: team.name,
                      members: teamMembers,
                    },
                  ];

              return cards.map((card) => (
                <CondensedTeamCard
                  key={card.key}
                  team={team}
                  members={card.members}
                  userId={userId}
                  ministryFilter={ministryFilter}
                  canEditAudio={canEditAudio}
                  canEditBroadcast={canEditBroadcast}
                  titleOverride={card.title}
                />
              ));
            })}
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Coffee className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">You're on break this trimester</h3>
            <p className="text-sm text-muted-foreground max-w-md mb-4">
              You're not assigned to any team{periodName ? ` for ${periodName}` : ""}. 
              Enjoy your time off, or contact your campus worship pastor if you'd like to be added.
            </p>
            <Button variant="outline" onClick={() => setShowBreakDialog(true)}>
              <Coffee className="mr-2 h-4 w-4" />
              Request Break for Another Trimester
            </Button>
          </CardContent>
        </Card>

        {myBreakRequests.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground">Your Break Requests</h4>
            <BreakRequestsList requests={myBreakRequests} />
          </div>
        )}

        <BreakRequestDialog
          open={showBreakDialog}
          onOpenChange={setShowBreakDialog}
          periods={periods}
        />
      </div>
    );
  }

  if (isAdmin) {
    return (
      <div className="space-y-4">
        {periodName && (
          <p className="text-sm text-muted-foreground flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            {periodName}
          </p>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          {teams.flatMap((team) => {
            const teamMembers = visibleMembers.filter((member) => member.team_id === team.id);
            const cards = isVideoSplitView
              ? [
                  {
                    key: `${team.id}-saturday`,
                    title: `${team.name} Saturday`,
                    members: getMembersForServiceDay(teamMembers, "saturday"),
                  },
                  {
                    key: `${team.id}-sunday`,
                    title: `${team.name} Sunday`,
                    members: getMembersForServiceDay(teamMembers, "sunday"),
                  },
                ]
              : [
                  {
                    key: team.id,
                    title: team.name,
                    members: teamMembers,
                  },
                ];

            return cards.map((card) => (
              <CondensedTeamCard
                key={card.key}
                team={team}
                members={card.members}
                userId={userId}
                ministryFilter={ministryFilter}
                canEditAudio={canEditAudio}
                canEditBroadcast={canEditBroadcast}
                titleOverride={card.title}
              />
            ));
          })}
        </div>
      </div>
    );
  }

  const myTeamCards = Array.from(
    myAssignments.reduce((acc, assignment) => {
      const serviceDay =
        isVideoSplitView && (assignment.service_day === "saturday" || assignment.service_day === "sunday")
          ? assignment.service_day
          : null;
      const key = `${assignment.team_id}:${serviceDay || "all"}`;
      if (!acc.has(key)) {
        acc.set(key, {
          teamId: assignment.team_id,
          serviceDay,
          myPositions: new Set<string>(),
        });
      }
      acc.get(key)!.myPositions.add(assignment.position);
      return acc;
    }, new Map<string, { teamId: string; serviceDay: "saturday" | "sunday" | null; myPositions: Set<string> }>()),
  );

  return (
    <div className="space-y-6">
      {myTeamCards.map(([key, card]) => {
        const myTeam = teams.find((team) => team.id === card.teamId);
        if (!myTeam) return null;

        const teammates = visibleMembers.filter((member) => member.team_id === card.teamId);
        const visibleTeammates = getMembersForServiceDay(teammates, card.serviceDay);
        const teamTitle =
          card.serviceDay === "saturday"
            ? `${myTeam.name} Saturday`
            : card.serviceDay === "sunday"
              ? `${myTeam.name} Sunday`
              : myTeam.name;

        return (
          <FullTeamCard
            key={key}
            team={myTeam}
            members={visibleTeammates}
            userId={userId}
            periodName={periodName}
            myPosition={Array.from(card.myPositions).join(", ")}
            ministryFilter={ministryFilter}
            canEditAudio={canEditAudio}
            canEditBroadcast={canEditBroadcast}
            titleOverride={teamTitle}
          />
        );
      })}

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => setShowBreakDialog(true)}>
          <Coffee className="mr-2 h-4 w-4" />
          Request Break
        </Button>
      </div>

      {myBreakRequests.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-muted-foreground">Your Break Requests</h4>
          <BreakRequestsList requests={myBreakRequests} />
        </div>
      )}

      <BreakRequestDialog
        open={showBreakDialog}
        onOpenChange={setShowBreakDialog}
        periods={periods}
      />
    </div>
  );
}
