import { useEffect, useMemo, useState } from "react";
import { formatDistanceToNowStrict, parseISO, differenceInCalendarDays } from "date-fns";
import {
  AlertTriangle,
  CalendarClock,
  CircleGauge,
  Disc3,
  Drum,
  Plus,
  Save,
  Settings2,
  Trash2,
  Wrench,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCampuses, useUserCampuses } from "@/hooks/useCampuses";
import {
  DrumKit,
  DrumKitInput,
  DrumKitPiece,
  DrumKitPieceInput,
  DrumPieceType,
  useDeleteDrumKit,
  useDrumKits,
  useDrumTechAccess,
  useUpsertDrumKit,
} from "@/hooks/useDrumTech";
import { useCampusSelectionOptional } from "@/components/layout/CampusSelectionContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

type PieceMeta = {
  label: string;
  hasHeads: boolean;
  defaultSize: number;
  x: number;
  y: number;
  accent: string;
};

const PIECE_META: Record<DrumPieceType, PieceMeta> = {
  kick: { label: "Kick", hasHeads: true, defaultSize: 22, x: 50, y: 68, accent: "bg-emerald-500" },
  snare: { label: "Snare", hasHeads: true, defaultSize: 14, x: 36, y: 58, accent: "bg-blue-500" },
  rack_tom: { label: "Rack Tom", hasHeads: true, defaultSize: 12, x: 46, y: 42, accent: "bg-cyan-500" },
  floor_tom: { label: "Floor Tom", hasHeads: true, defaultSize: 16, x: 65, y: 56, accent: "bg-orange-500" },
  hi_hats: { label: "Hi-Hats", hasHeads: false, defaultSize: 14, x: 22, y: 44, accent: "bg-amber-400" },
  left_crash: { label: "Left Crash", hasHeads: false, defaultSize: 18, x: 28, y: 20, accent: "bg-rose-500" },
  right_crash: { label: "Right Crash", hasHeads: false, defaultSize: 19, x: 70, y: 22, accent: "bg-pink-500" },
  ride: { label: "Ride", hasHeads: false, defaultSize: 21, x: 80, y: 42, accent: "bg-violet-500" },
  custom: { label: "Custom Piece", hasHeads: false, defaultSize: 18, x: 50, y: 18, accent: "bg-slate-500" },
};

const PIECE_TYPE_OPTIONS = Object.entries(PIECE_META).map(([value, meta]) => ({
  value: value as DrumPieceType,
  label: meta.label,
  hasHeads: meta.hasHeads,
  defaultSize: meta.defaultSize,
}));

const DEFAULT_PIECES: DrumKitPieceInput[] = [
  { piece_type: "kick", piece_label: "Kick", size_inches: 22, sort_order: 0, expected_head_life_days: 180 },
  { piece_type: "snare", piece_label: "Snare", size_inches: 14, sort_order: 1, expected_head_life_days: 120 },
  { piece_type: "rack_tom", piece_label: "Rack Tom", size_inches: 12, sort_order: 2, expected_head_life_days: 180 },
  { piece_type: "floor_tom", piece_label: "Floor Tom", size_inches: 16, sort_order: 3, expected_head_life_days: 180 },
  { piece_type: "hi_hats", piece_label: "Hi-Hats", size_inches: 14, sort_order: 4 },
  { piece_type: "left_crash", piece_label: "Left Crash", size_inches: 18, sort_order: 5 },
  { piece_type: "right_crash", piece_label: "Right Crash", size_inches: 19, sort_order: 6 },
  { piece_type: "ride", piece_label: "Ride", size_inches: 21, sort_order: 7 },
];

function formatSize(size: number) {
  return `${size}"`;
}

function getPieceMeta(type: string) {
  return PIECE_META[(type as DrumPieceType) || "custom"] || PIECE_META.custom;
}

function buildDefaultKit(campusId: string): DrumKitInput {
  return {
    campus_id: campusId,
    name: "",
    description: "",
    pieces: DEFAULT_PIECES.map((piece, index) => ({ ...piece, sort_order: index })),
  };
}

