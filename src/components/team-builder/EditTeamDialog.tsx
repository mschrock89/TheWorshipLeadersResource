import { useEffect, useState } from "react";
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
import { Loader2, Check } from "lucide-react";
import { TEAM_COLOR_PRESETS, TEAM_ICON_OPTIONS } from "@/lib/teamIcons";
import { cn } from "@/lib/utils";

export interface TeamEditorValue {
  name: string;
  color: string;
  icon: string;
}

interface EditTeamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  initialValue?: TeamEditorValue | null;
  onSave: (value: TeamEditorValue) => Promise<void> | void;
  isSaving?: boolean;
}

const DEFAULT_COLOR = TEAM_COLOR_PRESETS[0];
const DEFAULT_ICON = TEAM_ICON_OPTIONS[0].value;

export function EditTeamDialog({
  open,
  onOpenChange,
  mode,
  initialValue,
  onSave,
  isSaving = false,
}: EditTeamDialogProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [icon, setIcon] = useState(DEFAULT_ICON);

  useEffect(() => {
    if (!open) return;
    setName(initialValue?.name ?? "");
    setColor(initialValue?.color ?? DEFAULT_COLOR);
    setIcon(initialValue?.icon ?? DEFAULT_ICON);
  }, [open, initialValue]);

  const trimmedName = name.trim();
  const canSave = trimmedName.length > 0 && !isSaving;

  const handleSave = async () => {
    if (!canSave) return;
    await onSave({ name: trimmedName, color, icon });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "New Team" : "Edit Team"}</DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Create a fully custom team. Custom teams appear under the \u201cAll\u201d ministry filter."
              : "Rename this team and customize its color and icon. Member assignments are not affected."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-6 overflow-y-auto pr-2">
          <div className="space-y-2">
            <Label htmlFor="team-name">Team name</Label>
            <Input
              id="team-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Team 1, Acoustic Set, Youth Band"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>Icon</Label>
            <div className="grid grid-cols-6 gap-2">
              {TEAM_ICON_OPTIONS.map((option) => {
                const Icon = option.Icon;
                const isSelected = icon === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    title={option.label}
                    aria-label={option.label}
                    aria-pressed={isSelected}
                    onClick={() => setIcon(option.value)}
                    className={cn(
                      "flex h-11 items-center justify-center rounded-md border transition-colors",
                      isSelected
                        ? "border-primary ring-2 ring-primary/30"
                        : "border-border hover:border-primary/50",
                    )}
                  >
                    <Icon className="h-5 w-5" style={{ color }} />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {TEAM_COLOR_PRESETS.map((preset) => {
                const isSelected = color.toLowerCase() === preset.toLowerCase();
                return (
                  <button
                    key={preset}
                    type="button"
                    aria-label={`Use color ${preset}`}
                    aria-pressed={isSelected}
                    onClick={() => setColor(preset)}
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full border transition-transform",
                      isSelected ? "ring-2 ring-offset-2 ring-foreground/40" : "hover:scale-110",
                    )}
                    style={{ backgroundColor: preset, borderColor: preset }}
                  >
                    {isSelected && <Check className="h-4 w-4 text-white" />}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-3 pt-1">
              <input
                type="color"
                aria-label="Custom team color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                className="h-9 w-12 cursor-pointer rounded border border-border bg-transparent p-0.5"
              />
              <Input
                value={color}
                onChange={(event) => setColor(event.target.value)}
                className="w-32 font-mono uppercase"
                maxLength={7}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Preview</Label>
            <div
              className="flex items-center gap-2 rounded-lg border p-3"
              style={{ backgroundColor: `${color}20` }}
            >
              {(() => {
                const Icon = (TEAM_ICON_OPTIONS.find((option) => option.value === icon) ?? TEAM_ICON_OPTIONS[0]).Icon;
                return <Icon className="h-5 w-5" style={{ color }} />;
              })()}
              <span className="text-lg font-semibold">{trimmedName || "Team name"}</span>
            </div>
          </div>
        </div>

        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === "create" ? "Create Team" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
