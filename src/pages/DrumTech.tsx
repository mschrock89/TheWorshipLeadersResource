import { FormEvent, MouseEvent, PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { differenceInCalendarDays, formatDistanceToNowStrict, isValid, parseISO } from "date-fns";
import {
  AlertTriangle,
  CalendarClock,
  CircleGauge,
  Disc3,
  Drum,
  Lock,
  MessageSquare,
  Plus,
  RotateCcw,
  Save,
  Send,
  Settings2,
  Trash2,
  Unlock,
  Wrench,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCampuses, useUserCampuses } from "@/hooks/useCampuses";
import {
  DrumTechComment,
  DrumKit,
  DrumKitInput,
  DrumKitPiece,
  DrumKitPieceInput,
  DrumPieceType,
  CymbalCrackMarker,
  useCreateDrumTechComment,
  useDeleteDrumKit,
  useDrumKits,
  useDrumTechComments,
  useDrumTechAccess,
  useUpsertDrumKit,
} from "@/hooks/useDrumTech";
import { useCampusSelectionOptional } from "@/components/layout/CampusSelectionContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  {
    piece_type: "kick",
    piece_label: "Kick",
    size_inches: 22,
    sort_order: 0,
    batter_expected_head_life_days: 180,
    reso_expected_head_life_days: 365,
  },
  {
    piece_type: "snare",
    piece_label: "Snare",
    size_inches: 14,
    sort_order: 1,
    batter_expected_head_life_days: 120,
    reso_expected_head_life_days: 240,
  },
  {
    piece_type: "rack_tom",
    piece_label: "Rack Tom",
    size_inches: 12,
    sort_order: 2,
    batter_expected_head_life_days: 180,
    reso_expected_head_life_days: 365,
  },
  {
    piece_type: "floor_tom",
    piece_label: "Floor Tom",
    size_inches: 16,
    sort_order: 3,
    batter_expected_head_life_days: 180,
    reso_expected_head_life_days: 365,
  },
  { piece_type: "hi_hats", piece_label: "Hi-Hats", size_inches: 14, sort_order: 4 },
  { piece_type: "left_crash", piece_label: "Left Crash", size_inches: 18, sort_order: 5 },
  { piece_type: "right_crash", piece_label: "Right Crash", size_inches: 19, sort_order: 6 },
  { piece_type: "ride", piece_label: "Ride", size_inches: 21, sort_order: 7 },
];

const KIT_BUILDER_DRAFT_PREFIX = "drum-tech-kit-builder-draft";
const STAGE_CANVAS_WIDTH = 1000;
const STAGE_CANVAS_HEIGHT = 560;

type HeadSide = "batter" | "reso";
type HeadHealth = {
  label: string;
  tone: "good" | "warning" | "critical" | "neutral";
  percentLeft: number | null;
  daysRemaining: number | null;
};

type WearBand = "green" | "yellow" | "orange" | "red" | "neutral";

function formatSize(size: number) {
  return `${size}"`;
}

function getInitials(name: string | null | undefined) {
  return (name || "Team Member")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "TM";
}

function getPieceMeta(type: string) {
  return PIECE_META[(type as DrumPieceType) || "custom"] || PIECE_META.custom;
}

function isCymbalPiece(type: string) {
  return ["hi_hats", "left_crash", "right_crash", "ride"].includes(type);
}

function buildDefaultKit(campusId: string): DrumKitInput {
  return {
    campus_id: campusId,
    name: "",
    description: "",
    pieces: DEFAULT_PIECES.map((piece, index) => ({ ...piece, sort_order: index })),
  };
}

function normalizeDraftPiece(piece: Partial<DrumKitPieceInput>, index: number): DrumKitPieceInput {
  const rawMarkers = Array.isArray(piece.cymbal_crack_markers) ? piece.cymbal_crack_markers : [];

  return {
    id: typeof piece.id === "string" ? piece.id : undefined,
    layout_x: typeof piece.layout_x === "number" ? piece.layout_x : null,
    layout_y: typeof piece.layout_y === "number" ? piece.layout_y : null,
    piece_type: typeof piece.piece_type === "string" && piece.piece_type.length > 0 ? piece.piece_type : "custom",
    piece_label: typeof piece.piece_label === "string" ? piece.piece_label : "Custom Piece",
    size_inches: typeof piece.size_inches === "number" && Number.isFinite(piece.size_inches) ? piece.size_inches : 18,
    sort_order: typeof piece.sort_order === "number" ? piece.sort_order : index,
    cymbal_brand: typeof piece.cymbal_brand === "string" ? piece.cymbal_brand : null,
    cymbal_crack_markers: rawMarkers
      .filter((marker): marker is CymbalCrackMarker => {
        if (!marker || typeof marker !== "object") return false;
        return typeof marker.x === "number" && typeof marker.y === "number";
      })
      .map((marker, markerIndex) => ({
        id: typeof marker.id === "string" && marker.id.length > 0 ? marker.id : `marker-${markerIndex}`,
        x: marker.x,
        y: marker.y,
        description: typeof marker.description === "string" ? marker.description : "",
      })),
    cymbal_model: typeof piece.cymbal_model === "string" ? piece.cymbal_model : null,
    batter_head_brand: typeof piece.batter_head_brand === "string" ? piece.batter_head_brand : null,
    batter_head_model: typeof piece.batter_head_model === "string" ? piece.batter_head_model : null,
    batter_head_installed_on: typeof piece.batter_head_installed_on === "string" ? piece.batter_head_installed_on : null,
    batter_expected_head_life_days:
      typeof piece.batter_expected_head_life_days === "number" ? piece.batter_expected_head_life_days : null,
    reso_head_brand: typeof piece.reso_head_brand === "string" ? piece.reso_head_brand : null,
    reso_head_model: typeof piece.reso_head_model === "string" ? piece.reso_head_model : null,
    reso_head_installed_on: typeof piece.reso_head_installed_on === "string" ? piece.reso_head_installed_on : null,
    reso_expected_head_life_days:
      typeof piece.reso_expected_head_life_days === "number" ? piece.reso_expected_head_life_days : null,
    notes: typeof piece.notes === "string" ? piece.notes : null,
  };
}

function normalizeDraft(input: Partial<DrumKitInput>, campusId: string): DrumKitInput {
  return {
    id: typeof input.id === "string" ? input.id : undefined,
    campus_id: typeof input.campus_id === "string" && input.campus_id.length > 0 ? input.campus_id : campusId,
    name: typeof input.name === "string" ? input.name : "",
    description: typeof input.description === "string" ? input.description : "",
    pieces: Array.isArray(input.pieces) ? input.pieces.map((piece, index) => normalizeDraftPiece(piece, index)) : [],
  };
}

