import { useState, useMemo } from "react";
import { Search, Users } from "lucide-react";
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
import { POSITION_LABELS, MINISTRY_TYPES } from "@/lib/constants";

interface AssignMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slot: string;
  teamName: string;
  members: AvailableMember[];
  onSelect: (member: AvailableMember, ministryTypes: string[]) => void;
  ministryFilter?: string;
}

export function AssignMemberDialog({
  open,
  onOpenChange,
  slot,
  teamName,
  members,
  onSelect,
  ministryFilter,
}: AssignMemberDialogProps) {
  const [search, setSearch] = useState("");
  const [selectedMember, setSelectedMember] = useState<AvailableMember | null>(null);
  const [selectedMinistries, setSelectedMinistries] = useState<string[]>([]);

  const slotConfig = POSITION_SLOTS.find(s => s.slot === slot);
  const slotLabel = slotConfig?.label || slot;

  // Check if a member's positions match the slot
  const matchesPosition = (positions: string[], slotType: string): boolean => {
    return positions.some(p => {
      const pLower = p.toLowerCase();
      // Vocalist slots
      if (slotType === "vocalist") return pLower.includes("vocal");
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
      if (slotType === "camera") return pLower.includes("camera") || pLower === "broadcast";
      if (slotType === "chat_host") return pLower === "chat_host" || pLower.includes("chat");
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
        // Match position
        return matchesPosition(m.positions, slotType);
      })
      .map(m => {
        // Check if member has the ministry type
        const hasMinistry = ministryFilter 
          ? m.ministry_types?.includes(ministryFilter) 
          : true;
        return { ...m, hasMinistry };
      })
      .sort((a, b) => {
        // Sort: members with matching ministry first, then alphabetically
        if (a.hasMinistry && !b.hasMinistry) return -1;
        if (!a.hasMinistry && b.hasMinistry) return 1;
        return a.full_name.localeCompare(b.full_name);
      });
  }, [members, search, slot, ministryFilter]);

  const matchingMinistryCount = relevantMembers.filter(m => m.hasMinistry).length;
  const otherCount = relevantMembers.length - matchingMinistryCount;

  const handleMemberClick = (member: AvailableMember) => {
    setSelectedMember(member);
    // Pre-select the current ministry filter, and any ministries the member already has
    const initialMinistries = new Set<string>();
    if (ministryFilter) {
      initialMinistries.add(ministryFilter);
    }
    member.ministry_types?.forEach(mt => initialMinistries.add(mt));
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
    setSelectedMinistries(prev => 
      prev.includes(value) 
        ? prev.filter(m => m !== value)
        : [...prev, value]
    );
  };

  const ministryLabel = ministryFilter === 'weekend' ? 'Weekend Worship' 
    : ministryFilter === 'eon' ? 'EON'
    : ministryFilter === 'encounter' ? 'Encounter'
    : ministryFilter || 'All';

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {selectedMember 
              ? `Select Ministries for ${selectedMember.full_name}`
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

            {ministryFilter && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="h-4 w-4" />
                <span>{matchingMinistryCount} {ministryLabel} members</span>
                {otherCount > 0 && (
                  <span className="text-muted-foreground/60">• {otherCount} others</span>
                )}
              </div>
            )}

            <ScrollArea className="h-[300px]">
              <div className="space-y-1 pr-4">
                {relevantMembers.map((member, index) => {
                  // Add separator before "other" members
                  const showSeparator = ministryFilter && 
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
                        className="w-full justify-start gap-3 h-auto py-3"
                        onClick={() => handleMemberClick(member)}
                      >
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
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{member.full_name}</p>
                            {ministryFilter && member.hasMinistry && (
                              <Badge variant="default" className="text-xs">
                                {ministryLabel}
                              </Badge>
                            )}
                          </div>
                          <div className="flex gap-1 flex-wrap mt-1">
                            {member.positions.map(pos => (
                              <Badge key={pos} variant="secondary" className="text-xs">
                                {POSITION_LABELS[pos] || pos}
                              </Badge>
                            ))}
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
              {MINISTRY_TYPES.map(ministry => (
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
