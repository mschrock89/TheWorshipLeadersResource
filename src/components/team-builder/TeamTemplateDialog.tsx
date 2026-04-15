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
  TeamTemplateConfig,
  getSupportedVocalSlotIds,
  isMurfreesboroCentralWorshipNightTemplateContext,
  normalizeTeamTemplateConfig,
} from "@/lib/teamTemplates";

interface TeamTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamName: string;
  ministryType?: string;
  campusName?: string | null;
  initialConfig?: TeamTemplateConfig | null;
  onSave: (config: TeamTemplateConfig) => Promise<void> | void;
  isSaving?: boolean;
}

const BAND_FIELDS = [
  { key: "drums", label: "Drums", max: 1 },
  { key: "bass", label: "Bass", max: 1 },
  { key: "keys", label: "Keys", max: 1 },
  { key: "eg", label: "Electric Guitars", max: 2 },
  { key: "ag", label: "Acoustic Guitars", max: 2 },
] as const;
const MURFREESBORO_CENTRAL_WORSHIP_NIGHT_BAND_FIELDS = [
  { key: "drums", label: "Drums", max: 1 },
  { key: "bass", label: "Bass", max: 1 },
  { key: "keys", label: "Keys", max: 1 },
  { key: "eg", label: "Electric Guitars", max: 3 },
  { key: "ag", label: "Acoustic Guitars", max: 2 },
  { key: "pad", label: "Pad", max: 1 },
] as const;

const PRODUCTION_FIELDS = [
  { key: "foh", label: "FOH", max: 1, slots: ["foh"] },
  { key: "mon", label: "MON", max: 1, slots: ["mon"] },
  { key: "broadcast", label: "Broadcast", max: 1, slots: ["broadcast"] },
  { key: "audio_shadow", label: "Audio Shadow", max: 1, slots: ["audio_shadow"] },
  { key: "lighting", label: "Lighting", max: 1, slots: ["lighting"] },
  { key: "propresenter", label: "Lyrics", max: 1, slots: ["propresenter"] },
  { key: "producer", label: "Producer", max: 1, slots: ["producer"] },
] as const;

const VIDEO_FIELDS = [
  { key: "tri_pod_camera", label: "Tri-Pod Camera", max: 4, slots: ["tri_pod_camera_1", "tri_pod_camera_2", "tri_pod_camera_3", "tri_pod_camera_4"] },
  { key: "hand_held_camera", label: "Hand-Held Camera", max: 4, slots: ["hand_held_camera_1", "hand_held_camera_2", "hand_held_camera_3", "hand_held_camera_4"] },
  { key: "director", label: "Director", max: 4, slots: ["director", "director_2", "director_3", "director_4"] },
  { key: "graphics", label: "Graphics", max: 4, slots: ["graphics", "graphics_2", "graphics_3", "graphics_4"] },
  { key: "switcher", label: "Switcher", max: 4, slots: ["switcher", "switcher_2", "switcher_3", "switcher_4"] },
] as const;

type BandFieldKey =
  | (typeof BAND_FIELDS)[number]["key"]
  | (typeof MURFREESBORO_CENTRAL_WORSHIP_NIGHT_BAND_FIELDS)[number]["key"];
type ProductionFieldKey = (typeof PRODUCTION_FIELDS)[number]["key"];
type VideoFieldKey = (typeof VIDEO_FIELDS)[number]["key"];

function getBandCounts(config: Required<TeamTemplateConfig>) {
  return {
    drums: config.bandSlots.includes("drums") ? 1 : 0,
    bass: config.bandSlots.includes("bass") ? 1 : 0,
    keys: config.bandSlots.includes("keys") ? 1 : 0,
    eg: config.bandSlots.filter((slot) => slot.startsWith("eg_")).length,
    ag: config.bandSlots.filter((slot) => slot.startsWith("ag_")).length,
    pad: config.bandSlots.includes("pad") ? 1 : 0,
  };
}

function getProductionCounts(config: Required<TeamTemplateConfig>) {
  return PRODUCTION_FIELDS.reduce<Record<ProductionFieldKey, number>>((acc, field) => {
    acc[field.key] = config.productionSlots.filter((slot) => field.slots.includes(slot)).length;
    return acc;
  }, {} as Record<ProductionFieldKey, number>);
}

function getVideoCounts(config: Required<TeamTemplateConfig>) {
  return VIDEO_FIELDS.reduce<Record<VideoFieldKey, number>>((acc, field) => {
    acc[field.key] = config.videoSlots.filter((slot) => field.slots.includes(slot)).length;
    return acc;
  }, {} as Record<VideoFieldKey, number>);
}

