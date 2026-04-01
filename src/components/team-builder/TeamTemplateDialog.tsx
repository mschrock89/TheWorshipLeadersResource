import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_TEAM_TEMPLATE,
  TeamTemplateConfig,
  normalizeTeamTemplateConfig,
} from "@/lib/teamTemplates";

interface TeamTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamName: string;
  initialConfig?: TeamTemplateConfig | null;
  onSave: (config: TeamTemplateConfig) => Promise<void> | void;
  isSaving?: boolean;
}

const VOCAL_SLOT_IDS = ["vocalist_1", "vocalist_2", "vocalist_3", "vocalist_4"] as const;

const BAND_FIELDS = [
  { key: "drums", label: "Drums", max: 1 },
  { key: "bass", label: "Bass", max: 1 },
  { key: "keys", label: "Keys", max: 1 },
  { key: "eg", label: "Electric Guitars", max: 2 },
  { key: "ag", label: "Acoustic Guitars", max: 2 },
] as const;

type BandFieldKey = (typeof BAND_FIELDS)[number]["key"];

function getBandCounts(config: Required<TeamTemplateConfig>) {
  return {
    drums: config.bandSlots.includes("drums") ? 1 : 0,
    bass: config.bandSlots.includes("bass") ? 1 : 0,
    keys: config.bandSlots.includes("keys") ? 1 : 0,
    eg: config.bandSlots.filter((slot) => slot.startsWith("eg_")).length,
    ag: config.bandSlots.filter((slot) => slot.startsWith("ag_")).length,
  };
}

export function TeamTemplateDialog({
  open,
  onOpenChange,
  teamName,
  initialConfig,
  onSave,
  isSaving = false,
}: TeamTemplateDialogProps) {
  const normalizedInitial = useMemo(
    () => normalizeTeamTemplateConfig(initialConfig),
    [initialConfig],
  );
  const [vocalSelections, setVocalSelections] = useState<Record<string, "male" | "female" | "none">>({});
  const [bandCounts, setBandCounts] = useState<Record<BandFieldKey, number>>({
    drums: 1,
    bass: 1,
    keys: 1,
    eg: 2,
    ag: 2,
  });

  useEffect(() => {
    if (!open) return;

    const nextVocalSelections: Record<string, "male" | "female" | "none"> = {};
    VOCAL_SLOT_IDS.forEach((slotId) => {
      nextVocalSelections[slotId] =
        normalizedInitial.vocalSlots.find((slot) => slot.slot === slotId)?.gender || "none";
    });

    setVocalSelections(nextVocalSelections);
    setBandCounts(getBandCounts(normalizedInitial));
  }, [normalizedInitial, open]);

  const totalVocalists = Object.values(vocalSelections).filter((value) => value !== "none").length;
  const totalInstruments = Object.values(bandCounts).reduce((sum, count) => sum + count, 0);

  const handleSave = async () => {
    const vocalSlots = VOCAL_SLOT_IDS.flatMap((slotId) => {
      const selection = vocalSelections[slotId];
      if (selection === "none") return [];
      return [{ slot: slotId, gender: selection }];
    });

    const bandSlots = [
      ...(bandCounts.drums ? ["drums"] : []),
      ...(bandCounts.bass ? ["bass"] : []),
      ...(bandCounts.keys ? ["keys"] : []),
      ...Array.from({ length: bandCounts.eg }, (_, index) => `eg_${index + 1}`),
      ...Array.from({ length: bandCounts.ag }, (_, index) => `ag_${index + 1}`),
    ];

    await onSave({
      vocalSlots: vocalSlots.length > 0 ? vocalSlots : DEFAULT_TEAM_TEMPLATE.vocalSlots,
      bandSlots: bandSlots.length > 0 ? bandSlots : DEFAULT_TEAM_TEMPLATE.bandSlots,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{teamName} Template</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
            {totalVocalists} vocalist{totalVocalists === 1 ? "" : "s"} and {totalInstruments} instrument{totalInstruments === 1 ? "" : "s"} configured for this team.
          </div>

          <div className="space-y-3">
            <div>
              <h4 className="font-medium">Vocalists</h4>
              <p className="text-sm text-muted-foreground">
                Choose how many vocal slots this team uses and whether each one should be male or female.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {VOCAL_SLOT_IDS.map((slotId, index) => (
                <div key={slotId} className="space-y-2">
                  <Label>Vocal Slot {index + 1}</Label>
                  <Select
                    value={vocalSelections[slotId] || "none"}
                    onValueChange={(value: "male" | "female" | "none") =>
                      setVocalSelections((prev) => ({ ...prev, [slotId]: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not used</SelectItem>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <h4 className="font-medium">Instruments</h4>
              <p className="text-sm text-muted-foreground">
                Choose how many of each instrument slot this team should have.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {BAND_FIELDS.map((field) => (
                <div key={field.key} className="space-y-2">
                  <Label>{field.label}</Label>
                  <Select
                    value={String(bandCounts[field.key])}
                    onValueChange={(value) =>
                      setBandCounts((prev) => ({ ...prev, [field.key]: Number(value) }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: field.max + 1 }, (_, index) => (
                        <SelectItem key={index} value={String(index)}>
                          {index}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