function buildFormFromKit(kit: DrumKit, campusId: string): DrumKitInput {
  return {
    id: kit.id,
    campus_id: campusId,
    name: kit.name,
    description: kit.description || "",
    pieces: kit.drum_kit_pieces.map((piece, index) => ({
      id: piece.id,
      layout_x: piece.layout_x,
      layout_y: piece.layout_y,
      piece_type: piece.piece_type,
      piece_label: piece.piece_label,
      size_inches: piece.size_inches,
      sort_order: index,
      cymbal_brand: piece.cymbal_brand,
      cymbal_crack_markers: piece.cymbal_crack_markers || [],
      cymbal_model: piece.cymbal_model,
      batter_head_brand: piece.batter_head_brand,
      batter_head_model: piece.batter_head_model,
      batter_head_installed_on: piece.batter_head_installed_on,
      batter_expected_head_life_days: piece.batter_expected_head_life_days,
      reso_head_brand: piece.reso_head_brand,
      reso_head_model: piece.reso_head_model,
      reso_head_installed_on: piece.reso_head_installed_on,
      reso_expected_head_life_days: piece.reso_expected_head_life_days,
      notes: piece.notes,
    })),
  };
}

function mergeDraftWithKit(draft: DrumKitInput, kit: DrumKit, campusId: string): DrumKitInput {
  const base = buildFormFromKit(kit, campusId);
  const draftById = new Map(draft.pieces.filter((piece) => piece.id).map((piece) => [piece.id!, piece]));

  const mergedPieces = base.pieces.map((basePiece, index) => {
    const draftPiece = draftById.get(basePiece.id || "") || draft.pieces[index];
    if (!draftPiece) return basePiece;

    return {
      ...basePiece,
      ...draftPiece,
      id: basePiece.id,
      layout_x: draftPiece.layout_x ?? basePiece.layout_x,
      layout_y: draftPiece.layout_y ?? basePiece.layout_y,
      sort_order: index,
    };
  });

  const extraPieces = draft.pieces
    .filter((piece) => !piece.id || !base.pieces.some((basePiece) => basePiece.id === piece.id))
    .map((piece, index) => ({ ...piece, sort_order: mergedPieces.length + index }));

  return {
    ...base,
    ...draft,
    id: base.id,
    campus_id: campusId,
    pieces: [...mergedPieces, ...extraPieces],
  };
}

function getBuilderDraftKey(campusId: string, kitId?: string | null) {
  return `${KIT_BUILDER_DRAFT_PREFIX}:${campusId}:${kitId || "new"}`;
}

function getHeadHealth(
  installedOn: string | null | undefined,
  expectedLifeDays: number | null | undefined,
): HeadHealth {
  if (!installedOn || !expectedLifeDays) {
    return {
      label: "Head data incomplete",
      tone: "neutral",
      percentLeft: null,
      daysRemaining: null,
    };
  }

  const parsedDate = parseISO(installedOn);
  if (!isValid(parsedDate)) {
    return {
      label: "Head data incomplete",
      tone: "neutral",
      percentLeft: null,
      daysRemaining: null,
    };
  }

  const daysUsed = differenceInCalendarDays(new Date(), parsedDate);
  const daysRemaining = expectedLifeDays - daysUsed;
  const percentLeft = Math.max(0, Math.min(100, (daysRemaining / expectedLifeDays) * 100));

  if (daysRemaining <= 0) {
    return { label: "Replacement due", tone: "critical", percentLeft, daysRemaining };
  }
  if (percentLeft <= 25) {
    return { label: "Monitor closely", tone: "warning", percentLeft, daysRemaining };
  }
  return { label: "Healthy", tone: "good", percentLeft, daysRemaining };
}

function formatInstalledDate(installedOn: string | null | undefined) {
  if (!installedOn) return "No install date";

  const parsedDate = parseISO(installedOn);
  if (!isValid(parsedDate)) return "Install date is invalid";

  return `${installedOn} · ${formatDistanceToNowStrict(parsedDate, { addSuffix: true })}`;
}

function getTodayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function getPieceHeadHealth(piece: DrumKitPiece | DrumKitPieceInput, side: HeadSide): HeadHealth {
  if (side === "batter") {
    return getHeadHealth(piece.batter_head_installed_on, piece.batter_expected_head_life_days);
  }
  return getHeadHealth(piece.reso_head_installed_on, piece.reso_expected_head_life_days);
}

function getPieceHealthSummary(piece: DrumKitPiece | DrumKitPieceInput): HeadHealth {
  const meta = getPieceMeta(piece.piece_type);
  if (!meta.hasHeads) {
    return {
      label: "No head tracking",
      tone: "neutral",
      percentLeft: null,
      daysRemaining: null,
    };
  }

  const batter = getPieceHeadHealth(piece, "batter");
  const reso = getPieceHeadHealth(piece, "reso");
  const ordered = [batter, reso];

  if (ordered.some((head) => head.tone === "critical")) {
    return { ...ordered.find((head) => head.tone === "critical")!, label: "At least one head is due" };
  }
  if (ordered.some((head) => head.tone === "warning")) {
    return { ...ordered.find((head) => head.tone === "warning")!, label: "One head needs attention" };
  }
  if (ordered.every((head) => head.tone === "neutral")) {
    return { label: "Head data incomplete", tone: "neutral", percentLeft: null, daysRemaining: null };
  }
  const primary = ordered.find((head) => head.tone === "good") || ordered[0];
  return { ...primary, label: "Both heads look healthy" };
}

function healthClasses(tone: HeadHealth["tone"]) {
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
  if (piece.layout_x != null && piece.layout_y != null) {
    return { x: piece.layout_x, y: piece.layout_y };
  }
  const meta = getPieceMeta(piece.piece_type);
  const offset = indexWithinType * 7;
  const x = piece.piece_type === "rack_tom" ? meta.x + offset : piece.piece_type === "floor_tom" ? meta.x + offset : meta.x;
  const y = piece.piece_type === "custom" ? meta.y + offset : meta.y;
  return { x, y };
}

