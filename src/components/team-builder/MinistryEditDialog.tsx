import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { MINISTRY_TYPES } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface MinistryEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberName: string;
  currentMinistries: string[];
  onSave: (ministries: string[]) => Promise<void>;
}

export function MinistryEditDialog({
  open,
  onOpenChange,
  memberName,
  currentMinistries,
  onSave,
}: MinistryEditDialogProps) {
  const [selected, setSelected] = useState<string[]>(currentMinistries);
  const [isSaving, setIsSaving] = useState(false);

  // Reset selected state when dialog opens or member changes
  useEffect(() => {
    if (open) {
      setSelected(currentMinistries);
    }
  }, [open, currentMinistries]);

  const handleToggle = (value: string) => {
    setSelected(prev =>
      prev.includes(value)
        ? prev.filter(v => v !== value)
        : [...prev, value]
    );
  };

  const handleSave = async () => {
    if (selected.length === 0) return;
    setIsSaving(true);
    try {
      await onSave(selected);
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Ministries</DialogTitle>
          <DialogDescription>
            Select which ministries {memberName} serves with.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-4">
          {MINISTRY_TYPES.map(ministry => (
            <div
              key={ministry.value}
              className={cn(
                "flex items-center space-x-3 rounded-lg border p-3 cursor-pointer transition-colors",
                selected.includes(ministry.value)
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-muted/50"
              )}
              onClick={() => handleToggle(ministry.value)}
            >
              <Checkbox
                id={ministry.value}
                checked={selected.includes(ministry.value)}
                onCheckedChange={() => handleToggle(ministry.value)}
              />
              <Label
                htmlFor={ministry.value}
                className="flex-1 cursor-pointer flex items-center gap-2"
              >
                <span
                  className={cn(
                    "text-xs font-medium px-1.5 py-0.5 rounded text-white",
                    ministry.color
                  )}
                >
                  {ministry.shortLabel}
                </span>
                {ministry.label}
              </Label>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={isSaving || selected.length === 0}
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
