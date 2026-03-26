import { useMemo, useState } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BASE_ROLES, ROLE_LABELS } from "@/lib/constants";

interface CampusOption {
  id: string;
  name: string;
}

interface CreateTeamMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campuses: CampusOption[];
  onCreated: () => void;
}

export function CreateTeamMemberDialog({
  open,
  onOpenChange,
  campuses,
  onCreated,
}: CreateTeamMemberDialogProps) {
  const { toast } = useToast();
  const [isCreating, setIsCreating] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [campusId, setCampusId] = useState<string>("none");
  const [role, setRole] = useState<string>("volunteer");

  const availableRoles = useMemo(
    () => BASE_ROLES.filter((baseRole) => baseRole !== "audition_candidate"),
    [],
  );

  const reset = () => {
    setFirstName("");
    setLastName("");
    setEmail("");
    setPhone("");
    setCampusId("none");
    setRole("volunteer");
    setIsCreating(false);
  };

  const close = () => {
    reset();
    onOpenChange(false);
  };

  const handleCreate = async () => {
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      toast({
        title: "Missing details",
        description: "First name, last name, and email are required.",
        variant: "destructive",
      });
      return;
    }

    setIsCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-team-member", {
        body: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim() || null,
          campusId: campusId === "none" ? null : campusId,
          role,
        },
      });

      if (error) {
        throw new Error(error.message || "Failed to create member");
      }

      toast({
        title: "Team member created",
        description: `${data.email} created as ${ROLE_LABELS[role] || role}. Temporary password is ${data.temporaryPassword}.`,
      });
      onCreated();
      close();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to create member";
      toast({
        title: "Creation failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(next) : close())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Create Team Member
          </DialogTitle>
          <DialogDescription>
            Create a regular staff or volunteer account with day-one permissions and no audition-candidate restrictions.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="member-first-name">First Name</Label>
              <Input
                id="member-first-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Jane"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="member-last-name">Last Name</Label>
              <Input
                id="member-last-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Doe"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="member-email">Email</Label>
            <Input
              id="member-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@example.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="member-phone">Phone (optional)</Label>
            <Input
              id="member-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(555) 123-4567"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Base Role</Label>
              <Select value={role} onValueChange={setRole}>
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

            <div className="space-y-2">
              <Label>Campus (optional)</Label>
              <Select value={campusId} onValueChange={setCampusId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select campus" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No campus yet</SelectItem>
                  {campuses.map((campus) => (
                    <SelectItem key={campus.id} value={campus.id}>
                      {campus.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            The account password is set to <strong>123456</strong>. They can keep it or change it later from their profile.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={isCreating}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={isCreating}>
            {isCreating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Member"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
