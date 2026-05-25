import { useEffect, useMemo, useState } from "react";
import { Loader2, Shield } from "lucide-react";
import { useUpdateBaseRoles, useUserRoles } from "@/hooks/useUserRoles";
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
type RoleSelection = AppRole | "none";

interface ManageBaseRolesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberId: string | null;
  memberName: string | null;
  onSaved?: () => void;
}

export function ManageBaseRolesDialog({
  open,
  onOpenChange,
  memberId,
  memberName,
  onSaved,
}: ManageBaseRolesDialogProps) {
  const { data: userRoles = [], isLoading } = useUserRoles(open ? memberId || undefined : undefined);
  const updateBaseRoles = useUpdateBaseRoles();
  const [selectedRoles, setSelectedRoles] = useState<[RoleSelection, RoleSelection, RoleSelection]>([
    "volunteer",
    "none",
    "none",
  ]);

  const availableRoles = useMemo(() => [...BASE_ROLES] as AppRole[], []);

  useEffect(() => {
    if (!open) return;

    const currentBaseRoles = userRoles
      .map((roleData) => roleData.role)
      .filter((role): role is AppRole => availableRoles.includes(role as AppRole));

    const uniqueBaseRoles = Array.from(new Set(currentBaseRoles));

    setSelectedRoles([
      uniqueBaseRoles[0] || "volunteer",
      uniqueBaseRoles[1] || "none",
      uniqueBaseRoles[2] || "none",
    ]);
  }, [availableRoles, open, userRoles]);

  const handleRoleChange = (index: number, value: RoleSelection) => {
    setSelectedRoles((current) => {
      const next = [...current] as [RoleSelection, RoleSelection, RoleSelection];
      next[index] = index === 0 && value === "none" ? "volunteer" : value;

      if (value !== "none") {
        next.forEach((role, roleIndex) => {
          if (roleIndex !== index && role === value) {
            next[roleIndex] = "none";
          }
        });
      }

      return next;
    });
  };

  const getSelectableRoles = (index: number) => {
    const selectedElsewhere = new Set(
      selectedRoles.filter((role, roleIndex) => role !== "none" && roleIndex !== index),
    );

    return availableRoles.filter((role) => !selectedElsewhere.has(role));
  };

  const handleSave = async () => {
    if (!memberId) return;

    const roles = selectedRoles.filter((role): role is AppRole => role !== "none");
    await updateBaseRoles.mutateAsync({ userId: memberId, roles });
    onSaved?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Base Roles
          </DialogTitle>
          <DialogDescription>
            Manage up to three base roles for {memberName || "this team member"}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {["Primary Base Role", "2nd Base Role", "3rd Base Role"].map((label, index) => (
            <div key={label} className="space-y-2">
              <Label>{label}</Label>
              <Select
                value={selectedRoles[index]}
                onValueChange={(value) => handleRoleChange(index, value as RoleSelection)}
                disabled={isLoading || updateBaseRoles.isPending}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {index > 0 && <SelectItem value="none">None</SelectItem>}
                  {getSelectableRoles(index).map((baseRole) => (
                    <SelectItem key={baseRole} value={baseRole}>
                      {ROLE_LABELS[baseRole] || baseRole}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={updateBaseRoles.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!memberId || isLoading || updateBaseRoles.isPending}>
            {updateBaseRoles.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Roles"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