export function TeamTemplateDialog({
  open,
  onOpenChange,
  teamName,
  ministryType,
  campusName,
  initialConfig,
  onSave,
  isSaving = false,
}: TeamTemplateDialogProps) {
  const templateContext = useMemo(
    () => ({ campusName, ministryType }),
    [campusName, ministryType],
  );
  const normalizedInitial = useMemo(
    () => normalizeTeamTemplateConfig(initialConfig, templateContext),
    [initialConfig, templateContext],
  );
  const vocalSlotIds = useMemo(() => [...getSupportedVocalSlotIds(templateContext)], [templateContext]);
  const bandFields = useMemo(
    () =>
      isMurfreesboroCentralWorshipNightTemplateContext(templateContext)
        ? [...MURFREESBORO_CENTRAL_WORSHIP_NIGHT_BAND_FIELDS]
        : [...BAND_FIELDS],
    [templateContext],
  );
  const [vocalSelections, setVocalSelections] = useState<Record<string, "male" | "female" | "none">>({});
  const [bandCounts, setBandCounts] = useState<Record<BandFieldKey, number>>({
    drums: 1,
    bass: 1,
    keys: 1,
    eg: 2,
    ag: 2,
    pad: 0,
  });
  const [productionCounts, setProductionCounts] = useState<Record<ProductionFieldKey, number>>({
    foh: 1,
    mon: 1,
    broadcast: 1,
    audio_shadow: 1,
    lighting: 1,
    propresenter: 1,
    producer: 1,
  });
  const [videoCounts, setVideoCounts] = useState<Record<VideoFieldKey, number>>({
    tri_pod_camera: 1,
    hand_held_camera: 1,
    director: 1,
    graphics: 1,
    switcher: 1,
  });

  const showProductionTemplate =
    ministryType === "encounter" || ministryType === "eon" || ministryType === "production";
  const isVideoTemplate = ministryType === "video";
  const isProductionOnlyTemplate = ministryType === "production";

  useEffect(() => {
    if (!open) return;

    const nextVocalSelections: Record<string, "male" | "female" | "none"> = {};
    vocalSlotIds.forEach((slotId) => {
      nextVocalSelections[slotId] =
        normalizedInitial.vocalSlots.find((slot) => slot.slot === slotId)?.gender || "none";
    });

    setVocalSelections(nextVocalSelections);
    setBandCounts(getBandCounts(normalizedInitial));
    setProductionCounts(getProductionCounts(normalizedInitial));
    setVideoCounts(getVideoCounts(normalizedInitial));
  }, [normalizedInitial, open, vocalSlotIds]);

  const totalVocalists = Object.values(vocalSelections).filter((value) => value !== "none").length;
  const totalInstruments = Object.values(bandCounts).reduce((sum, count) => sum + count, 0);
  const totalProductionSlots = Object.values(productionCounts).reduce((sum, count) => sum + count, 0);
  const totalVideoSlots = Object.values(videoCounts).reduce((sum, count) => sum + count, 0);

  const handleSave = async () => {
    if (isVideoTemplate) {
      const videoSlots = VIDEO_FIELDS.flatMap((field) => field.slots.slice(0, videoCounts[field.key]));
      await onSave({
        ...normalizedInitial,
        videoSlots: videoSlots.length > 0 ? videoSlots : normalizedInitial.videoSlots,
      });
      return;
    }

    const productionSlots = PRODUCTION_FIELDS.flatMap((field) =>
      field.slots.slice(0, productionCounts[field.key]),
    );

    if (isProductionOnlyTemplate) {
      await onSave({
        ...normalizedInitial,
        productionSlots:
          productionSlots.length > 0 ? productionSlots : normalizedInitial.productionSlots,
      });
      return;
    }

    const vocalSlots = vocalSlotIds.flatMap((slotId) => {
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
      ...(bandCounts.pad ? ["pad"] : []),
    ];

    await onSave({
      ...normalizedInitial,
      vocalSlots: vocalSlots.length > 0 ? vocalSlots : normalizedInitial.vocalSlots,
      bandSlots: bandSlots.length > 0 ? bandSlots : normalizedInitial.bandSlots,
      productionSlots:
        productionSlots.length > 0 ? productionSlots : normalizedInitial.productionSlots,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{teamName} Template</DialogTitle>
        </DialogHeader>

        <div className="flex-1 space-y-6 overflow-y-auto pr-2">
          {isVideoTemplate ? (
            <>
              <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
                {totalVideoSlots} video slot{totalVideoSlots === 1 ? "" : "s"} configured for this team.
              </div>

              <div className="space-y-3">
                <div>
                  <h4 className="font-medium">Video Positions</h4>
                  <p className="text-sm text-muted-foreground">
                    Choose how many of each video position this team should have.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {VIDEO_FIELDS.map((field) => (
                    <div key={field.key} className="space-y-2">
                      <Label>{field.label}</Label>
                      <Select
                        value={String(videoCounts[field.key])}
                        onValueChange={(value) =>
                          setVideoCounts((prev) => ({ ...prev, [field.key]: Number(value) }))
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
            </>
          ) : (
            <>
              <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
                {isProductionOnlyTemplate ? (
                  <>
                    {totalProductionSlots} production slot{totalProductionSlots === 1 ? "" : "s"} configured for this team.
                  </>
                ) : (
                  <>
                    {totalVocalists} vocalist{totalVocalists === 1 ? "" : "s"} and {totalInstruments} instrument{totalInstruments === 1 ? "" : "s"} configured for this team
                    {showProductionTemplate ? `, plus ${totalProductionSlots} production slot${totalProductionSlots === 1 ? "" : "s"}` : ""}.
                  </>
                )}
              </div>

              {!isProductionOnlyTemplate && (
                <>
                  <div className="space-y-3">
                    <div>
                      <h4 className="font-medium">Vocalists</h4>
                      <p className="text-sm text-muted-foreground">
                        Choose how many vocal slots this team uses and whether each one should be male or female.
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {vocalSlotIds.map((slotId, index) => (
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
                      {bandFields.map((field) => (
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
                </>
              )}

              {showProductionTemplate && (
                <div className="space-y-3">
                  <div>
                    <h4 className="font-medium">Production</h4>
                    <p className="text-sm text-muted-foreground">
                      Choose which production positions this team should include.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {PRODUCTION_FIELDS.map((field) => (
                      <div key={field.key} className="space-y-2">
                        <Label>{field.label}</Label>
                        <Select
                          value={String(productionCounts[field.key])}
                          onValueChange={(value) =>
                            setProductionCounts((prev) => ({ ...prev, [field.key]: Number(value) }))
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
              )}
            </>
          )}
        </div>

        <DialogFooter className="border-t pt-4">
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
