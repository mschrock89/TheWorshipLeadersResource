import { useMemo } from "react";
import { Star, Heart, Zap, Diamond, Mic, Music, Lock, Unlock, Video, Volume2, BookOpen, SlidersHorizontal } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  onAssign: (slot: string, scheduleDate?: string) => void;
  onRemove: (slot: string, scheduleDate?: string) => void;
  onEditMinistry?: (member: TeamMemberAssignment) => void;
  readOnly?: boolean;
  isLocked?: boolean;
  onToggleLock?: () => void;
  canLock?: boolean;
  canEditBroadcast?: boolean;
  canEditAudio?: boolean;
  ministryFilter?: string;
  onEditTemplate?: () => void;
  slotConflictDates?: Record<string, string[]>;
  slotScheduleDates?: string[];
  slotDateOverrides?: Record<string, Record<string, TeamMemberAssignment>>;
  slotDateOverrideConflictDates?: Record<string, Record<string, string[]>>;
  titleOverride?: string;
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
  slotConflictDates = {},
  slotScheduleDates = [],
  slotDateOverrides = {},
  slotDateOverrideConflictDates = {},
  titleOverride,
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
  const bandSlots = useMemo(() => {
    if (ministryFilter !== "worship_night") {
      return templateSlots.bandSlots;
    }

    const worshipNightSlotIds = ["pad", "eg_3", "eg_4"];
    const existingSlotIds = new Set(templateSlots.bandSlots.map((slot) => slot.slot));
    const additionalSlots = worshipNightSlotIds
      .filter((slotId) => !existingSlotIds.has(slotId))
      .map((slotId) => POSITION_SLOTS.find((slot) => slot.slot === slotId))
      .filter((slot): slot is (typeof POSITION_SLOTS)[number] => Boolean(slot));

    return [...templateSlots.bandSlots, ...additionalSlots];
  }, [ministryFilter, templateSlots.bandSlots]);
  const productionSlots = templateSlots.productionSlots;
  const videoSlots = templateSlots.videoSlots;

  // Filter members by ministry type when a specific ministry is selected
  const filteredMembers = members.filter((member) =>
    memberMatchesMinistryFilter(member.ministry_types, ministryFilter)
  );

  const getMemberForSlot = (slot: string) => {
    return filteredMembers.find(m => m.position_slot === slot);
  };

  const renderPositionSlot = ({
    key,
    slotConfig,
    member,
    slotReadOnly,
    allowMinistryEdit,
  }: {
    key: string;
    slotConfig: (typeof POSITION_SLOTS)[number];
    member?: TeamMemberAssignment;
    slotReadOnly: boolean;
    allowMinistryEdit: boolean;
  }) => (
    <PositionSlot
      key={key}
      label={slotConfig.label}
      memberName={member?.member_name}
      avatarUrl={null}
      isEmpty={!member}
      onRemove={() => onRemove(slotConfig.slot)}
      onAdd={() => onAssign(slotConfig.slot)}
      readOnly={slotReadOnly}
      ministryTypes={member?.ministry_types}
      onEditMinistry={member && onEditMinistry && allowMinistryEdit ? () => onEditMinistry(member) : undefined}
      showMinistryBadges={false}
      conflictDates={member ? slotConflictDates[slotConfig.slot] || [] : []}
      scheduleDates={slotScheduleDates}
      dateOverrides={slotDateOverrides[slotConfig.slot] || {}}
      dateOverrideConflictDates={slotDateOverrideConflictDates[slotConfig.slot] || {}}
      onAssignDate={(scheduleDate) => onAssign(slotConfig.slot, scheduleDate)}
      onRemoveDateOverride={(scheduleDate) => onRemove(slotConfig.slot, scheduleDate)}
    />
  );

  const renderSlotGroup = ({
    title,
    icon,
    slots,
    slotReadOnly,
    allowMinistryEdit,
    emptyMessage,
  }: {
    title: string;
    icon: React.ReactNode;
    slots: (typeof POSITION_SLOTS)[number][];
    slotReadOnly: boolean;
    allowMinistryEdit: boolean;
    emptyMessage?: string;
  }) => {
    return (
      <div>
        <div className="flex items-center gap-2 mb-2">
          {icon}
          <h4 className="text-sm font-medium text-muted-foreground">{title}</h4>
          {emptyMessage && <span className="text-xs text-muted-foreground/60">{emptyMessage}</span>}
        </div>
        <div className="grid gap-2">
          {slots.map((slotConfig) => {
            const member = getMemberForSlot(slotConfig.slot);
            return renderPositionSlot({
              key: slotConfig.slot,
              slotConfig,
              member,
              slotReadOnly,
              allowMinistryEdit,
            });
          })}
        </div>
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
  const teamConflictCount = Object.values(slotConflictDates).filter((dates) => dates.length > 0).length;

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
          <span>{titleOverride || team.name}</span>
          
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
            <div className="flex items-center gap-2">
              {teamConflictCount > 0 && (
                <Badge variant="outline" className="border-amber-500/40 bg-amber-500/8 text-amber-700 dark:text-amber-300">
                  {teamConflictCount} conflict{teamConflictCount === 1 ? "" : "s"}
                </Badge>
              )}
              <span className="text-sm font-normal text-muted-foreground">
                {filledCount}/{totalSlots} filled
              </span>
            </div>
          )}
          
          {canLock && (
            <div className="flex items-center gap-2">
              {teamConflictCount > 0 && (
                <Badge variant="outline" className="border-amber-500/40 bg-amber-500/8 text-amber-700 dark:text-amber-300">
                  {teamConflictCount} conflict{teamConflictCount === 1 ? "" : "s"}
                </Badge>
              )}
              <span className="text-sm font-normal text-muted-foreground">
                {filledCount}/{totalSlots}
              </span>
            </div>
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
            emptyMessage: broadcastReadOnly && !isLocked ? "(View only)" : undefined,
          })
        )}
      </CardContent>
    </Card>
  );
}