function getHealthSummary(piece: DrumKitPiece | DrumKitPieceInput) {
  const meta = getPieceMeta(piece.piece_type);
  if (!meta.hasHeads) {
    return {
      label: "No head tracking",
      tone: "neutral" as const,
      percentLeft: null,
      daysRemaining: null,
    };
  }

  if (!piece.head_installed_on || !piece.expected_head_life_days) {
    return {
      label: "Head data incomplete",
      tone: "neutral" as const,
      percentLeft: null,
      daysRemaining: null,
    };
  }

  const daysUsed = differenceInCalendarDays(new Date(), parseISO(piece.head_installed_on));
  const daysRemaining = piece.expected_head_life_days - daysUsed;
  const percentLeft = Math.max(0, Math.min(100, (daysRemaining / piece.expected_head_life_days) * 100));

  if (daysRemaining <= 0) {
    return { label: "Replacement due", tone: "critical" as const, percentLeft, daysRemaining };
  }
  if (percentLeft <= 25) {
    return { label: "Monitor closely", tone: "warning" as const, percentLeft, daysRemaining };
  }
  return { label: "Healthy", tone: "good" as const, percentLeft, daysRemaining };
}

function healthClasses(tone: ReturnType<typeof getHealthSummary>["tone"]) {
  switch (tone) {
    case "good":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
    case "warning":
      return "border-amber-500/40 bg-amber-500/10 text-amber-100";
    case "critical":
      return "border-rose-500/40 bg-rose-500/10 text-rose-100";
    default:
      return "border-slate-500/30 bg-slate-500/10 text-slate-200";
  }
}

function getPieceCoords(piece: DrumKitPiece, indexWithinType: number) {
  const meta = getPieceMeta(piece.piece_type);
  const offset = indexWithinType * 7;
  const x = piece.piece_type === "rack_tom" ? meta.x + offset : piece.piece_type === "floor_tom" ? meta.x + offset : meta.x;
  const y = piece.piece_type === "custom" ? meta.y + offset : meta.y;
  return { x, y };
}

