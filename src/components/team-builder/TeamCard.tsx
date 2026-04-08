import { Star, Heart, Zap, Diamond, Mic, Music, Lock, Unlock, Video, Volume2, BookOpen, SlidersHorizontal } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PositionSlot } from "./PositionSlot";
import {
  POSITION_SLOTS,
  TeamMemberAssignment,
  AvailableMember,
} from "@/hooks/useTeamBuilder";
import { MINISTRY_SLOT_CATEGORIES, memberMatchesMinistryFilter } from "@/lib/constants";
import { getTeamTemplateSlotConfigs } from "@/lib/teamTemplates";

const TEAM_ICONS: Record<string, React.ReactNode> = {
  star: <Star className="h-5 w-5" />,
  heart: <Heart className="h-5 w-5" />,
  zap: <Zap className="h-5 w-5" />,
  diamond: <Diamond className="h-5 w-5" />,
};

interface TeamCardProps {
  team: {
    id: string;
    name: string;
    color: string;
    icon: string;
  };
  members: TeamMemberAssignment[];
  availableMembers: AvailableMember[];
  onAssign: (slot: string, serviceDay?: "saturday" | "sunday" | null) => void;
  onRemove: (slot: string, serviceDay?: "saturday" | "sunday" | null) => void;
  onEditMinistry?: (member: TeamMemberAssignment) => void;
  readOnly?: boolean;
  isLocked?: boolean;
  onToggleLock?: () => void;
  canLock?: boolean;
  canEditBroadcast?: boolean;
  canEditAudio?: boolean;
  ministryFilter?: string;
  onEditTemplate?: () => void;
  canSplitWeekendSlots?: boolean;
}

