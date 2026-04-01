import { useMemo, useState } from "react";
import { Loader2, UserCheck } from "lucide-react";
import { useUpdateBaseRole } from "@/hooks/useUserRoles";
import { BASE_ROLES, ROLE_LABELS } from "@/lib/constants";
import { Database } from "@/integrations/supabase/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type AppRole = Database["public"]["Enums"]["app_role"];

interface PromoteAuditionCandidateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidateId: string | null;
  candidateName: string | null;
  onPromoted?: () => void;
}

export function PromoteAuditionCandidateDialog({
  open,
  onOpenChange,
  candidateId,
  candidateName,
  onPromoted,
}: PromoteAuditionCandidateDialogProps) {
  const updateBaseRole = useUpdateBaseRole();
  const [role, setRole] = useState<AppRole>("volunteer");

  const availableRoles = useMemo(
    () => BASE_ROLES.filter((baseRole) => baseRole !== "audition_candidate"),
    [],
  );

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setRole("volunteer");
    }
    onOpenChange(nextOpen);
  };

  const handlePromote = async () => {
    if (!candidateId) return;

    await updateBaseRole.mutateAsync({
      userId: candidateId,
      role,
    });

    onPromoted?.();
    handleOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5" />
            Promote Candidate
          </DialogTitle>
          <DialogDescription>
            Move {candidateName || "this audition candidate"} to a normal user role and remove audition-only restrictions.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>New Base Role</Label>
            <Select value={role} onValueChange={(value) => setRole(value as AppRole)}>
              <SelectTrigger>
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                {availableRoles.map((baseRole) => (
                  <SelectItem key={baseRole} value={baseRole}>
                    {ROLE_LABELS[baseRole] || baseRole}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <p className="text-xs text-muted-foreground">
            Campus assignments, profile details, and login access stay the same. This only changes their base role.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={updateBaseRole.isPending}>
            Cancel
          </Button>
          <Button onClick={handlePromote} disabled={!candidateId || updateBaseRole.isPending}>
            {updateBaseRole.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Promoting...
              </>
            ) : (
              "Promote User"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