function InteractiveKitStage({
  pieces,
  selectedPieceId,
  onSelect,
}: {
  pieces: DrumKitPiece[];
  selectedPieceId: string | null;
  onSelect: (pieceId: string) => void;
}) {
  const counts = new Map<string, number>();

  return (
    <div className="relative h-[420px] overflow-hidden rounded-3xl border border-border bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.16),transparent_35%),linear-gradient(180deg,rgba(15,23,42,0.96),rgba(15,23,42,0.82))] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="absolute inset-x-8 top-6 flex items-center justify-between text-xs uppercase tracking-[0.24em] text-slate-400">
        <span>Stage Plot</span>
        <span>Tap a piece to inspect it</span>
      </div>
      <div className="absolute inset-x-10 bottom-5 h-24 rounded-[2rem] border border-slate-800/80 bg-slate-950/70" />
      {pieces.map((piece) => {
        const seen = counts.get(piece.piece_type) || 0;
        counts.set(piece.piece_type, seen + 1);
        const meta = getPieceMeta(piece.piece_type);
        const health = getHealthSummary(piece);
        const coords = getPieceCoords(piece, seen);

        return (
          <button
            key={piece.id}
            type="button"
            onClick={() => onSelect(piece.id)}
            className={cn(
              "absolute -translate-x-1/2 -translate-y-1/2 rounded-2xl border px-3 py-2 text-left shadow-lg transition-all",
              selectedPieceId === piece.id
                ? "scale-105 border-white/70 bg-white/12 ring-2 ring-sky-400/50"
                : "border-white/10 bg-slate-950/75 hover:border-sky-300/40 hover:bg-slate-900/90",
            )}
            style={{ left: `${coords.x}%`, top: `${coords.y}%` }}
          >
            <div className="flex items-center gap-2">
              <span className={cn("h-2.5 w-2.5 rounded-full", meta.accent)} />
              <span className="text-sm font-medium text-slate-50">{piece.piece_label}</span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs text-slate-300">
              <span>{formatSize(piece.size_inches)}</span>
              {health.daysRemaining !== null && (
                <span className={cn("rounded-full border px-1.5 py-0.5", healthClasses(health.tone))}>
                  {health.daysRemaining > 0 ? `${health.daysRemaining}d left` : "Due"}
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function KitBuilderDialog({
  open,
  onOpenChange,
  campusId,
  initialKit,
  isSaving,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campusId: string;
  initialKit?: DrumKit | null;
  isSaving: boolean;
  onSave: (input: DrumKitInput) => Promise<void>;
}) {
  const [form, setForm] = useState<DrumKitInput>(() => buildDefaultKit(campusId));

  useEffect(() => {
    if (!open) return;

    if (initialKit) {
      setForm({
        id: initialKit.id,
        campus_id: campusId,
        name: initialKit.name,
        description: initialKit.description || "",
        pieces: initialKit.drum_kit_pieces.map((piece, index) => ({
          id: piece.id,
          piece_type: piece.piece_type,
          piece_label: piece.piece_label,
          size_inches: piece.size_inches,
          sort_order: index,
          head_brand: piece.head_brand,
          head_model: piece.head_model,
          head_installed_on: piece.head_installed_on,
          expected_head_life_days: piece.expected_head_life_days,
          notes: piece.notes,
        })),
      });
      return;
    }

    setForm(buildDefaultKit(campusId));
  }, [campusId, initialKit, open]);

  const updatePiece = (index: number, patch: Partial<DrumKitPieceInput>) => {
    setForm((current) => ({
      ...current,
      pieces: current.pieces.map((piece, pieceIndex) =>
        pieceIndex === index ? { ...piece, ...patch } : piece,
      ),
    }));
  };

  const addPiece = () => {
    setForm((current) => ({
      ...current,
      pieces: [
        ...current.pieces,
        {
          piece_type: "custom",
          piece_label: "Custom Piece",
          size_inches: PIECE_META.custom.defaultSize,
          sort_order: current.pieces.length,
        },
      ],
    }));
  };

  const removePiece = (index: number) => {
    setForm((current) => ({
      ...current,
      pieces: current.pieces
        .filter((_, pieceIndex) => pieceIndex !== index)
        .map((piece, pieceIndex) => ({ ...piece, sort_order: pieceIndex })),
    }));
  };

  const handleSave = async () => {
    await onSave({
      ...form,
      campus_id: campusId,
      pieces: form.pieces
        .filter((piece) => piece.piece_label.trim().length > 0 && piece.size_inches > 0)
        .map((piece, index) => ({ ...piece, sort_order: index })),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initialKit ? "Edit Kit" : "Build a Kit"}</DialogTitle>
          <DialogDescription>
            Create a digital version of the kit, set head metadata, and keep its life-cycle visible to the team.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="kit-name">Kit name</Label>
              <Input
                id="kit-name"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Main Sanctuary Kit"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="kit-description">Notes</Label>
              <Textarea
                id="kit-description"
                value={form.description || ""}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="Shell pack, rotation notes, tuning quirks, hardware issues..."
                rows={6}
              />
            </div>
            <div className="rounded-2xl border border-border bg-muted/20 p-4">
              <p className="text-sm font-medium text-foreground">Builder guidance</p>
              <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
                <li>Use one entry per physical piece on the kit.</li>
                <li>Only drum pieces need head brand, model, and lifespan.</li>
                <li>Cymbals stay interactive in the stage plot but won’t show head wear.</li>
              </ul>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Pieces</p>
                <p className="text-sm text-muted-foreground">Define the shell pack and cymbal layout.</p>
              </div>
              <Button type="button" variant="outline" onClick={addPiece}>
                <Plus className="mr-2 h-4 w-4" />
                Add piece
              </Button>
            </div>

            <div className="space-y-3">
              {form.pieces.map((piece, index) => {
                const meta = getPieceMeta(piece.piece_type);

                return (
                  <div key={`${piece.id || "new"}-${index}`} className="rounded-2xl border border-border bg-card p-4">
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <div className="space-y-2">
                        <Label>Piece type</Label>
                        <Select
                          value={piece.piece_type}
                          onValueChange={(value) => {
                            const option = PIECE_TYPE_OPTIONS.find((item) => item.value === value);
                            updatePiece(index, {
                              piece_type: value,
                              piece_label: option?.label || "Custom Piece",
                              size_inches: option?.defaultSize || piece.size_inches,
                              expected_head_life_days: option?.hasHeads ? piece.expected_head_life_days ?? 180 : null,
                              head_brand: option?.hasHeads ? piece.head_brand ?? "" : null,
                              head_model: option?.hasHeads ? piece.head_model ?? "" : null,
                              head_installed_on: option?.hasHeads ? piece.head_installed_on ?? "" : null,
                            });
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select piece" />
                          </SelectTrigger>
                          <SelectContent>
                            {PIECE_TYPE_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Label</Label>
                        <Input
                          value={piece.piece_label}
                          onChange={(event) => updatePiece(index, { piece_label: event.target.value })}
                          placeholder="Rack Tom 1"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Size (inches)</Label>
                        <Input
                          type="number"
                          min="1"
                          step="0.5"
                          value={piece.size_inches}
                          onChange={(event) => updatePiece(index, { size_inches: Number(event.target.value) || 0 })}
                        />
                      </div>

                      <div className="flex items-end justify-end">
                        <Button type="button" variant="ghost" size="icon" onClick={() => removePiece(index)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {meta.hasHeads && (
                      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <div className="space-y-2">
                          <Label>Head brand</Label>
                          <Input
                            value={piece.head_brand || ""}
                            onChange={(event) => updatePiece(index, { head_brand: event.target.value })}
                            placeholder="Remo"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Head model</Label>
                          <Input
                            value={piece.head_model || ""}
                            onChange={(event) => updatePiece(index, { head_model: event.target.value })}
                            placeholder="Emperor Clear"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Installed on</Label>
                          <Input
                            type="date"
                            value={piece.head_installed_on || ""}
                            onChange={(event) => updatePiece(index, { head_installed_on: event.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Expected life (days)</Label>
                          <Input
                            type="number"
                            min="1"
                            value={piece.expected_head_life_days || ""}
                            onChange={(event) =>
                              updatePiece(index, {
                                expected_head_life_days: event.target.value ? Number(event.target.value) : null,
                              })
                            }
                          />
                        </div>
                      </div>
                    )}

                    <div className="mt-4 space-y-2">
                      <Label>Piece notes</Label>
                      <Textarea
                        value={piece.notes || ""}
                        onChange={(event) => updatePiece(index, { notes: event.target.value })}
                        placeholder="Coating wearing thin, ring control added, felt replacement needed..."
                        rows={2}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || form.name.trim().length === 0 || form.pieces.length === 0}
          >
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? "Saving..." : initialKit ? "Save changes" : "Create kit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function DrumTech() {
  const { user, canManageTeam } = useAuth();
  const { data: campuses = [] } = useCampuses();
  const { data: userCampuses = [] } = useUserCampuses(user?.id);
  const campusCtx = useCampusSelectionOptional();
  const selectedCampusId = campusCtx?.selectedCampusId || userCampuses[0]?.campus_id || null;
  const setSelectedCampusId = campusCtx?.setSelectedCampusId;

  const access = useDrumTechAccess(selectedCampusId);
  const { data: kits = [], isLoading } = useDrumKits(selectedCampusId);
  const upsertKit = useUpsertDrumKit();
  const deleteKit = useDeleteDrumKit();

  const availableCampuses = useMemo(() => {
    if (canManageTeam) return campuses;
    return userCampuses.map((entry) => entry.campuses);
  }, [campuses, canManageTeam, userCampuses]);

  const [selectedKitId, setSelectedKitId] = useState<string | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingKit, setEditingKit] = useState<DrumKit | null>(null);
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);

  useEffect(() => {
    if (!kits.length) {
      setSelectedKitId(null);
      setSelectedPieceId(null);
      return;
    }

    if (!selectedKitId || !kits.some((kit) => kit.id === selectedKitId)) {
      setSelectedKitId(kits[0].id);
    }
  }, [kits, selectedKitId]);

  const selectedKit = kits.find((kit) => kit.id === selectedKitId) || null;

  useEffect(() => {
    if (!selectedKit?.drum_kit_pieces.length) {
      setSelectedPieceId(null);
      return;
    }

    if (!selectedPieceId || !selectedKit.drum_kit_pieces.some((piece) => piece.id === selectedPieceId)) {
      setSelectedPieceId(selectedKit.drum_kit_pieces[0].id);
    }
  }, [selectedKit, selectedPieceId]);

  const selectedPiece = selectedKit?.drum_kit_pieces.find((piece) => piece.id === selectedPieceId) || null;

  const stats = useMemo(() => {
    const headTrackedPieces = selectedKit?.drum_kit_pieces.filter((piece) => getPieceMeta(piece.piece_type).hasHeads) || [];
    const dueCount = headTrackedPieces.filter((piece) => getHealthSummary(piece).tone === "critical").length;
    const monitorCount = headTrackedPieces.filter((piece) => getHealthSummary(piece).tone === "warning").length;
    return { headTrackedPieces, dueCount, monitorCount };
  }, [selectedKit]);

  const openCreate = () => {
    setEditingKit(null);
    setBuilderOpen(true);
  };

  const openEdit = () => {
    if (!selectedKit) return;
    setEditingKit(selectedKit);
    setBuilderOpen(true);
  };

  const handleSave = async (input: DrumKitInput) => {
    await upsertKit.mutateAsync(input);
    setBuilderOpen(false);
    setEditingKit(null);
  };

  const handleDelete = async () => {
    if (!selectedKit || !selectedCampusId) return;
    if (!window.confirm(`Delete ${selectedKit.name}? This removes its full digital kit definition.`)) return;
    await deleteKit.mutateAsync({ kitId: selectedKit.id, campusId: selectedCampusId });
  };

  if (!selectedCampusId) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 py-10">
        <h1 className="text-3xl font-semibold">Drum Tech</h1>
        <p className="text-muted-foreground">Assign the user to a campus first so the kit health workspace has a home.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-28">
      <section className="overflow-hidden rounded-[2rem] border border-slate-800 bg-[linear-gradient(145deg,rgba(14,116,144,0.22),rgba(15,23,42,0.92))] p-6 text-white shadow-[0_30px_80px_-45px_rgba(14,165,233,0.55)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <Badge variant="outline" className="border-white/20 bg-white/10 text-white">
              Drum Tech Workspace
            </Badge>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">Kit Health</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-200/82">
                Build a digital version of each campus kit, track head age, and keep replacement decisions grounded in real wear.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-slate-200/82">
              <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1">
                {access.canEditCampus ? "Editable by Drum Tech" : "Read only at this campus"}
              </span>
              <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1">
                Head lifespan forecasts per drum
              </span>
              <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1">
                Interactive stage plot
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {availableCampuses.length > 1 && setSelectedCampusId && (
              <Select value={selectedCampusId} onValueChange={setSelectedCampusId}>
                <SelectTrigger className="min-w-[220px] border-white/20 bg-slate-950/35 text-white">
                  <SelectValue placeholder="Select campus" />
                </SelectTrigger>
                <SelectContent>
                  {availableCampuses.map((campus) => (
                    <SelectItem key={campus.id} value={campus.id}>
                      {campus.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {access.canEditCampus && (
              <Button className="bg-white text-slate-950 hover:bg-slate-100" onClick={openCreate}>
                <Plus className="mr-2 h-4 w-4" />
                New kit
              </Button>
            )}
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <Card className="border-border/80">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Drum className="h-5 w-5 text-primary" />
                Campus Kits
              </CardTitle>
              <CardDescription>
                {isLoading ? "Loading kits..." : `${kits.length} kit${kits.length === 1 ? "" : "s"} at this campus`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {kits.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                  No kits yet. Create the first digital build for this campus.
                </div>
              ) : (
                kits.map((kit) => {
                  const tracked = kit.drum_kit_pieces.filter((piece) => getPieceMeta(piece.piece_type).hasHeads);
                  const overdue = tracked.filter((piece) => getHealthSummary(piece).tone === "critical").length;

                  return (
                    <button
                      key={kit.id}
                      type="button"
                      onClick={() => setSelectedKitId(kit.id)}
                      className={cn(
                        "w-full rounded-2xl border p-4 text-left transition-colors",
                        selectedKitId === kit.id
                          ? "border-primary bg-primary/8"
                          : "border-border bg-background hover:border-primary/40 hover:bg-muted/30",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-foreground">{kit.name}</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {kit.drum_kit_pieces.length} pieces
                          </p>
                        </div>
                        {overdue > 0 && <Badge variant="destructive">{overdue} due</Badge>}
                      </div>
                    </button>
                  );
                })
              )}
            </CardContent>
          </Card>
        </aside>

        <section className="space-y-6">
          {!selectedKit ? (
            <Card className="border-dashed border-border/70">
              <CardContent className="flex min-h-[380px] flex-col items-center justify-center gap-4 text-center">
                <div className="rounded-2xl bg-primary/10 p-4 text-primary">
                  <Wrench className="h-8 w-8" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-semibold">No kit selected</h2>
                  <p className="max-w-md text-sm text-muted-foreground">
                    Pick a kit from the list or create a new digital kit build for this campus.
                  </p>
                </div>
                {access.canEditCampus && (
                  <Button onClick={openCreate}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create the first kit
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="rounded-xl bg-sky-500/10 p-2 text-sky-400">
                        <CircleGauge className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Tracked heads</p>
                        <p className="text-2xl font-semibold">{stats.headTrackedPieces.length}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="rounded-xl bg-amber-500/10 p-2 text-amber-400">
                        <AlertTriangle className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Monitor soon</p>
                        <p className="text-2xl font-semibold">{stats.monitorCount}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="rounded-xl bg-rose-500/10 p-2 text-rose-400">
                        <CalendarClock className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Replacement due</p>
                        <p className="text-2xl font-semibold">{stats.dueCount}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card className="overflow-hidden">
                <CardHeader className="border-b border-border/60 bg-muted/20">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <CardTitle className="text-2xl">{selectedKit.name}</CardTitle>
                      <CardDescription className="mt-1 max-w-2xl">
                        {selectedKit.description || "No notes added for this kit yet."}
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      {access.canEditCampus && (
                        <>
                          <Button variant="outline" onClick={openEdit}>
                            <Settings2 className="mr-2 h-4 w-4" />
                            Edit kit
                          </Button>
                          <Button
                            variant="outline"
                            className="border-rose-500/30 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                            onClick={handleDelete}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-6 p-6 xl:grid-cols-[1.4fr_0.8fr]">
                  <InteractiveKitStage
                    pieces={selectedKit.drum_kit_pieces}
                    selectedPieceId={selectedPieceId}
                    onSelect={setSelectedPieceId}
                  />

                  <div className="space-y-4">
                    {selectedPiece ? (
                      <Card className="border-border/70 bg-muted/20">
                        <CardHeader>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <CardTitle className="text-xl">{selectedPiece.piece_label}</CardTitle>
                              <CardDescription>
                                {getPieceMeta(selectedPiece.piece_type).label} · {formatSize(selectedPiece.size_inches)}
                              </CardDescription>
                            </div>
                            <Disc3 className="h-5 w-5 text-muted-foreground" />
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {(() => {
                            const health = getHealthSummary(selectedPiece);
                            const meta = getPieceMeta(selectedPiece.piece_type);
                            return (
                              <>
                                <div className={cn("rounded-2xl border p-3 text-sm", healthClasses(health.tone))}>
                                  {health.label}
                                  {health.daysRemaining !== null && (
                                    <span className="ml-2 font-medium">
                                      {health.daysRemaining > 0 ? `${health.daysRemaining} days remaining` : "replace now"}
                                    </span>
                                  )}
                                </div>

                                {meta.hasHeads && (
                                  <>
                                    <div className="space-y-2">
                                      <div className="flex items-center justify-between text-sm">
                                        <span className="text-muted-foreground">Estimated head life</span>
                                        <span className="font-medium">
                                          {health.percentLeft !== null ? `${Math.round(health.percentLeft)}% left` : "No estimate"}
                                        </span>
                                      </div>
                                      <Progress value={health.percentLeft ?? 0} />
                                    </div>

                                    <div className="grid gap-3 sm:grid-cols-2">
                                      <div className="rounded-xl border border-border p-3">
                                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Head spec</p>
                                        <p className="mt-1 font-medium">
                                          {[selectedPiece.head_brand, selectedPiece.head_model].filter(Boolean).join(" " ) || "Not recorded"}
                                        </p>
                                      </div>
                                      <div className="rounded-xl border border-border p-3">
                                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Installed</p>
                                        <p className="mt-1 font-medium">
                                          {selectedPiece.head_installed_on
                                            ? `${selectedPiece.head_installed_on} · ${formatDistanceToNowStrict(parseISO(selectedPiece.head_installed_on), { addSuffix: true })}`
                                            : "No install date"}
                                        </p>
                                      </div>
                                    </div>
                                  </>
                                )}

                                {!meta.hasHeads && (
                                  <div className="rounded-xl border border-border p-3 text-sm text-muted-foreground">
                                    Cymbals and hardware stay interactive here, but head wear tracking only applies to drum shells.
                                  </div>
                                )}

                                {selectedPiece.notes && (
                                  <div className="rounded-xl border border-border p-3">
                                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Notes</p>
                                    <p className="mt-1 text-sm">{selectedPiece.notes}</p>
                                  </div>
                                )}
                              </>
                            );
                          })()}
                        </CardContent>
                      </Card>
                    ) : (
                      <Card className="border-dashed border-border/70">
                        <CardContent className="py-10 text-center text-sm text-muted-foreground">
                          Select a piece from the stage plot to inspect its health.
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </section>
      </div>

      <KitBuilderDialog
        open={builderOpen}
        onOpenChange={(open) => {
          setBuilderOpen(open);
          if (!open) setEditingKit(null);
        }}
        campusId={selectedCampusId}
        initialKit={editingKit}
        isSaving={upsertKit.isPending}
        onSave={handleSave}
      />
    </div>
  );
}