export function TeamCard({
  team,
  members,
  onAssign,
  onRemove,
  onEditMinistry,
  readOnly = false,
  isLocked = false,
  onToggleLock,
  canLock = false,
  canEditBroadcast = false,
  canEditAudio = false,
  ministryFilter = "all",
  onEditTemplate,
  canSplitWeekendSlots = false,
}: TeamCardProps) {
  // Get allowed categories for this ministry type
  const allowedCategories = MINISTRY_SLOT_CATEGORIES[ministryFilter] || MINISTRY_SLOT_CATEGORIES.all;
  
  const showVocalists = allowedCategories.includes("Vocalists");
  const showSpeaker = allowedCategories.includes("Speaker");
  const showBand = allowedCategories.includes("Band");
  // Only show Production/Video when they are in the allowed categories for the selected ministry filter
  const showProduction = allowedCategories.includes("Production");
  const showVideo = allowedCategories.includes("Video");

  const templateSlots = getTeamTemplateSlotConfigs(team.template_config);
  const vocalSlots = templateSlots.vocalSlots;
  const speakerSlots = POSITION_SLOTS.filter(s => s.category === "Speaker");
  const bandSlots = templateSlots.bandSlots;
  const productionSlots = POSITION_SLOTS.filter(s => s.category === "Production");
  const videoSlots = POSITION_SLOTS.filter(s => s.category === "Video");

  // Filter members by ministry type when a specific ministry is selected
  const filteredMembers = members.filter((member) =>
    memberMatchesMinistryFilter(member.ministry_types, ministryFilter)
  );

  const getMemberForSlot = (slot: string) => {
    return filteredMembers.find(m => m.position_slot === slot);
  };

  const getMembersForSlot = (slot: string) => {
    return filteredMembers.filter((member) => member.position_slot === slot);
  };

  const getMemberForSlotAndDay = (slot: string, serviceDay: "saturday" | "sunday") => {
    const slotMembers = getMembersForSlot(slot);
    return (
      slotMembers.find((member) => member.service_day === serviceDay) ||
      slotMembers.find((member) => !member.service_day)
    );
  };

  const isWeekendSplitEligible = canSplitWeekendSlots && ministryFilter === "weekend";

  const renderPositionSlot = ({
    key,
    slotConfig,
    member,
    serviceDay = null,
    slotReadOnly,
    allowMinistryEdit,
    allowSplitActions = false,
  }: {
    key: string;
    slotConfig: (typeof POSITION_SLOTS)[number];
    member?: TeamMemberAssignment;
    serviceDay?: "saturday" | "sunday" | null;
    slotReadOnly: boolean;
    allowMinistryEdit: boolean;
    allowSplitActions?: boolean;
  }) => (
    <PositionSlot
      key={key}
      label={
        serviceDay
          ? `${slotConfig.label} (${serviceDay === "saturday" ? "Sat" : "Sun"})`
          : slotConfig.label
      }
      memberName={member?.member_name}
      avatarUrl={null}
      isEmpty={!member}
      onRemove={() => onRemove(slotConfig.slot, member ? member.service_day : serviceDay)}
      onAdd={() => onAssign(slotConfig.slot, serviceDay)}
      addActions={
        !member && allowSplitActions
          ? [
              { label: "Both", onClick: () => onAssign(slotConfig.slot, null) },
              { label: "Sat", onClick: () => onAssign(slotConfig.slot, "saturday") },
              { label: "Sun", onClick: () => onAssign(slotConfig.slot, "sunday") },
            ]
          : undefined
      }
      readOnly={slotReadOnly}
      ministryTypes={member?.ministry_types}
      onEditMinistry={member && onEditMinistry && allowMinistryEdit ? () => onEditMinistry(member) : undefined}
      showMinistryBadges={false}
    />
  );

  const renderSlotGroup = ({
    title,
    icon,
    slots,
    slotReadOnly,
    allowMinistryEdit,
    splitEligible = false,
    emptyMessage,
  }: {
    title: string;
    icon: React.ReactNode;
    slots: (typeof POSITION_SLOTS)[number][];
    slotReadOnly: boolean;
    allowMinistryEdit: boolean;
    splitEligible?: boolean;
    emptyMessage?: string;
  }) => {
    const sectionMembers = filteredMembers.filter((member) =>
      slots.some((slotConfig) => slotConfig.slot === member.position_slot)
    );
    const hasSplitDays = splitEligible && sectionMembers.some((member) => Boolean(member.service_day));

    return (
      <div>
        <div className="flex items-center gap-2 mb-2">
          {icon}
          <h4 className="text-sm font-medium text-muted-foreground">{title}</h4>
          {emptyMessage && <span className="text-xs text-muted-foreground/60">{emptyMessage}</span>}
        </div>
        {hasSplitDays ? (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h5 className="text-xs font-medium text-muted-foreground mb-2 text-center border-b pb-1">Saturday</h5>
              <div className="grid gap-2">
                {slots.map((slotConfig) =>
                  renderPositionSlot({
                    key: `sat-${slotConfig.slot}`,
                    slotConfig,
                    member: getMemberForSlotAndDay(slotConfig.slot, "saturday"),
                    serviceDay: "saturday",
                    slotReadOnly,
                    allowMinistryEdit,
                  }),
                )}
              </div>
            </div>
            <div>
              <h5 className="text-xs font-medium text-muted-foreground mb-2 text-center border-b pb-1">Sunday</h5>
              <div className="grid gap-2">
                {slots.map((slotConfig) =>
                  renderPositionSlot({
                    key: `sun-${slotConfig.slot}`,
                    slotConfig,
                    member: getMemberForSlotAndDay(slotConfig.slot, "sunday"),
                    serviceDay: "sunday",
                    slotReadOnly,
                    allowMinistryEdit,
                  }),
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="grid gap-2">
            {slots.map((slotConfig) => {
              const member = getMemberForSlot(slotConfig.slot);
              return renderPositionSlot({
                key: slotConfig.slot,
                slotConfig,
                member,
                slotReadOnly,
                allowMinistryEdit,
                allowSplitActions: splitEligible,
              });
            })}
          </div>
        )}
      </div>
    );
  };

  // If locked, treat as read-only
  const effectiveReadOnly = readOnly || isLocked;
  // Production section is only editable by production managers (or admins via canEditAudio)
  const productionReadOnly = !canEditAudio || isLocked;
  // Broadcast section is only editable by video directors (or admins via canEditBroadcast)
  const broadcastReadOnly = !canEditBroadcast || isLocked;

  // Calculate total slots based on what's visible
  const visibleSlots = [
    ...(showVocalists ? vocalSlots : []),
    ...(showSpeaker ? speakerSlots : []),
    ...(showBand ? bandSlots : []),
    ...(showProduction ? productionSlots : []),
    ...(showVideo ? videoSlots : []),
  ];
  const totalSlots = visibleSlots.length;
  
  // Count filled slots only from visible categories
  const filledCount = visibleSlots.filter(slot => getMemberForSlot(slot.slot)).length;

  return (
    <Card className={`overflow-hidden ${isLocked ? "opacity-80" : ""}`}>
      <CardHeader
        className="py-3"
        style={{ backgroundColor: `${team.color}20` }}
      >
        <CardTitle className="flex items-center gap-2 text-lg">
          <span style={{ color: team.color }}>
            {TEAM_ICONS[team.icon] || <Star className="h-5 w-5" />}
          </span>
          <span>{team.name}</span>
          
          <div className="ml-auto flex items-center gap-1">
            {onEditTemplate && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onEditTemplate}
                title="Edit team template"
              >
                <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
              </Button>
            )}

            {canLock && onToggleLock && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onToggleLock}
                title={isLocked ? "Unlock team" : "Lock team"}
              >
                {isLocked ? (
                  <Lock className="h-4 w-4 text-primary" />
                ) : (
                  <Unlock className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            )}
          </div>
          
          {!canLock && (
            <span className="text-sm font-normal text-muted-foreground">
              {filledCount}/{totalSlots} filled
            </span>
          )}
          
          {canLock && (
            <span className="text-sm font-normal text-muted-foreground">
              {filledCount}/{totalSlots}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        {/* Vocalists Section */}
        {showVocalists && (
          renderSlotGroup({
            title: "Vocalists",
            icon: <Mic className="h-4 w-4 text-muted-foreground" />,
            slots: vocalSlots,
            slotReadOnly: effectiveReadOnly,
            allowMinistryEdit: true,
            splitEligible: isWeekendSplitEligible,
          })
        )}

        {/* Band Section */}
        {showSpeaker && (
          renderSlotGroup({
            title: "Speaker",
            icon: <BookOpen className="h-4 w-4 text-muted-foreground" />,
            slots: speakerSlots,
            slotReadOnly: effectiveReadOnly,
            allowMinistryEdit: true,
            splitEligible: isWeekendSplitEligible,
          })
        )}

        {/* Band Section */}
        {showBand && (
          renderSlotGroup({
            title: "Band",
            icon: <Music className="h-4 w-4 text-muted-foreground" />,
            slots: bandSlots,
            slotReadOnly: effectiveReadOnly,
            allowMinistryEdit: true,
            splitEligible: isWeekendSplitEligible,
          })
        )}

        {/* Production Section */}
        {showProduction && (
          renderSlotGroup({
            title: "Production",
            icon: <Volume2 className="h-4 w-4 text-muted-foreground" />,
            slots: productionSlots,
            slotReadOnly: productionReadOnly,
            allowMinistryEdit: canEditAudio,
            emptyMessage: productionReadOnly && !isLocked ? "(View only)" : undefined,
          })
        )}

        {/* Video Section - Split by Saturday/Sunday */}
        {showVideo && (
          renderSlotGroup({
            title: "Video",
            icon: <Video className="h-4 w-4 text-muted-foreground" />,
            slots: videoSlots,
            slotReadOnly: broadcastReadOnly,
            allowMinistryEdit: canEditBroadcast,
            splitEligible: true,
            emptyMessage: broadcastReadOnly && !isLocked ? "(View only)" : undefined,
          })
        )}
      </CardContent>
    </Card>
  );
}