function getPieceDimensions(piece: DrumKitPiece) {
  const isCymbal = isCymbalPiece(piece.piece_type);
  const cymbalBase = Math.max(62, Math.min(118, piece.size_inches * 4.8));
  const shellBase = Math.max(54, Math.min(132, piece.size_inches * 4.45));

  if (piece.piece_type === "kick") {
    const size = Math.max(108, Math.min(144, piece.size_inches * 5.6));
    return { width: size, height: size };
  }

  if (isCymbal) {
    return { width: cymbalBase, height: cymbalBase };
  }

  const size =
    piece.piece_type === "floor_tom"
      ? shellBase * 1.08
      : piece.piece_type === "snare"
        ? shellBase * 0.9
        : shellBase * 0.96;

  return { width: size, height: size };
}

function getStageScaleFactor(stageWidth: number, stageHeight: number) {
  if (!stageWidth || !stageHeight) return 1;
  if (stageWidth < 640) return 0.74;
  return 1;
}

function getWearDisplay(piece: DrumKitPiece) {
  const health = getPieceHealthSummary(piece);
  if (health.percentLeft === null) {
    return { value: "--", band: "neutral" as WearBand };
  }

  return {
    value: `${Math.round(health.percentLeft)}%`,
    band: getWearBand(health.percentLeft),
  };
}

function getWearBand(percentLeft: number): WearBand {
  if (percentLeft >= 80) return "green";
  if (percentLeft >= 50) return "yellow";
  if (percentLeft >= 30) return "orange";
  return "red";
}

function getWearTextClasses(band: WearBand) {
  switch (band) {
    case "green":
      return "text-emerald-500";
    case "yellow":
      return "text-amber-400";
    case "orange":
      return "text-orange-500";
    case "red":
      return "text-rose-500";
    default:
      return "text-slate-400";
  }
}

function getWearRingClasses(band: WearBand) {
  switch (band) {
    case "green":
      return "border-emerald-400/85";
    case "yellow":
      return "border-yellow-400/90";
    case "orange":
      return "border-orange-500/90";
    case "red":
      return "border-rose-500/90";
    default:
      return "border-slate-500/60";
  }
}

function getStagePieceClasses(piece: DrumKitPiece, isSelected: boolean) {
  if (isCymbalPiece(piece.piece_type)) {
    return cn(
      "rounded-full border border-amber-100/45 bg-[radial-gradient(circle_at_38%_28%,rgba(255,251,214,0.98),rgba(249,229,152,0.98)_18%,rgba(233,168,26,0.96)_52%,rgba(162,92,12,0.98)_100%)] shadow-[inset_0_10px_30px_rgba(255,255,255,0.32),inset_0_-18px_28px_rgba(120,53,15,0.34),0_18px_26px_rgba(0,0,0,0.22)]",
      isSelected && "ring-[4px] ring-sky-400/80 ring-offset-2 ring-offset-[#020817]",
    );
  }

  const health = getPieceHealthSummary(piece);
  const band = health.percentLeft === null ? "neutral" : getWearBand(health.percentLeft);
  const toneClasses =
    band === "green"
      ? "border-emerald-500/70 bg-emerald-500/10"
      : band === "yellow"
        ? "border-amber-400/70 bg-amber-400/10"
        : band === "orange"
          ? "border-orange-500/75 bg-orange-500/10"
          : band === "red"
          ? "border-rose-500/75 bg-rose-500/10"
          : "border-slate-500/60 bg-slate-500/10";

  return cn(
    "rounded-full border-[4px] bg-[radial-gradient(circle_at_50%_44%,rgba(43,19,52,0.92),rgba(28,13,39,0.94)_50%,rgba(20,9,28,0.98)_100%)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03),0_18px_30px_rgba(0,0,0,0.22)]",
    toneClasses,
    isSelected && "ring-[4px] ring-sky-400/80 ring-offset-2 ring-offset-[#020817]",
  );
}

