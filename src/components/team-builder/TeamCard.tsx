import { Star, Heart, Zap, Diamond, Mic, Music, Lock, Unlock, Video, Volume2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PositionSlot } from "./PositionSlot";
import {
  POSITION_SLOTS,
  TeamMemberAssignment,
  AvailableMember,
} from "@/hooks/useTeamBuilder";
import { MINISTRY_SLOT_CATEGORIES } from "@/lib/constants";

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
  onAssign: (slot: string) => void;
  onRemove: (slot: string) => void;
  onEditMinistry?: (member: TeamMemberAssignment) => void;
  readOnly?: boolean;
  isLocked?: boolean;
  onToggleLock?: () => void;
  canLock?: boolean;
  canEditBroadcast?: boolean;
  canEditAudio?: boolean;
  ministryFilter?: string;
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
}: TeamCardProps) {
  // Get allowed categories for this ministry type
  const allowedCategories = MINISTRY_SLOT_CATEGORIES[ministryFilter] || MINISTRY_SLOT_CATEGORIES.all;
  
  const showVocalists = allowedCategories.includes("Vocalists");
  const showBand = allowedCategories.includes("Band");
  // Only show Production/Video when they are in the allowed categories for the selected ministry filter
  const showProduction = allowedCategories.includes("Production");
  const showVideo = allowedCategories.includes("Video");

  const vocalSlots = POSITION_SLOTS.filter(s => s.category === "Vocalists");
  const bandSlots = POSITION_SLOTS.filter(s => s.category === "Band");
  const productionSlots = POSITION_SLOTS.filter(s => s.category === "Production");
  const videoSlots = POSITION_SLOTS.filter(s => s.category === "Video");

  // Filter members by ministry type when a specific ministry is selected
  const filteredMembers = ministryFilter === "all" 
    ? members 
    : members.filter(m => m.ministry_types?.includes(ministryFilter));

  const getMemberForSlot = (slot: string) => {
    return filteredMembers.find(m => m.position_slot === slot);
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
          
          {/* Lock indicator/button */}
          {canLock && onToggleLock && (
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto h-8 w-8"
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
          
          {!canLock && (
            <span className="ml-auto text-sm font-normal text-muted-foreground">
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
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Mic className="h-4 w-4 text-muted-foreground" />
              <h4 className="text-sm font-medium text-muted-foreground">
                Vocalists
              </h4>
            </div>
            <div className="grid gap-2">
              {vocalSlots.map(slotConfig => {
                const member = getMemberForSlot(slotConfig.slot);
                return (
                  <PositionSlot
                    key={slotConfig.slot}
                    label={slotConfig.label}
                    memberName={member?.member_name}
                    avatarUrl={null}
                    isEmpty={!member}
                    onRemove={() => onRemove(slotConfig.slot)}
                    onAdd={() => onAssign(slotConfig.slot)}
                    readOnly={effectiveReadOnly}
                    ministryTypes={member?.ministry_types}
                    onEditMinistry={member && onEditMinistry ? () => onEditMinistry(member) : undefined}
                    showMinistryBadges={false}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Band Section */}
        {showBand && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Music className="h-4 w-4 text-muted-foreground" />
              <h4 className="text-sm font-medium text-muted-foreground">Band</h4>
            </div>
            <div className="grid gap-2">
              {bandSlots.map(slotConfig => {
                const member = getMemberForSlot(slotConfig.slot);
                return (
                  <PositionSlot
                    key={slotConfig.slot}
                    label={slotConfig.label}
                    memberName={member?.member_name}
                    avatarUrl={null}
                    isEmpty={!member}
                    onRemove={() => onRemove(slotConfig.slot)}
                    onAdd={() => onAssign(slotConfig.slot)}
                    readOnly={effectiveReadOnly}
                    ministryTypes={member?.ministry_types}
                    onEditMinistry={member && onEditMinistry ? () => onEditMinistry(member) : undefined}
                    showMinistryBadges={false}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Production Section */}
        {showProduction && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Volume2 className="h-4 w-4 text-muted-foreground" />
              <h4 className="text-sm font-medium text-muted-foreground">Production</h4>
              {productionReadOnly && !isLocked && (
                <span className="text-xs text-muted-foreground/60">(View only)</span>
              )}
            </div>
            <div className="grid gap-2">
              {productionSlots.map(slotConfig => {
                const member = getMemberForSlot(slotConfig.slot);
                return (
                  <PositionSlot
                    key={slotConfig.slot}
                    label={slotConfig.label}
                    memberName={member?.member_name}
                    avatarUrl={null}
                    isEmpty={!member}
                    onRemove={() => onRemove(slotConfig.slot)}
                    onAdd={() => onAssign(slotConfig.slot)}
                    readOnly={productionReadOnly}
                    ministryTypes={member?.ministry_types}
                    onEditMinistry={member && onEditMinistry && canEditAudio ? () => onEditMinistry(member) : undefined}
                    showMinistryBadges={false}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Video Section - Split by Saturday/Sunday */}
        {showVideo && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Video className="h-4 w-4 text-muted-foreground" />
              <h4 className="text-sm font-medium text-muted-foreground">Video</h4>
              {broadcastReadOnly && !isLocked && (
                <span className="text-xs text-muted-foreground/60">(View only)</span>
              )}
            </div>
            
            {/* Check if we have any service_day assignments */}
            {(() => {
              const saturdayMembers = filteredMembers.filter(m => m.service_day === 'saturday');
              const sundayMembers = filteredMembers.filter(m => m.service_day === 'sunday');
              const hasSplitDays = saturdayMembers.length > 0 || sundayMembers.length > 0;

              if (hasSplitDays) {
                // Two-column layout for Saturday/Sunday
                return (
                  <div className="grid grid-cols-2 gap-4">
                    {/* Saturday Column */}
                    <div>
                      <h5 className="text-xs font-medium text-muted-foreground mb-2 text-center border-b pb-1">Saturday</h5>
                      <div className="grid gap-2">
                        {videoSlots.map(slotConfig => {
                          const member = saturdayMembers.find(m => m.position_slot === slotConfig.slot);
                          return (
                            <PositionSlot
                              key={`sat-${slotConfig.slot}`}
                              label={slotConfig.label}
                              memberName={member?.member_name}
                              avatarUrl={null}
                              isEmpty={!member}
                              onRemove={() => onRemove(slotConfig.slot)}
                              onAdd={() => onAssign(slotConfig.slot)}
                              readOnly={broadcastReadOnly}
                              ministryTypes={member?.ministry_types}
                              onEditMinistry={member && onEditMinistry && canEditBroadcast ? () => onEditMinistry(member) : undefined}
                              showMinistryBadges={false}
                            />
                          );
                        })}
                      </div>
                    </div>
                    
                    {/* Sunday Column */}
                    <div>
                      <h5 className="text-xs font-medium text-muted-foreground mb-2 text-center border-b pb-1">Sunday</h5>
                      <div className="grid gap-2">
                        {videoSlots.map(slotConfig => {
                          const member = sundayMembers.find(m => m.position_slot === slotConfig.slot);
                          return (
                            <PositionSlot
                              key={`sun-${slotConfig.slot}`}
                              label={slotConfig.label}
                              memberName={member?.member_name}
                              avatarUrl={null}
                              isEmpty={!member}
                              onRemove={() => onRemove(slotConfig.slot)}
                              onAdd={() => onAssign(slotConfig.slot)}
                              readOnly={broadcastReadOnly}
                              ministryTypes={member?.ministry_types}
                              onEditMinistry={member && onEditMinistry && canEditBroadcast ? () => onEditMinistry(member) : undefined}
                              showMinistryBadges={false}
                            />
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              }

              // Fallback: no service_day split, show single column
              return (
                <div className="grid gap-2">
                  {videoSlots.map(slotConfig => {
                    const member = getMemberForSlot(slotConfig.slot);
                    return (
                      <PositionSlot
                        key={slotConfig.slot}
                        label={slotConfig.label}
                        memberName={member?.member_name}
                        avatarUrl={null}
                        isEmpty={!member}
                        onRemove={() => onRemove(slotConfig.slot)}
                        onAdd={() => onAssign(slotConfig.slot)}
                        readOnly={broadcastReadOnly}
                        ministryTypes={member?.ministry_types}
                        onEditMinistry={member && onEditMinistry && canEditBroadcast ? () => onEditMinistry(member) : undefined}
                        showMinistryBadges={false}
                      />
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
