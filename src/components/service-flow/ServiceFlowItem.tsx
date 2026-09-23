import { memo, useEffect, useState } from "react";
import { GripVertical, X, Music, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DurationInput } from "./DurationInput";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ServiceFlowItem as ServiceFlowItemType } from "@/hooks/useServiceFlow";

interface ServiceFlowItemProps {
  item: ServiceFlowItemType;
  onUpdate: (itemId: string, updates: Partial<ServiceFlowItemType>) => void;
  onDelete: (itemId: string) => void;
  displayTitle?: string;
  clockTime?: string | null;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
  isDragging?: boolean;
}

function FlowItemNotes({
  notes,
  onCommit,
}: {
  notes: string | null;
  onCommit: (notes: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(notes || "");
  const savedNotes = notes?.trim() || "";

  useEffect(() => {
    if (!editing) setDraft(notes || "");
  }, [editing, notes]);

  const commit = () => {
    const next = draft.trim();
    if (next !== savedNotes) onCommit(next || null);
    setEditing(false);
  };

  const cancel = () => {
    setDraft(notes || "");
    setEditing(false);
  };

  return (
    <div className="contents">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn(
          "h-6 w-6 text-muted-foreground hover:text-foreground",
          savedNotes && "text-foreground",
        )}
        onClick={() => {
          setDraft(notes || "");
          setEditing(true);
        }}
        title={savedNotes ? "Edit note" : "Add note"}
        aria-label={savedNotes ? "Edit note" : "Add note"}
      >
        <StickyNote className="h-3.5 w-3.5" />
      </Button>
      {editing || savedNotes ? (
        <div className="order-last basis-full pl-6">
          {editing ? (
            <Textarea
              value={draft}
              autoFocus
              rows={2}
              placeholder="Note for this service only"
              className="min-h-[2.5rem] py-1.5 text-xs"
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commit}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  cancel();
                } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  (event.currentTarget as HTMLTextAreaElement).blur();
                }
              }}
            />
          ) : (
            <button
              type="button"
              className="w-full whitespace-pre-wrap text-left text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setEditing(true)}
              title="Edit note"
            >
              {savedNotes}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

export const ServiceFlowItem = memo(function ServiceFlowItem({
  item,
  onUpdate,
  onDelete,
  displayTitle,
  clockTime,
  dragHandleProps,
  isDragging,
}: ServiceFlowItemProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(item.title || "");
  const visibleTitle = displayTitle || item.song?.title || item.title || "";

  useEffect(() => {
    if (!isEditingTitle) setTitleDraft(visibleTitle);
  }, [isEditingTitle, visibleTitle]);
  const canEditTitle = item.item_type !== "song" || !item.song_id;

  const beginTitleEdit = () => {
    if (!canEditTitle) return;
    setTitleDraft(visibleTitle);
    setIsEditingTitle(true);
  };

  const commitTitle = () => {
    const trimmed = titleDraft.trim();
    if (!trimmed) {
      setTitleDraft(visibleTitle);
      setIsEditingTitle(false);
      return;
    }
    // Saving a different title stores it on this service flow only.
    // Leaving the schedule-filled name unchanged keeps that fill in place.
    if (trimmed !== visibleTitle) {
      onUpdate(item.id, { title: trimmed });
    }
    setIsEditingTitle(false);
  };

  const cancelTitleEdit = () => {
    setTitleDraft(visibleTitle);
    setIsEditingTitle(false);
  };

  const commitNotes = (notes: string | null) => {
    if ((notes || "") === (item.notes?.trim() || "")) return;
    onUpdate(item.id, { notes });
  };

  const resolvedTitle = visibleTitle;

  const printTitleSlug = (resolvedTitle || "")
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
          "service-flow-header flex flex-wrap items-center gap-2 px-3 py-2 bg-muted rounded-md",
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
            onClick={beginTitleEdit}
            title="Click to edit title"
          >
            {item.title}
          </button>
        )}
        <FlowItemNotes notes={item.notes} onCommit={commitNotes} />
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-destructive"
          onClick={() => onDelete(item.id)}
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
          "flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 bg-card border rounded-md",
          isDragging && "opacity-50 shadow-lg"
        )}
      >
        <div {...dragHandleProps} className="cursor-grab active:cursor-grabbing">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
        <DurationInput
          value={item.duration_seconds}
          onChange={(seconds) => onUpdate(item.id, { duration_seconds: seconds })}
        />
        {clockTime ? (
          <span className="w-[4.75rem] shrink-0 text-center text-xs font-medium tabular-nums text-muted-foreground">
            {clockTime}
          </span>
        ) : null}
        <Music className="h-4 w-4 text-muted-foreground flex-shrink-0" />
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
            className="h-8 min-w-0 flex-1 text-sm"
          />
        ) : canEditTitle ? (
          <button
            type="button"
            className="service-flow-song-title min-w-0 flex-1 truncate text-left text-sm font-medium hover:text-foreground"
            onClick={beginTitleEdit}
            title="Click to edit title"
          >
            {resolvedTitle}
          </button>
        ) : (
          <span className="service-flow-song-title min-w-0 flex-1 truncate text-sm font-medium">
            {resolvedTitle}
          </span>
        )}
        {(item.song?.bpm || item.song_key || vocalistDisplay) && (
          <div className="service-flow-song-meta order-last flex w-full min-w-0 items-center gap-2 pl-6 sm:order-none sm:ml-auto sm:w-auto sm:justify-end sm:pl-0 sm:text-right">
            {item.song?.bpm && (
              <span className="service-flow-song-bpm text-xs text-muted-foreground font-medium whitespace-nowrap">
                {item.song.bpm} BPM
              </span>
            )}
            {item.song_key && (
              <Badge
                variant="outline"
                className="service-flow-song-key min-w-[2rem] justify-center border-foreground bg-background px-2 text-xs font-semibold leading-none text-foreground"
              >
                {item.song_key}
              </Badge>
            )}
            {vocalistDisplay && (
              <span className="service-flow-song-vocalist min-w-0 truncate text-xs text-muted-foreground whitespace-nowrap">
                {vocalistDisplay}
              </span>
            )}
          </div>
        )}
        <FlowItemNotes notes={item.notes} onCommit={commitNotes} />
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-destructive"
          onClick={() => onDelete(item.id)}
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
        "flex flex-wrap items-center gap-2 px-3 py-2 bg-card border rounded-md",
        isDragging && "opacity-50 shadow-lg"
      )}
    >
      <div {...dragHandleProps} className="cursor-grab active:cursor-grabbing">
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>
      <DurationInput
        value={item.duration_seconds}
        onChange={(seconds) => onUpdate(item.id, { duration_seconds: seconds })}
      />
      {clockTime ? (
        <span className="w-[4.75rem] shrink-0 text-center text-xs font-medium tabular-nums text-muted-foreground">
          {clockTime}
        </span>
      ) : null}
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
          onClick={beginTitleEdit}
          title="Click to edit speaker, placeholder, or title"
        >
          {resolvedTitle}
        </button>
      )}
      <FlowItemNotes notes={item.notes} onCommit={commitNotes} />
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 text-muted-foreground hover:text-destructive"
        onClick={() => onDelete(item.id)}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
});
