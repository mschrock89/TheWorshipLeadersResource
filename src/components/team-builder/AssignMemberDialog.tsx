import { useState, useMemo } from "react";
import { Search, Users, AlertTriangle } from "lucide-react";
import { format, parseISO } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { AvailableMember, POSITION_SLOTS } from "@/hooks/useTeamBuilder";
import {
  POSITION_LABELS,
  MINISTRY_TYPES,
  memberMatchesMinistryFilter,
  resolveTeamBuilderSlotMinistryType,
} from "@/lib/constants";
import { VocalSlotGender } from "@/lib/teamTemplates";

interface AssignMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slot: string;
  teamName: string;
  members: AvailableMember[];
  blackoutConflictDatesByMember?: Record<string, string[]>;
  onSelect: (member: AvailableMember, ministryTypes: string[]) => void;
  ministryFilter?: string;
  requiredGender?: VocalSlotGender | null;
  scheduleDate?: string;
}

export function AssignMemberDialog({
  open,
  onOpenChange,
  slot,
  teamName,
  members,
  blackoutConflictDatesByMember = {},
  onSelect,
  ministryFilter,
  requiredGender,
  scheduleDate,
}: AssignMemberDialogProps) {
  const [search, setSearch] = useState("");
  const [selectedMember, setSelectedMember] = useState<AvailableMember | null>(null);
  const [selectedMinistries, setSelectedMinistries] = useState<string[]>([]);

  const slotConfig = POSITION_SLOTS.find(s => s.slot === slot);
  const slotLabel = slotConfig?.label || slot;
  const effectiveMinistryFilter = resolveTeamBuilderSlotMinistryType(ministryFilter, slot);
  const visibleMinistryOptions = useMemo(
    () => {
      const seen = new Set<string>();

      return MINISTRY_TYPES.filter((ministry) => {
        const normalizedValue =
          ministry.value === "weekend_team" || ministry.value === "sunday_am"
            ? "weekend"
            : ministry.value;

        if (seen.has(normalizedValue)) {
          return false;
        }

        if ("hidden" in ministry && ministry.hidden) {
          return false;
        }

        seen.add(normalizedValue);
        return true;
      }).map((ministry) => (
        ministry.value === "weekend_team"
          ? { ...ministry, value: "weekend", shortLabel: "WKD" }
          : ministry
      ));
    },
    []
  );

  const normalizeSelectedMinistry = (value: string) =>
    value === "weekend_team" || value === "sunday_am" ? "weekend" : value;

  const formatConflictDates = (dates: string[]) => {
    const formatted = dates.map((date) => {
      try {
        return format(parseISO(date), "MMM d");
      } catch {
        return date;
      }
    });

    if (formatted.length <= 3) {
      return formatted.join(", ");
    }

    return `${formatted.slice(0, 3).join(", ")} +${formatted.length - 3} more`;
  };

  // Check if a member's positions match the slot
  const matchesPosition = (positions: string[], slotType: string): boolean => {
    return positions.some(p => {
      const pLower = p.toLowerCase();
      // Vocalist slots
      if (slotType === "vocalist") return pLower.includes("vocal");
      // Speaker slots
      if (slotType === "teacher") return pLower === "teacher";
      if (slotType === "announcement") return pLower === "announcement" || pLower === "annoucement";
      if (slotType === "closing_prayer") return pLower === "closing_prayer" || pLower.includes("closing prayer");
      // Band slots
      if (slotType === "drums") return pLower === "drums";
      if (slotType === "bass") return pLower === "bass";
      if (slotType === "keys") return pLower === "keys" || pLower === "piano";
      if (slotType === "eg") return pLower.includes("electric");
      if (slotType === "ag") return pLower.includes("acoustic");
      // Audio slots
      if (slotType === "foh") return pLower === "sound_tech" || pLower.includes("foh") || pLower.includes("sound");
      if (slotType === "mon") return pLower === "mon" || pLower.includes("monitor") || pLower.includes("sound");
      if (slotType === "audio_shadow") return pLower === "audio_shadow" || pLower.includes("shadow") || pLower.includes("sound");
      if (slotType === "lighting") return pLower === "lighting" || pLower.includes("light");
      if (slotType === "propresenter") return pLower === "media" || pLower.includes("propresenter") || pLower.includes("pro presenter") || pLower.includes("lyrics");
      // Video slots
      if (slotType === "tri_pod_camera") return pLower === "tri_pod_camera" || pLower.includes("tripod") || pLower.includes("tri-pod") || pLower.includes("camera") || pLower === "broadcast";
      if (slotType === "hand_held_camera") return pLower === "hand_held_camera" || pLower.includes("handheld") || pLower.includes("hand-held") || pLower.includes("hand held") || pLower === "broadcast";
      if (slotType === "camera") return pLower.includes("camera") || pLower === "broadcast";
      if (slotType === "director") return pLower === "director" || pLower === "broadcast";
      if (slotType === "graphics") return pLower === "graphics" || pLower === "broadcast";
      if (slotType === "producer") return pLower === "producer" || pLower === "broadcast";
      if (slotType === "switcher") return pLower === "switcher" || pLower === "broadcast";
      return false;
    });
  };

  // Filter and sort members
  const relevantMembers = useMemo(() => {
    const slotType = slot.replace(/_\d$/, ""); // Remove number suffix
    
    return members
      .filter(m => {
        // Match search
        if (search && !m.full_name.toLowerCase().includes(search.toLowerCase())) {
          return false;
        }
        if (requiredGender) {
          const memberGender = m.gender?.trim().toLowerCase();
          if (memberGender !== requiredGender) {
            return false;
          }
        }
        // Match position
        return matchesPosition(m.positions, slotType);
      })
      .map(m => {
        // Check if member has the ministry type
        const hasMinistry = effectiveMinistryFilter
          ? memberMatchesMinistryFilter(m.ministry_types, effectiveMinistryFilter)
          : true;
        const conflictDates = blackoutConflictDatesByMember[m.id] || [];
        return { ...m, hasMinistry, conflictDates };
      })
      .sort((a, b) => {
        // Sort: members with matching ministry first, then alphabetically
        if (a.hasMinistry && !b.hasMinistry) return -1;
        if (!a.hasMinistry && b.hasMinistry) return 1;
        if (a.conflictDates.length === 0 && b.conflictDates.length > 0) return -1;
        if (a.conflictDates.length > 0 && b.conflictDates.length === 0) return 1;
        return a.full_name.localeCompare(b.full_name);
      });
  }, [members, search, slot, effectiveMinistryFilter, requiredGender, blackoutConflictDatesByMember]);

  const matchingMinistryCount = relevantMembers.filter(m => m.hasMinistry).length;
  const otherCount = relevantMembers.length - matchingMinistryCount;

  const handleMemberClick = (member: AvailableMember) => {
    if (effectiveMinistryFilter) {
      onSelect(member, [normalizeSelectedMinistry(effectiveMinistryFilter)]);
      onOpenChange(false);
      setSearch("");
      setSelectedMember(null);
      setSelectedMinistries([]);
      return;
    }

    setSelectedMember(member);
    // Pre-select the current ministry filter, and any ministries the member already has
    const initialMinistries = new Set<string>();
    if (effectiveMinistryFilter) {
      initialMinistries.add(normalizeSelectedMinistry(effectiveMinistryFilter));
    }
    member.ministry_types?.forEach(mt => initialMinistries.add(normalizeSelectedMinistry(mt)));
    setSelectedMinistries(Array.from(initialMinistries));
  };

  const handleConfirm = () => {
    if (selectedMember && selectedMinistries.length > 0) {
      onSelect(selectedMember, selectedMinistries);
      onOpenChange(false);
      setSearch("");
      setSelectedMember(null);
      setSelectedMinistries([]);
    }
  };

  const handleBack = () => {
    setSelectedMember(null);
    setSelectedMinistries([]);
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      setSearch("");
      setSelectedMember(null);
      setSelectedMinistries([]);
    }
    onOpenChange(open);
  };

  const toggleMinistry = (value: string) => {
    const normalizedValue = normalizeSelectedMinistry(value);
    setSelectedMinistries(prev => 
      prev.includes(normalizedValue) 
        ? prev.filter(m => m !== normalizedValue)
        : [...prev, normalizedValue]
    );
  };

  const ministryLabel = effectiveMinistryFilter === 'weekend' ? 'Weekend Worship'
    : effectiveMinistryFilter === 'eon' ? 'EON'
    : effectiveMinistryFilter === 'encounter' ? 'Encounter'
    : effectiveMinistryFilter || 'All';
  const scheduleDateLabel = scheduleDate ? format(parseISO(scheduleDate), "MMM d") : null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {selectedMember 
              ? `Select Ministries for ${selectedMember.full_name}`
              : scheduleDateLabel
              ? `Assign ${slotLabel} for ${scheduleDateLabel} to ${teamName}`
              : `Assign ${slotLabel} to ${teamName}`
            }
          </DialogTitle>
        </DialogHeader>

        {!selectedMember ? (
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search members..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            {effectiveMinistryFilter && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="h-4 w-4" />
                <span>{matchingMinistryCount} {ministryLabel} members</span>
                {otherCount > 0 && (
                  <span className="text-muted-foreground/60">• {otherCount} others</span>
                )}
                {requiredGender && (
                  <span className="text-muted-foreground/60">
                    • {requiredGender === "male" ? "Male" : "Female"} only
                  </span>
                )}
              </div>
            )}

            <ScrollArea className="h-[300px]">
              <div className="space-y-1 pr-4">
                {relevantMembers.map((member, index) => {
                  // Add separator before "other" members
                  const showSeparator = effectiveMinistryFilter &&
                    index > 0 && 
                    relevantMembers[index - 1].hasMinistry && 
                    !member.hasMinistry;

                  return (
                    <div key={member.id}>
                      {showSeparator && (
                        <div className="flex items-center gap-2 py-2 mt-2">
                          <div className="h-px flex-1 bg-border" />
                          <span className="text-xs text-muted-foreground">Other available members</span>
                          <div className="h-px flex-1 bg-border" />
                        </div>
                      )}
                      <Button
                        variant="ghost"
                        className="h-auto w-full justify-start rounded-xl px-3 py-3 hover:bg-muted/60"
                        onClick={() => handleMemberClick(member)}
                      >
                        <div className="flex w-full items-start gap-3">
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={member.avatar_url || undefined} />
                            <AvatarFallback className="bg-primary/10 text-primary">
                              {member.full_name
                                .split(" ")
                                .map(n => n[0])
                                .join("")
                                .slice(0, 2)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 text-left">
                            <div className="flex items-start gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-medium">{member.full_name}</p>
                                <div className="mt-1 flex flex-wrap gap-1.5">
                                  {effectiveMinistryFilter && member.hasMinistry && (
                                    <Badge variant="secondary" className="h-5 rounded-md px-2 text-[10px] font-medium">
                                      {ministryLabel}
                                    </Badge>
                                  )}
                                  {member.positions.map(pos => (
                                    <Badge key={pos} variant="outline" className="h-5 rounded-md px-2 text-[10px] text-muted-foreground">
                                      {POSITION_LABELS[pos] || pos}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                              {member.conflictDates.length > 0 && (
                                <Badge
                                  variant="outline"
                                  className="mt-0.5 shrink-0 border-amber-500/35 bg-amber-500/8 text-[10px] font-medium text-amber-700 dark:text-amber-300"
                                >
                                  <AlertTriangle className="mr-1 h-3 w-3" />
                                  Conflict
                                </Badge>
                              )}
                            </div>
                            {member.conflictDates.length > 0 && (
                              <div className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-700/90 dark:text-amber-300">
                                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">
                                  Blackout dates: {formatConflictDates(member.conflictDates)}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </Button>
                    </div>
                  );
                })}
                {relevantMembers.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">
                    No members found with matching position
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Select which ministries this assignment applies to:
            </p>
            <div className="space-y-3">
              {visibleMinistryOptions.map(ministry => (
                <label
                  key={ministry.value}
                  className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <Checkbox
                    checked={selectedMinistries.includes(ministry.value)}
                    onCheckedChange={() => toggleMinistry(ministry.value)}
                  />
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${ministry.color}`} />
                    <span className="font-medium">{ministry.label}</span>
                  </div>
                </label>
              ))}
            </div>
            <DialogFooter className="flex gap-2 sm:gap-0">
              <Button variant="outline" onClick={handleBack}>
                Back
              </Button>
              <Button 
                onClick={handleConfirm} 
                disabled={selectedMinistries.length === 0}
              >
                Assign to {selectedMinistries.length} {selectedMinistries.length === 1 ? 'ministry' : 'ministries'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