function CymbalCrackMonitor({
  markers,
  onAdd,
  onUpdate,
  onRemove,
  editable,
}: {
  markers: CymbalCrackMarker[];
  onAdd: (marker: CymbalCrackMarker) => void;
  onUpdate: (markerId: string, description: string) => void;
  onRemove: (markerId: string) => void;
  editable: boolean;
}) {
  const monitorRef = useRef<HTMLButtonElement | null>(null);

  const handleAddMarker = (event: MouseEvent<HTMLButtonElement>) => {
    if (!editable || !monitorRef.current) return;
    const rect = monitorRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100));

    onAdd({
      id: crypto.randomUUID(),
      x,
      y,
      description: "",
    });
  };

  return (
    <div className="space-y-4">
      <button
        ref={monitorRef}
        type="button"
        onClick={handleAddMarker}
        className={cn(
          "relative mx-auto block aspect-square w-full max-w-[260px] rounded-full border border-amber-300/25 bg-[radial-gradient(circle_at_30%_30%,rgba(254,243,199,0.85),rgba(217,119,6,0.92))] shadow-[inset_0_6px_22px_rgba(255,255,255,0.22),0_12px_24px_rgba(0,0,0,0.18)]",
          editable ? "cursor-crosshair" : "cursor-default",
        )}
      >
        <span className="absolute inset-3 rounded-full border border-white/20" />
        <span className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/50 bg-white/40" />
        {markers.map((marker, index) => (
          <span
            key={marker.id}
            className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-rose-500 shadow-[0_0_0_4px_rgba(244,63,94,0.18)]"
            style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
            title={marker.description || `Crack ${index + 1}`}
          />
        ))}
      </button>

      <div className="space-y-3">
        {markers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {editable ? "Click the cymbal to pin a crack location." : "No crack markers logged."}
          </p>
        ) : (
          markers.map((marker, index) => (
            <div key={marker.id} className="rounded-xl border border-border p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-foreground">Crack {index + 1}</p>
                  <p className="text-xs text-muted-foreground">
                    Position: {Math.round(marker.x)}% x, {Math.round(marker.y)}% y
                  </p>
                </div>
                {editable && (
                  <Button type="button" variant="ghost" size="icon" onClick={() => onRemove(marker.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <Textarea
                className="mt-3"
                value={marker.description}
                onChange={(event) => onUpdate(marker.id, event.target.value)}
                placeholder="Describe the crack length, edge location, or whether it is spreading."
                rows={2}
                disabled={!editable}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function InteractiveKitStage({
  pieces,
  selectedPieceId,
  onSelect,
  editable,
  onMove,
}: {
  pieces: DrumKitPiece[];
  selectedPieceId: string | null;
  onSelect: (pieceId: string) => void;
  editable: boolean;
  onMove: (pieceId: string, x: number, y: number) => void;
}) {
  const counts = new Map<string, number>();
  const stageFrameRef = useRef<HTMLDivElement | null>(null);
  const stageCanvasRef = useRef<HTMLDivElement | null>(null);
  const [draggingPieceId, setDraggingPieceId] = useState<string | null>(null);
  const [stageWidth, setStageWidth] = useState(0);
  const [stageHeight, setStageHeight] = useState(0);

  useEffect(() => {
    if (!stageFrameRef.current || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(([entry]) => {
      setStageWidth(entry.contentRect.width);
      setStageHeight(entry.contentRect.height);
    });

    observer.observe(stageFrameRef.current);

    const rect = stageFrameRef.current.getBoundingClientRect();
    setStageWidth(rect.width);
    setStageHeight(rect.height);

    return () => observer.disconnect();
  }, []);

  const scaleFactor = getStageScaleFactor(stageWidth, stageHeight);

  const updatePiecePosition = (pieceId: string, clientX: number, clientY: number) => {
    if (!editable || !stageCanvasRef.current) return;
    const rect = stageCanvasRef.current.getBoundingClientRect();
    const x = Math.max(8, Math.min(92, ((clientX - rect.left) / rect.width) * 100));
    const y = Math.max(16, Math.min(84, ((clientY - rect.top) / rect.height) * 100));
    onMove(pieceId, Number(x.toFixed(2)), Number(y.toFixed(2)));
  };

  return (
    <div
      ref={stageFrameRef}
      className="relative h-[520px] overflow-hidden rounded-3xl border border-border bg-[radial-gradient(circle_at_50%_14%,rgba(255,255,255,0.08),transparent_28%),radial-gradient(circle_at_top,rgba(56,189,248,0.18),transparent_34%),linear-gradient(180deg,rgba(15,23,42,0.98),rgba(2,6,23,0.92))] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:h-[560px]"
      style={{ touchAction: editable ? "none" : "pan-y" }}
      onPointerMove={(event) => {
        if (!draggingPieceId) return;
        updatePiecePosition(draggingPieceId, event.clientX, event.clientY);
      }}
      onPointerUp={() => setDraggingPieceId(null)}
      onPointerLeave={() => setDraggingPieceId(null)}
      onPointerCancel={() => setDraggingPieceId(null)}
    >
      <div className="absolute inset-x-10 top-7 flex items-start justify-between text-xs uppercase tracking-[0.28em] text-slate-400">
        <span className="max-w-[14rem] leading-8">Top-Down Kit</span>
        <span className="leading-8">{editable ? "Unlocked" : "Tap a drum head or cymbal to inspect it"}</span>
      </div>
      <div
        ref={stageCanvasRef}
        className="absolute left-1/2 top-1/2"
        style={{
          width: STAGE_CANVAS_WIDTH,
          height: STAGE_CANVAS_HEIGHT,
          transform: `translate(-50%, -50%) scale(${scaleFactor})`,
          transformOrigin: "center center",
        }}
      >
        {pieces.map((piece) => {
          const seen = counts.get(piece.piece_type) || 0;
          counts.set(piece.piece_type, seen + 1);
          const meta = getPieceMeta(piece.piece_type);
          const wear = getWearDisplay(piece);
          const coords = getPieceCoords(piece, seen);
          const dimensions = getPieceDimensions(piece);
          const isSelected = selectedPieceId === piece.id;
          const isCymbal = isCymbalPiece(piece.piece_type);

          return (
            <button
              key={piece.id}
              type="button"
              onClick={() => onSelect(piece.id)}
              onPointerDown={(event: PointerEvent<HTMLButtonElement>) => {
                if (!editable) return;
                event.preventDefault();
                onSelect(piece.id);
                event.currentTarget.setPointerCapture(event.pointerId);
                setDraggingPieceId(piece.id);
                updatePiecePosition(piece.id, event.clientX, event.clientY);
              }}
              onPointerUp={(event: PointerEvent<HTMLButtonElement>) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }
                setDraggingPieceId(null);
              }}
              className={cn(
                "absolute -translate-x-1/2 -translate-y-1/2 select-none touch-none transition-transform duration-150 hover:scale-[1.03]",
                isSelected && "z-20 scale-[1.04]",
                editable && "cursor-grab active:cursor-grabbing",
                draggingPieceId === piece.id && "z-30 scale-[1.05]",
              )}
              style={{
                left: `${(coords.x / 100) * STAGE_CANVAS_WIDTH}px`,
                top: `${(coords.y / 100) * STAGE_CANVAS_HEIGHT}px`,
                width: dimensions.width,
                height: dimensions.height,
              }}
            >
              <div className={cn("relative h-full w-full", getStagePieceClasses(piece, isSelected))}>
                {!isCymbal && (
                  <>
                    <span className={cn("absolute inset-[5%] rounded-full border-[4px]", getWearRingClasses(wear.band))} />
                    <span className="absolute inset-[18%] rounded-full border border-white/12" />
                    <span className="absolute inset-[31%] rounded-full border border-white/10" />
                  </>
                )}
                {isCymbal && (
                  <>
                    <span className="absolute inset-[8%] rounded-full border border-white/30" />
                    <span className="absolute inset-[22%] rounded-full border-[3px] border-slate-900/70" />
                    <span className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#f2e7c2] ring-[10px] ring-slate-400/80" />
                  </>
                )}

                {!isCymbal && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className={cn("text-[18px] font-medium tracking-tight", getWearTextClasses(wear.band))}>
                      {wear.value}
                    </span>
                  </div>
                )}

                <span className={cn("absolute left-[9%] top-[9%] h-4 w-4 rounded-full shadow-[0_0_0_6px_rgba(255,255,255,0.18)]", meta.accent)} />
              </div>
            </button>
          );
        })}
      </div>
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
  const draftKey = getBuilderDraftKey(campusId, initialKit?.id);

  useEffect(() => {
    if (!open) return;

    const baseForm = initialKit ? buildFormFromKit(initialKit, campusId) : buildDefaultKit(campusId);

    if (typeof window !== "undefined") {
      const savedDraft = window.localStorage.getItem(draftKey);
      if (savedDraft) {
        try {
          const parsed = JSON.parse(savedDraft) as Partial<DrumKitInput>;
          const normalizedDraft = normalizeDraft(parsed, campusId);
          setForm(initialKit ? mergeDraftWithKit(normalizedDraft, initialKit, campusId) : normalizedDraft);
          return;
        } catch {
          window.localStorage.removeItem(draftKey);
        }
      }
    }

    setForm(baseForm);
  }, [campusId, draftKey, initialKit, open]);

  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    window.localStorage.setItem(draftKey, JSON.stringify(form));
  }, [draftKey, form, open]);

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
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(draftKey);
    }
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
                <li>Only drum pieces need batter and resonant head brand, model, and lifespan.</li>
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
                              batter_expected_head_life_days: option?.hasHeads ? piece.batter_expected_head_life_days ?? 180 : null,
                              batter_head_brand: option?.hasHeads ? piece.batter_head_brand ?? "" : null,
                              batter_head_model: option?.hasHeads ? piece.batter_head_model ?? "" : null,
                              batter_head_installed_on: option?.hasHeads ? piece.batter_head_installed_on ?? "" : null,
                              reso_expected_head_life_days: option?.hasHeads ? piece.reso_expected_head_life_days ?? 365 : null,
                              reso_head_brand: option?.hasHeads ? piece.reso_head_brand ?? "" : null,
                              reso_head_model: option?.hasHeads ? piece.reso_head_model ?? "" : null,
                              reso_head_installed_on: option?.hasHeads ? piece.reso_head_installed_on ?? "" : null,
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
                      <div className="mt-4 grid gap-4 xl:grid-cols-2">
                        <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                          <p className="mb-3 text-sm font-medium text-foreground">Batter Head</p>
                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                              <Label>Brand</Label>
                              <Input
                                value={piece.batter_head_brand || ""}
                                onChange={(event) => updatePiece(index, { batter_head_brand: event.target.value })}
                                placeholder="Remo"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Model</Label>
                              <Input
                                value={piece.batter_head_model || ""}
                                onChange={(event) => updatePiece(index, { batter_head_model: event.target.value })}
                                placeholder="Emperor Clear"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Installed on</Label>
                              <Input
                                type="date"
                                value={piece.batter_head_installed_on || ""}
                                onChange={(event) => updatePiece(index, { batter_head_installed_on: event.target.value })}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Expected life (days)</Label>
                              <Input
                                type="number"
                                min="1"
                                value={piece.batter_expected_head_life_days || ""}
                                onChange={(event) =>
                                  updatePiece(index, {
                                    batter_expected_head_life_days: event.target.value ? Number(event.target.value) : null,
                                  })
                                }
                              />
                            </div>
                          </div>
                        </div>
                        <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                          <p className="mb-3 text-sm font-medium text-foreground">Reso Head</p>
                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                              <Label>Brand</Label>
                              <Input
                                value={piece.reso_head_brand || ""}
                                onChange={(event) => updatePiece(index, { reso_head_brand: event.target.value })}
                                placeholder="Remo"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Model</Label>
                              <Input
                                value={piece.reso_head_model || ""}
                                onChange={(event) => updatePiece(index, { reso_head_model: event.target.value })}
                                placeholder="Ambassador Clear"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Installed on</Label>
                              <Input
                                type="date"
                                value={piece.reso_head_installed_on || ""}
                                onChange={(event) => updatePiece(index, { reso_head_installed_on: event.target.value })}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Expected life (days)</Label>
                              <Input
                                type="number"
                                min="1"
                                value={piece.reso_expected_head_life_days || ""}
                                onChange={(event) =>
                                  updatePiece(index, {
                                    reso_expected_head_life_days: event.target.value ? Number(event.target.value) : null,
                                  })
                                }
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {isCymbalPiece(piece.piece_type) && (
                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Make</Label>
                          <Input
                            value={piece.cymbal_brand || ""}
                            onChange={(event) => updatePiece(index, { cymbal_brand: event.target.value })}
                            placeholder="Zildjian"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Model</Label>
                          <Input
                            value={piece.cymbal_model || ""}
                            onChange={(event) => updatePiece(index, { cymbal_model: event.target.value })}
                            placeholder="K Custom Dark Crash"
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

function DrumTechCommentBoard({
  campusName,
  comments,
  currentUserId,
  isLoading,
  isSubmitting,
  onSubmit,
}: {
  campusName: string;
  comments: DrumTechComment[];
  currentUserId: string | null;
  isLoading: boolean;
  isSubmitting: boolean;
  onSubmit: (body: string) => Promise<void>;
}) {
  const [message, setMessage] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSubmit(message);
    setMessage("");
  };

  return (
    <Card className="border-border/70">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <MessageSquare className="h-5 w-5 text-primary" />
          Message Board
        </CardTitle>
        <CardDescription>
          Shared notes for {campusName}. Everyone with Drum Tech access can post updates, needs, or quick handoff notes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <form className="space-y-3" onSubmit={handleSubmit}>
          <Textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Share an update, ask a question, or leave a handoff note..."
            maxLength={500}
            rows={4}
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">{message.length}/500 characters</p>
            <Button type="submit" disabled={isSubmitting || !message.trim()}>
              <Send className="mr-2 h-4 w-4" />
              {isSubmitting ? "Posting..." : "Post message"}
            </Button>
          </div>
        </form>

        <div className="space-y-3">
          {isLoading ? (
            <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
              Loading messages...
            </div>
          ) : comments && comments.length > 0 ? (
            comments.map((comment) => {
              const authorName = comment.author_name || (comment.user_id === currentUserId ? "You" : "Team Member");
              const timestamp = isValid(parseISO(comment.created_at))
                ? formatDistanceToNowStrict(parseISO(comment.created_at), { addSuffix: true })
                : "just now";

              return (
                <div key={comment.id} className="rounded-2xl border border-border bg-muted/20 p-4">
                  <div className="flex items-start gap-3">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={comment.author_avatar_url || undefined} alt={authorName} />
                      <AvatarFallback className="text-[11px]">{getInitials(authorName)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="font-medium text-foreground">{authorName}</p>
                        <span className="text-xs text-muted-foreground">{timestamp}</span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{comment.body}</p>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
              No messages yet. Start the conversation with a quick update or request.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function DrumTech() {
  const { user, canManageTeam } = useAuth();
  const { data: campuses = [] } = useCampuses();
  const { data: userCampuses = [] } = useUserCampuses(user?.id);
  const campusCtx = useCampusSelectionOptional();
  const assignmentAccess = useDrumTechAccess(campusCtx?.selectedCampusId || null);
  const selectedCampusId =
    campusCtx?.selectedCampusId ||
    assignmentAccess.assignedCampusIds[0] ||
    userCampuses[0]?.campus_id ||
    null;
  const access = useDrumTechAccess(selectedCampusId);
  const setSelectedCampusId = campusCtx?.setSelectedCampusId;
  const { data: kits = [], isLoading } = useDrumKits(selectedCampusId);
  const { data: comments = [], isLoading: isCommentsLoading } = useDrumTechComments(selectedCampusId);
  const upsertKit = useUpsertDrumKit();
  const createComment = useCreateDrumTechComment();
  const deleteKit = useDeleteDrumKit();

  const availableCampuses = useMemo(() => {
    if (canManageTeam) return campuses;
    if (assignmentAccess.assignedCampusIds.length > 0) {
      return userCampuses
        .filter((entry) => assignmentAccess.assignedCampusIds.includes(entry.campus_id))
        .map((entry) => entry.campuses);
    }
    return userCampuses.map((entry) => entry.campuses);
  }, [assignmentAccess.assignedCampusIds, campuses, canManageTeam, userCampuses]);

  const [selectedKitId, setSelectedKitId] = useState<string | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingKit, setEditingKit] = useState<DrumKit | null>(null);
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);
  const [pieceDraft, setPieceDraft] = useState<DrumKitPiece | null>(null);
  const [layoutDrafts, setLayoutDrafts] = useState<Record<string, { x: number | null; y: number | null }>>({});
  const [layoutUnlocked, setLayoutUnlocked] = useState(false);

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
    setLayoutDrafts({});
    setLayoutUnlocked(false);
  }, [selectedKitId]);

  useEffect(() => {
    if (!selectedKit?.drum_kit_pieces.length) {
      setSelectedPieceId(null);
      return;
    }

    if (!selectedPieceId || !selectedKit.drum_kit_pieces.some((piece) => piece.id === selectedPieceId)) {
      setSelectedPieceId(selectedKit.drum_kit_pieces[0].id);
    }
  }, [selectedKit, selectedPieceId]);

  const stagePieces = useMemo(() => {
    if (!selectedKit) return [];
    return selectedKit.drum_kit_pieces.map((piece) => {
      const layoutDraft = layoutDrafts[piece.id];
      if (!layoutDraft) return piece;
      return {
        ...piece,
        layout_x: layoutDraft.x,
        layout_y: layoutDraft.y,
      };
    });
  }, [layoutDrafts, selectedKit]);
  const selectedPiece = stagePieces.find((piece) => piece.id === selectedPieceId) || null;

  useEffect(() => {
    setPieceDraft(selectedPiece ? { ...selectedPiece, cymbal_crack_markers: selectedPiece.cymbal_crack_markers || [] } : null);
  }, [selectedPiece]);

  const stats = useMemo(() => {
    const headTrackedPieces = selectedKit?.drum_kit_pieces.filter((piece) => getPieceMeta(piece.piece_type).hasHeads) || [];
    const dueCount = headTrackedPieces.filter((piece) => getPieceHealthSummary(piece).tone === "critical").length;
    const monitorCount = headTrackedPieces.filter((piece) => getPieceHealthSummary(piece).tone === "warning").length;
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

  const handleCommentSubmit = async (body: string) => {
    if (!selectedCampusId) return;
    await createComment.mutateAsync({ campusId: selectedCampusId, body });
  };

  const handleSavePieceMonitor = async () => {
    if (!selectedKit || !pieceDraft || !selectedCampusId || !access.canEditCampus) return;

    const pieces = selectedKit.drum_kit_pieces.map((piece) =>
      piece.id === pieceDraft.id
        ? {
            ...piece,
            cymbal_brand: pieceDraft.cymbal_brand,
            cymbal_model: pieceDraft.cymbal_model,
            cymbal_crack_markers: pieceDraft.cymbal_crack_markers || [],
            notes: pieceDraft.notes,
          }
        : piece,
    );

    await upsertKit.mutateAsync({
      id: selectedKit.id,
      campus_id: selectedCampusId,
      name: selectedKit.name,
      description: selectedKit.description,
      pieces: pieces.map((piece, index) => ({
        id: piece.id,
        layout_x: piece.id === pieceDraft.id ? pieceDraft.layout_x : piece.layout_x,
        layout_y: piece.id === pieceDraft.id ? pieceDraft.layout_y : piece.layout_y,
        piece_type: piece.piece_type,
        piece_label: piece.piece_label,
        size_inches: piece.size_inches,
        sort_order: index,
        cymbal_brand: piece.cymbal_brand,
        cymbal_model: piece.cymbal_model,
        cymbal_crack_markers: piece.cymbal_crack_markers || [],
        batter_head_brand: piece.batter_head_brand,
        batter_head_model: piece.batter_head_model,
        batter_head_installed_on: piece.batter_head_installed_on,
        batter_expected_head_life_days: piece.batter_expected_head_life_days,
        reso_head_brand: piece.reso_head_brand,
        reso_head_model: piece.reso_head_model,
        reso_head_installed_on: piece.reso_head_installed_on,
        reso_expected_head_life_days: piece.reso_expected_head_life_days,
        notes: piece.notes,
      })),
    });
  };

  const handleResetHeadHealth = async (side: HeadSide) => {
    if (!selectedKit || !pieceDraft || !selectedCampusId || !access.canEditCampus) return;

    const installedOn = getTodayIsoDate();
    const nextPieceDraft =
      side === "batter"
        ? { ...pieceDraft, batter_head_installed_on: installedOn }
        : { ...pieceDraft, reso_head_installed_on: installedOn };

    setPieceDraft(nextPieceDraft);

    await upsertKit.mutateAsync({
      id: selectedKit.id,
      campus_id: selectedCampusId,
      name: selectedKit.name,
      description: selectedKit.description,
      pieces: selectedKit.drum_kit_pieces.map((piece, index) => ({
        id: piece.id,
        layout_x: piece.id === nextPieceDraft.id ? nextPieceDraft.layout_x : piece.layout_x,
        layout_y: piece.id === nextPieceDraft.id ? nextPieceDraft.layout_y : piece.layout_y,
        piece_type: piece.piece_type,
        piece_label: piece.piece_label,
        size_inches: piece.size_inches,
        sort_order: index,
        cymbal_brand: piece.id === nextPieceDraft.id ? nextPieceDraft.cymbal_brand : piece.cymbal_brand,
        cymbal_model: piece.id === nextPieceDraft.id ? nextPieceDraft.cymbal_model : piece.cymbal_model,
        cymbal_crack_markers:
          piece.id === nextPieceDraft.id ? nextPieceDraft.cymbal_crack_markers || [] : piece.cymbal_crack_markers || [],
        batter_head_brand: piece.id === nextPieceDraft.id ? nextPieceDraft.batter_head_brand : piece.batter_head_brand,
        batter_head_model: piece.id === nextPieceDraft.id ? nextPieceDraft.batter_head_model : piece.batter_head_model,
        batter_head_installed_on:
          piece.id === nextPieceDraft.id ? nextPieceDraft.batter_head_installed_on : piece.batter_head_installed_on,
        batter_expected_head_life_days:
          piece.id === nextPieceDraft.id ? nextPieceDraft.batter_expected_head_life_days : piece.batter_expected_head_life_days,
        reso_head_brand: piece.id === nextPieceDraft.id ? nextPieceDraft.reso_head_brand : piece.reso_head_brand,
        reso_head_model: piece.id === nextPieceDraft.id ? nextPieceDraft.reso_head_model : piece.reso_head_model,
        reso_head_installed_on:
          piece.id === nextPieceDraft.id ? nextPieceDraft.reso_head_installed_on : piece.reso_head_installed_on,
        reso_expected_head_life_days:
          piece.id === nextPieceDraft.id ? nextPieceDraft.reso_expected_head_life_days : piece.reso_expected_head_life_days,
        notes: piece.id === nextPieceDraft.id ? nextPieceDraft.notes : piece.notes,
      })),
    });
  };

  const handleMovePiece = (pieceId: string, x: number, y: number) => {
    setLayoutDrafts((current) => ({
      ...current,
      [pieceId]: { x, y },
    }));
    setPieceDraft((current) => (current && current.id === pieceId ? { ...current, layout_x: x, layout_y: y } : current));
  };

  const handleSaveLayout = async () => {
    if (!selectedKit || !selectedCampusId || !pieceDraft || !access.canEditCampus) return;

    await upsertKit.mutateAsync({
      id: selectedKit.id,
      campus_id: selectedCampusId,
      name: selectedKit.name,
      description: selectedKit.description,
      pieces: selectedKit.drum_kit_pieces.map((piece, index) => ({
        id: piece.id,
        layout_x: layoutDrafts[piece.id]?.x ?? piece.layout_x,
        layout_y: layoutDrafts[piece.id]?.y ?? piece.layout_y,
        piece_type: piece.piece_type,
        piece_label: piece.piece_label,
        size_inches: piece.size_inches,
        sort_order: index,
        cymbal_brand: piece.id === pieceDraft.id ? pieceDraft.cymbal_brand : piece.cymbal_brand,
        cymbal_model: piece.id === pieceDraft.id ? pieceDraft.cymbal_model : piece.cymbal_model,
        cymbal_crack_markers: piece.id === pieceDraft.id ? pieceDraft.cymbal_crack_markers || [] : piece.cymbal_crack_markers || [],
        batter_head_brand: piece.batter_head_brand,
        batter_head_model: piece.batter_head_model,
        batter_head_installed_on: piece.batter_head_installed_on,
        batter_expected_head_life_days: piece.batter_expected_head_life_days,
        reso_head_brand: piece.reso_head_brand,
        reso_head_model: piece.reso_head_model,
        reso_head_installed_on: piece.reso_head_installed_on,
        reso_expected_head_life_days: piece.reso_expected_head_life_days,
        notes: piece.id === pieceDraft.id ? pieceDraft.notes : piece.notes,
      })),
    });

  };

  const handleToggleLayoutLock = async () => {
    if (!access.canEditCampus) return;

    if (!layoutUnlocked) {
      setLayoutUnlocked(true);
      return;
    }

    if (Object.keys(layoutDrafts).length > 0) {
      await handleSaveLayout();
    }

    setLayoutUnlocked(false);
  };

  if (!selectedCampusId) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 py-10">
        <h1 className="text-3xl font-semibold">Drum Tech</h1>
        <p className="text-muted-foreground">Assign the user to a campus first so the kit health workspace has a home.</p>
      </div>
    );
  }

  const selectedCampusName = availableCampuses.find((campus) => campus.id === selectedCampusId)?.name || "this campus";

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
                  const overdue = tracked.filter((piece) => getPieceHealthSummary(piece).tone === "critical").length;

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
                  <div className="space-y-4">
                    {access.canEditCampus && (
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-muted/20 p-3">
                        <div>
                          <p className="font-medium text-foreground">Kit Positioning</p>
                          <p className="text-sm text-muted-foreground">
                            Unlock positioning to move pieces. Lock the kit again to save the new layout.
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9"
                          onClick={handleToggleLayoutLock}
                          title={layoutUnlocked ? "Lock positioning and save layout" : "Unlock positioning"}
                          disabled={upsertKit.isPending}
                        >
                          {layoutUnlocked ? (
                            <Unlock className="h-4 w-4 text-primary" />
                          ) : (
                            <Lock className="h-4 w-4 text-muted-foreground" />
                          )}
                        </Button>
                      </div>
                    )}

                    <InteractiveKitStage
                      pieces={stagePieces}
                      selectedPieceId={selectedPieceId}
                      onSelect={setSelectedPieceId}
                      editable={access.canEditCampus && layoutUnlocked}
                      onMove={handleMovePiece}
                    />
                  </div>

                  <div className="space-y-4">
                    {selectedPiece && pieceDraft ? (
                      <Card className="border-border/70 bg-muted/20">
                        <CardHeader>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <CardTitle className="text-xl">{pieceDraft.piece_label}</CardTitle>
                              <CardDescription>
                                {getPieceMeta(pieceDraft.piece_type).label} · {formatSize(pieceDraft.size_inches)}
                              </CardDescription>
                              {pieceDraft.layout_x != null && pieceDraft.layout_y != null && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Position: {pieceDraft.layout_x.toFixed(1)}%, {pieceDraft.layout_y.toFixed(1)}%
                                </p>
                              )}
                            </div>
                            <Disc3 className="h-5 w-5 text-muted-foreground" />
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {(() => {
                            const health = getPieceHealthSummary(pieceDraft);
                            const meta = getPieceMeta(pieceDraft.piece_type);
                            const batterHealth = getPieceHeadHealth(pieceDraft, "batter");
                            const resoHealth = getPieceHeadHealth(pieceDraft, "reso");
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
                                    <div className="grid gap-4">
                                      {([
                                        {
                                          key: "batter",
                                          title: "Batter Head",
                                          health: batterHealth,
                                          brand: pieceDraft.batter_head_brand,
                                          model: pieceDraft.batter_head_model,
                                          installedOn: pieceDraft.batter_head_installed_on,
                                        },
                                        {
                                          key: "reso",
                                          title: "Reso Head",
                                          health: resoHealth,
                                          brand: pieceDraft.reso_head_brand,
                                          model: pieceDraft.reso_head_model,
                                          installedOn: pieceDraft.reso_head_installed_on,
                                        },
                                      ] as const).map((head) => (
                                        <div key={head.key} className="rounded-2xl border border-border p-4">
                                          <div className="flex items-start justify-between gap-3">
                                            <div>
                                              <p className="font-medium text-foreground">{head.title}</p>
                                              <p className="text-sm text-muted-foreground">{head.health.label}</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                              <span className={cn("rounded-full border px-2 py-1 text-xs", healthClasses(head.health.tone))}>
                                                {head.health.daysRemaining !== null
                                                  ? head.health.daysRemaining > 0
                                                    ? `${head.health.daysRemaining}d left`
                                                    : "Due"
                                                  : "No estimate"}
                                              </span>
                                              {access.canEditCampus && (
                                                <Button
                                                  type="button"
                                                  variant="outline"
                                                  size="sm"
                                                  onClick={() => handleResetHeadHealth(head.key)}
                                                  disabled={upsertKit.isPending}
                                                >
                                                  <RotateCcw className="mr-2 h-4 w-4" />
                                                  Reset health
                                                </Button>
                                              )}
                                            </div>
                                          </div>

                                          <div className="mt-3 space-y-2">
                                            <div className="flex items-center justify-between text-sm">
                                              <span className="text-muted-foreground">Estimated life</span>
                                              <span className="font-medium">
                                                {head.health.percentLeft !== null ? `${Math.round(head.health.percentLeft)}% left` : "No estimate"}
                                              </span>
                                            </div>
                                            <Progress value={head.health.percentLeft ?? 0} />
                                          </div>

                                          <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                            <div className="rounded-xl border border-border p-3">
                                              <p className="text-xs uppercase tracking-wide text-muted-foreground">Head spec</p>
                                              <p className="mt-1 font-medium">
                                                {[head.brand, head.model].filter(Boolean).join(" ") || "Not recorded"}
                                              </p>
                                            </div>
                                            <div className="rounded-xl border border-border p-3">
                                              <p className="text-xs uppercase tracking-wide text-muted-foreground">Installed</p>
                                              <p className="mt-1 font-medium">
                                                {formatInstalledDate(head.installedOn)}
                                              </p>
                                            </div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </>
                                )}

                                {!meta.hasHeads && (
                                  <div className="space-y-4">
                                    {isCymbalPiece(pieceDraft.piece_type) ? (
                                      <>
                                        <div className="grid gap-3 sm:grid-cols-2">
                                          <div className="space-y-2">
                                            <Label>Make</Label>
                                            <Input
                                              value={pieceDraft.cymbal_brand || ""}
                                              onChange={(event) =>
                                                setPieceDraft((current) =>
                                                  current ? { ...current, cymbal_brand: event.target.value } : current,
                                                )
                                              }
                                              disabled={!access.canEditCampus}
                                              placeholder="Zildjian"
                                            />
                                          </div>
                                          <div className="space-y-2">
                                            <Label>Model</Label>
                                            <Input
                                              value={pieceDraft.cymbal_model || ""}
                                              onChange={(event) =>
                                                setPieceDraft((current) =>
                                                  current ? { ...current, cymbal_model: event.target.value } : current,
                                                )
                                              }
                                              disabled={!access.canEditCampus}
                                              placeholder="A Custom Mastersound Hi-Hats"
                                            />
                                          </div>
                                        </div>
                                        <div className="rounded-2xl border border-border p-4">
                                          <div className="mb-3 flex items-center justify-between gap-3">
                                            <div>
                                              <p className="font-medium text-foreground">Crack Monitor</p>
                                              <p className="text-sm text-muted-foreground">
                                                Pin crack locations directly on the cymbal from the stage plot view.
                                              </p>
                                            </div>
                                            {access.canEditCampus && (
                                              <Button
                                                type="button"
                                                variant="outline"
                                                onClick={handleSavePieceMonitor}
                                                disabled={upsertKit.isPending}
                                              >
                                                <Save className="mr-2 h-4 w-4" />
                                                Save cymbal
                                              </Button>
                                            )}
                                          </div>
                                          <CymbalCrackMonitor
                                            markers={pieceDraft.cymbal_crack_markers || []}
                                            editable={access.canEditCampus}
                                            onAdd={(marker) =>
                                              setPieceDraft((current) =>
                                                current
                                                  ? {
                                                      ...current,
                                                      cymbal_crack_markers: [...(current.cymbal_crack_markers || []), marker],
                                                    }
                                                  : current,
                                              )
                                            }
                                            onUpdate={(markerId, description) =>
                                              setPieceDraft((current) =>
                                                current
                                                  ? {
                                                      ...current,
                                                      cymbal_crack_markers: (current.cymbal_crack_markers || []).map((marker) =>
                                                        marker.id === markerId ? { ...marker, description } : marker,
                                                      ),
                                                    }
                                                  : current,
                                              )
                                            }
                                            onRemove={(markerId) =>
                                              setPieceDraft((current) =>
                                                current
                                                  ? {
                                                      ...current,
                                                      cymbal_crack_markers: (current.cymbal_crack_markers || []).filter(
                                                        (marker) => marker.id !== markerId,
                                                      ),
                                                    }
                                                  : current,
                                              )
                                            }
                                          />
                                        </div>
                                      </>
                                    ) : (
                                      <div className="rounded-xl border border-border p-3 text-sm text-muted-foreground">
                                        Hardware stays interactive here, but crack monitoring is only enabled for cymbals.
                                      </div>
                                    )}
                                  </div>
                                )}

                                {pieceDraft.notes && (
                                  <div className="rounded-xl border border-border p-3">
                                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Notes</p>
                                    <p className="mt-1 text-sm">{pieceDraft.notes}</p>
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

          <DrumTechCommentBoard
            campusName={selectedCampusName}
            comments={comments}
            currentUserId={user?.id ?? null}
            isLoading={isCommentsLoading}
            isSubmitting={createComment.isPending}
            onSubmit={handleCommentSubmit}
          />
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
