import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Loader2, Trash2, AlertTriangle, Search, UserX } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { POSITION_LABELS } from "@/lib/constants";
import { format } from "date-fns";

interface MemberCleanupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campusId?: string;
  campusName?: string;
}

interface InactiveMember {
  id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
  positions: string[] | null;
  created_at: string;
  last_scheduled?: string | null;
}

export function MemberCleanupDialog({ open, onOpenChange, campusId, campusName }: MemberCleanupDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch members for the campus who haven't been scheduled in any plans
  const { data: inactiveMembers = [], isLoading } = useQuery({
    queryKey: ["inactive-members", campusId],
    queryFn: async () => {
      if (!campusId) return [];

      // Get all members in this campus
      const { data: campusMembers, error: campusError } = await supabase
        .from("user_campuses")
        .select("user_id")
        .eq("campus_id", campusId);

      if (campusError) throw campusError;
      if (!campusMembers?.length) return [];

      const userIds = campusMembers.map(m => m.user_id);

      // Get profiles for these members
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url, positions, created_at")
        .in("id", userIds);

      if (profilesError) throw profilesError;

      // Get members who have been scheduled in team_members table
      const { data: scheduledMembers } = await supabase
        .from("team_members")
        .select("user_id, created_at")
        .in("user_id", userIds);

      const scheduledUserIds = new Set(scheduledMembers?.map(m => m.user_id) || []);

      // Filter to only members who haven't been scheduled
      const inactive = profiles?.filter(p => !scheduledUserIds.has(p.id)) || [];

      return inactive.map(p => ({
        ...p,
        last_scheduled: null
      })) as InactiveMember[];
    },
    enabled: open && !!campusId,
  });

  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) return inactiveMembers;
    const query = searchQuery.toLowerCase();
    return inactiveMembers.filter(m => 
      m.full_name?.toLowerCase().includes(query) ||
      m.email.toLowerCase().includes(query)
    );
  }, [inactiveMembers, searchQuery]);

  const removeMembersMutation = useMutation({
    mutationFn: async (memberIds: string[]) => {
      // Remove members from this campus only
      const { error } = await supabase
        .from("user_campuses")
        .delete()
        .eq("campus_id", campusId)
        .in("user_id", memberIds);

      if (error) throw error;
      return memberIds.length;
    },
    onSuccess: (count) => {
      toast({
        title: "Members removed",
        description: `${count} member${count === 1 ? '' : 's'} removed from ${campusName || 'campus'}.`,
      });
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
      queryClient.invalidateQueries({ queryKey: ["inactive-members"] });
      setSelectedIds(new Set());
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: "Error removing members",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleToggleSelect = (memberId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(memberId)) {
        next.delete(memberId);
      } else {
        next.add(memberId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredMembers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredMembers.map(m => m.id)));
    }
  };

  const handleRemoveSelected = () => {
    if (selectedIds.size === 0) return;
    removeMembersMutation.mutate(Array.from(selectedIds));
  };

  const getInitials = (name: string | null, email: string) => {
    if (name) {
      return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
    }
    return email.substring(0, 2).toUpperCase();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserX className="h-5 w-5 text-destructive" />
            Clean Up Inactive Members
          </DialogTitle>
          <DialogDescription>
            These members are in {campusName || "this campus"} but have never been scheduled to serve.
            Select members to remove from the campus.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 min-h-0">
          {/* Search and Select All */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search members..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSelectAll}
              disabled={filteredMembers.length === 0}
            >
              {selectedIds.size === filteredMembers.length && filteredMembers.length > 0
                ? "Deselect All"
                : "Select All"}
            </Button>
          </div>

          {/* Member Count */}
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {inactiveMembers.length} inactive member{inactiveMembers.length !== 1 ? 's' : ''} found
            </span>
            {selectedIds.size > 0 && (
              <Badge variant="secondary">{selectedIds.size} selected</Badge>
            )}
          </div>

          {/* Member List */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <UserX className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">
                {inactiveMembers.length === 0
                  ? "No inactive members found. All members have been scheduled!"
                  : "No members match your search."}
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[300px] pr-4">
              <div className="space-y-2">
                {filteredMembers.map((member) => (
                  <div
                    key={member.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedIds.has(member.id)
                        ? "bg-destructive/10 border-destructive/30"
                        : "bg-card hover:bg-accent/50"
                    }`}
                    onClick={() => handleToggleSelect(member.id)}
                  >
                    <Checkbox
                      checked={selectedIds.has(member.id)}
                      onCheckedChange={() => handleToggleSelect(member.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={member.avatar_url || undefined} />
                      <AvatarFallback className="bg-secondary text-secondary-foreground">
                        {getInitials(member.full_name, member.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">
                        {member.full_name || "Unnamed"}
                      </p>
                      <p className="text-sm text-muted-foreground truncate">
                        {member.email}
                      </p>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <p>Added {format(new Date(member.created_at), "MMM d, yyyy")}</p>
                      {member.positions && member.positions.length > 0 && (
                        <p className="text-primary">
                          {POSITION_LABELS[member.positions[0] as keyof typeof POSITION_LABELS] || member.positions[0]}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Warning */}
        {selectedIds.size > 0 && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium">This will remove {selectedIds.size} member{selectedIds.size !== 1 ? 's' : ''} from {campusName || "this campus"}.</p>
              <p className="text-amber-600 dark:text-amber-500">They can be re-added later or may still belong to other campuses.</p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleRemoveSelected}
            disabled={selectedIds.size === 0 || removeMembersMutation.isPending}
          >
            {removeMembersMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Trash2 className="h-4 w-4 mr-2" />
            )}
            Remove {selectedIds.size || ""} Member{selectedIds.size !== 1 ? 's' : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
