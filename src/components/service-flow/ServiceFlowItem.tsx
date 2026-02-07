import { GripVertical, X, Music, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DurationInput } from "./DurationInput";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ServiceFlowItem as ServiceFlowItemType } from "@/hooks/useServiceFlow";

interface ServiceFlowItemProps {
  item: ServiceFlowItemType;
  onUpdate: (updates: Partial<ServiceFlowItemType>) => void;
  onDelete: () => void;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
  isDragging?: boolean;
}

const KEY_COLORS: Record<string, string> = {
  C: "bg-black",
  "C#": "bg-black",
  Db: "bg-black",
  D: "bg-black",
  "D#": "bg-black",
  Eb: "bg-black",
  E: "bg-black",
  F: "bg-black",
  "F#": "bg-black",
  Gb: "bg-black",
  G: "bg-black",
  "G#": "bg-black",
  Ab: "bg-black",
  A: "bg-black",
  "A#": "bg-black",
  Bb: "bg-black",
  B: "bg-black",
};

function getKeyColor(key: string | null): string {
  if (!key) return "bg-muted";
  // Extract just the note (e.g., "C" from "Cm" or "C major")
  const note = key.replace(/[mM].*$/, "").replace(/\s.*$/, "").trim();
  return KEY_COLORS[note] || "bg-muted";
}

export function ServiceFlowItem({
  item,
  onUpdate,
  onDelete,
  dragHandleProps,
  isDragging,
}: ServiceFlowItemProps) {
  if (item.item_type === "header") {
    return (
      <div
        className={cn(
          "service-flow-header flex items-center gap-2 px-3 py-2 bg-muted rounded-md",
          isDragging && "opacity-50"
        )}
      >
        <div {...dragHandleProps} className="cursor-grab active:cursor-grabbing">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
        <span className="flex-1 font-semibold text-sm uppercase tracking-wide text-muted-foreground">
          {item.title}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-destructive"
          onClick={onDelete}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  if (item.item_type === "song") {
    return (
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2 bg-card border rounded-md",
          isDragging && "opacity-50 shadow-lg"
        )}
      >
        <div {...dragHandleProps} className="cursor-grab active:cursor-grabbing">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
        <DurationInput
          value={item.duration_seconds}
          onChange={(seconds) => onUpdate({ duration_seconds: seconds })}
        />
        <Music className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <span className="flex-1 font-medium text-sm truncate">
          {item.song?.title || item.title}
        </span>
        {item.song?.bpm && (
          <span className="text-xs text-muted-foreground font-medium">
            {item.song.bpm} BPM
          </span>
        )}
        {item.song_key && (
          <Badge
            variant="secondary"
            className={cn(
              "text-xs font-medium text-white",
              getKeyColor(item.song_key)
            )}
          >
            {item.song_key}
          </Badge>
        )}
        {item.vocalist?.full_name && (
          <span className="text-xs text-muted-foreground truncate max-w-[100px]">
            {item.vocalist.full_name}
          </span>
        )}
        {/* Attachment count placeholder - future feature */}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-destructive"
          onClick={onDelete}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  // Regular item
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-2 bg-card border rounded-md",
        isDragging && "opacity-50 shadow-lg"
      )}
    >
      <div {...dragHandleProps} className="cursor-grab active:cursor-grabbing">
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>
      <DurationInput
        value={item.duration_seconds}
        onChange={(seconds) => onUpdate({ duration_seconds: seconds })}
      />
      <span className="flex-1 text-sm">{item.title}</span>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 text-muted-foreground hover:text-destructive"
        onClick={onDelete}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
