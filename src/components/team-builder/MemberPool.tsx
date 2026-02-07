import { useState, useMemo } from "react";
import { Search, UserPlus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AvailableMember } from "@/hooks/useTeamBuilder";
import { cn } from "@/lib/utils";

interface MemberPoolProps {
  members: AvailableMember[];
  assignedMemberIds: Set<string>;
  onSelectMember: (member: AvailableMember) => void;
  filterPosition?: string;
}

const POSITION_FILTERS = [
  "All",
  "Vocals",
  "Drums",
  "Bass",
  "Keys",
  "Electric",
  "Acoustic",
];

export function MemberPool({
  members,
  assignedMemberIds,
  onSelectMember,
  filterPosition,
}: MemberPoolProps) {
  const [search, setSearch] = useState("");
  const [selectedFilter, setSelectedFilter] = useState(filterPosition || "All");

  const filteredMembers = useMemo(() => {
    return members.filter(m => {
      // Search filter
      if (search && !m.full_name.toLowerCase().includes(search.toLowerCase())) {
        return false;
      }

      // Position filter
      if (selectedFilter !== "All") {
        const hasPosition = m.positions.some(p =>
          p.toLowerCase().includes(selectedFilter.toLowerCase())
        );
        if (!hasPosition) return false;
      }

      return true;
    });
  }, [members, search, selectedFilter]);

  const availableCount = filteredMembers.filter(
    m => !assignedMemberIds.has(m.id)
  ).length;

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border space-y-3">
        <div className="flex items-center gap-2">
          <UserPlus className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Member Pool</h3>
          <Badge variant="secondary" className="ml-auto">
            {availableCount} available
          </Badge>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search members..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {POSITION_FILTERS.map(filter => (
            <Badge
              key={filter}
              variant={selectedFilter === filter ? "default" : "outline"}
              className={cn(
                "cursor-pointer transition-colors",
                selectedFilter === filter
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              )}
              onClick={() => setSelectedFilter(filter)}
            >
              {filter}
            </Badge>
          ))}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {filteredMembers.map(member => {
            const isAssigned = assignedMemberIds.has(member.id);
            return (
              <Button
                key={member.id}
                variant="ghost"
                className={cn(
                  "w-full justify-start gap-3 h-auto py-2 px-3",
                  isAssigned && "opacity-50"
                )}
                onClick={() => !isAssigned && onSelectMember(member)}
                disabled={isAssigned}
              >
                <Avatar className="h-8 w-8">
                  <AvatarImage src={member.avatar_url || undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary text-xs">
                    {member.full_name
                      .split(" ")
                      .map(n => n[0])
                      .join("")
                      .slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 text-left min-w-0">
                  <p className="text-sm font-medium truncate">
                    {member.full_name}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {member.positions.join(", ") || "No positions"}
                  </p>
                </div>
                {isAssigned && (
                  <Badge variant="secondary" className="text-xs">
                    Assigned
                  </Badge>
                )}
              </Button>
            );
          })}
          {filteredMembers.length === 0 && (
            <p className="text-center text-muted-foreground py-8 text-sm">
              No members found
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
