import { useEffect, useState } from "react";
import { GripVertical, X, Music } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DurationInput } from "./DurationInput";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import type { ServiceFlowItem as ServiceFlowItemType } from "@/hooks/useServiceFlow";

interface ServiceFlowItemProps {
  item: ServiceFlowItemType;
  onUpdate: (updates: Partial<ServiceFlowItemType>) => void;
  onDelete: () => void;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
  isDragging?: boolean;
}

export function ServiceFlowItem({
  item,
  onUpdate,
  onDelete,
  dragHandleProps,
  isDragging,
}: ServiceFlowItemProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(item.title || "");

  useEffect(() => {
    setTitleDraft(item.title || "");
  }, [item.title]);

  const commitTitle = () => {
    const trimmed = titleDraft.trim();
    if (!trimmed) {
      setTitleDraft(item.title || "");
      setIsEditingTitle(false);
      return;
    }
    if (trimmed !== (item.title || "")) {
      onUpdate({ title: trimmed });
    }
    setIsEditingTitle(false);
  };

  const cancelTitleEdit = () => {
    setTitleDraft(item.title || "");
    setIsEditingTitle(false);
  };

  const printTitleSlug = (item.song?.title || item.title || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const vocalistDisplay = (item.vocalists && item.vocalists.length > 0)
    ? item.vocalists
        .map((v) => v.full_name || "")
        .filter(Boolean)
        .join(", ")
    : (item.vocalist?.full_name || "");

  if (item.item_type === "header") {
    return (
      <div
        data-flow-item-type={item.item_type}
        data-flow-item-title={printTitleSlug}
        className={cn(
          "service-flow-header flex items-center gap-2 px-3 py-2 bg-muted rounded-md",
          isDragging && "opacity-50"
        )}
      >
        <div {...dragHandleProps} className="cursor-grab active:cursor-grabbing">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
        {isEditingTitle ? (
          <Input
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitTitle();
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancelTitleEdit();
              }
            }}
            autoFocus
            className="h-8 flex-1 text-sm font-semibold uppercase tracking-wide"
          />
        ) : (
          <button
            type="button"
            className="flex-1 text-left font-semibold text-sm uppercase tracking-wide text-muted-foreground hover:text-foreground"
            onClick={() => setIsEditingTitle(true)}
            title="Click to edit title"
          >
            {item.title}
          </button>
        )}
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
        data-flow-item-type={item.item_type}
        data-flow-item-title={printTitleSlug}
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
        <span className="service-flow-song-title flex-1 min-w-0 font-medium text-sm truncate">
          {item.song?.title || item.title}
        </span>
        {item.song?.bpm && (
          <span className="service-flow-song-bpm text-xs text-muted-foreground font-medium whitespace-nowrap">
            {item.song.bpm} BPM
          </span>
        )}
        {item.song_key && (
          <Badge
            variant="outline"
            className="text-xs font-medium"
          >
            {item.song_key}
          </Badge>
        )}
        {vocalistDisplay && (
          <span className="service-flow-song-vocalist text-xs text-muted-foreground whitespace-nowrap">
            {vocalistDisplay}
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
      data-flow-item-type={item.item_type}
      data-flow-item-title={printTitleSlug}
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
      {isEditingTitle ? (
        <Input
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitTitle();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancelTitleEdit();
            }
          }}
          autoFocus
          className="h-8 flex-1 text-sm"
        />
      ) : (
        <button
          type="button"
          className="flex-1 text-left text-sm hover:text-foreground"
          onClick={() => setIsEditingTitle(true)}
          title="Click to edit title"
        >
          {item.title}
        </button>
      )}
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
