import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { AvailabilityBadge } from "./AvailabilityBadge";
import { SongAvailability } from "@/hooks/useSetPlanner";
import { KeySelector } from "./KeySelector";
import { MultiVocalistSelector } from "./MultiVocalistSelector";
import { VocalistRundownNotesPanel } from "./VocalistRundownNotesPanel";
import { ScheduledVocalist } from "@/hooks/useScheduledVocalists";
import { VocalistRundownNote } from "@/hooks/useWeekendRundown";
import { GripVertical, X, Save, Music2, AlertTriangle, Check, Pencil, Clock, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { useEffect, useRef, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";

export interface BuildingSetSong extends SongAvailability {
  selectedKey?: string | null;
  /** @deprecated Use selectedVocalistIds instead */
  selectedVocalistId?: string | null;
  selectedVocalistIds?: string[];
  youtubeUrl?: string | null;
}

export type ApprovalStatus = "draft" | "pending_approval" | "published" | "rejected";

interface BuildingSetProps {
  songs: BuildingSetSong[];
  onRemoveSong: (songId: string) => void;
  onReorderSongs: (songs: BuildingSetSong[]) => void;
  onKeyChange: (songId: string, key: string | null) => void;
  onVocalistChange: (songId: string, vocalistIds: string[]) => void;
  onYoutubeLinkChange: (songId: string, youtubeUrl: string) => void;
  onEditingChange?: (isEditing: boolean) => void;
  onSave: () => void;
  isSaving?: boolean;
  notes: string;
  onNotesChange: (notes: string) => void;
  hasConflicts: boolean;
  publishButton?: React.ReactNode;
  vocalists: ScheduledVocalist[];
  isPublished?: boolean;
  approvalStatus?: ApprovalStatus;
  rejectionNotes?: string | null;
  vocalistRundownNotes?: VocalistRundownNote[];
  vocalistRundownNotesLoading?: boolean;
}

export function BuildingSet({
  songs,
  onRemoveSong,
  onReorderSongs,
  onKeyChange,
  onVocalistChange,
  onYoutubeLinkChange,
  onEditingChange,
  onSave,
  isSaving,
  notes,
  onNotesChange,
  hasConflicts,
  publishButton,
  vocalists,
  isPublished,
  approvalStatus = "draft",
  rejectionNotes,
  vocalistRundownNotes = [],
  vocalistRundownNotesLoading = false,
}: BuildingSetProps) {
  const isMobile = useIsMobile();
  const [isEditing, setIsEditing] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const prevIsSavingRef = useRef(isSaving);
  const notesTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Show "Saved!" confirmation when save completes
  useEffect(() => {
    if (prevIsSavingRef.current && !isSaving) {
      setShowSaved(true);
      const timer = setTimeout(() => setShowSaved(false), 2000);
      return () => clearTimeout(timer);
    }
    prevIsSavingRef.current = isSaving;
  }, [isSaving]);

  // Reset editing state when isPublished changes (e.g., switching dates)
  useEffect(() => {
    setIsEditing(false);
  }, [isPublished]);

  useEffect(() => {
    onEditingChange?.(isEditing);
  }, [isEditing, onEditingChange]);

  // Grow notes field to fit all content so nothing is clipped
  useEffect(() => {
    const textarea = notesTextareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.max(textarea.scrollHeight, 72)}px`;
  }, [notes]);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    if (isPublished && !isEditing) return;
    e.dataTransfer.setData('text/plain', index.toString());
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (isPublished && !isEditing) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    if (isPublished && !isEditing) return;
    e.preventDefault();
    const sourceIndex = parseInt(e.dataTransfer.getData('text/plain'));
    if (sourceIndex === targetIndex) return;

    const newSongs = [...songs];
    const [removed] = newSongs.splice(sourceIndex, 1);
    newSongs.splice(targetIndex, 0, removed);
    onReorderSongs(newSongs);
  };

  const conflictingSongs = songs.filter(s => s.status === 'too-recent');
  const showEditButton = isPublished && !isEditing;
  const isReadOnly = isPublished && !isEditing;

  // Status badge renderer
  const renderStatusBadge = () => {
    if (approvalStatus === "published" || isPublished) {
      return (
        <Badge variant="outline" className="text-xs border-green-500/50 text-green-500 gap-1">
          <Check className="h-3 w-3" />
          Published
        </Badge>
      );
    }
    if (approvalStatus === "pending_approval") {
      return (
        <Badge variant="outline" className="text-xs border-amber-500/50 text-amber-500 gap-1">
          <Clock className="h-3 w-3" />
          Pending Approval
        </Badge>
      );
    }
    if (approvalStatus === "rejected") {
      return (
        <Badge variant="outline" className="text-xs border-destructive/50 text-destructive gap-1">
          <XCircle className="h-3 w-3" />
          Needs Revision
        </Badge>
      );
    }
    return null;
  };

  return (
    <Card className="flex h-full min-h-0 flex-col">
      <CardHeader className="shrink-0 space-y-0 p-4 pb-2">
        <div className="flex flex-col gap-2">
          {/* Top row: Title and status */}
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Music2 className="h-5 w-5 shrink-0" />
              <span>My Set</span>
              {songs.length > 0 && (
                <span className="text-sm font-normal text-muted-foreground whitespace-nowrap">
                  ({songs.length})
                </span>
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              {renderStatusBadge()}
              {isEditing && isPublished && (
                <Badge variant="outline" className="text-xs border-amber-500/50 text-amber-600 gap-1 whitespace-nowrap">
                  <Pencil className="h-3 w-3" />
                  Editing
                </Badge>
              )}
            </div>
          </div>
          
          {/* Bottom row: Actions */}
          <div className="flex items-center gap-2">
            {showEditButton ? (
              <Button
                onClick={() => setIsEditing(true)}
                size="sm"
                variant="outline"
                className="gap-2 w-full sm:w-auto"
              >
                <Pencil className="h-4 w-4" />
                Edit Published Set
              </Button>
            ) : (
              <>
                <Button
                  onClick={onSave}
                  disabled={songs.length === 0 || isSaving}
                  size="sm"
                  className={cn(
                    "gap-2 transition-all duration-300 hover:scale-[1.03] border-0 flex-1 sm:flex-none",
                    showSaved 
                      ? "bg-green-600 hover:bg-green-600" 
                      : "bg-gradient-to-r from-primary via-primary/90 to-primary/80 shadow-[0_0_15px_rgba(var(--primary),0.4)] hover:shadow-[0_0_25px_rgba(var(--primary),0.6)]"
                  )}
                >
                  {isSaving ? (
                    <>
                      <Save className="h-4 w-4 animate-pulse" />
                      Saving...
                    </>
                  ) : showSaved ? (
                    <>
                      <Check className="h-4 w-4" />
                      Saved!
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      {isPublished ? 'Save' : 'Save Draft'}
                    </>
                  )}
                </Button>
                {!isEditing && publishButton}
              </>
            )}
          </div>
        </div>

        {/* Rejection notes banner */}
        {approvalStatus === "rejected" && rejectionNotes && (
          <div className="mt-2 flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/10 p-2 text-sm text-destructive">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Revision requested</p>
              <p className="text-xs opacity-80">{rejectionNotes}</p>
            </div>
          </div>
        )}

        {hasConflicts && conflictingSongs.length > 0 && (
          <div className="mt-2 flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/10 p-2 text-sm text-amber-600">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Rule violations detected</p>
              <p className="text-xs opacity-80">
                {conflictingSongs.length} song{conflictingSongs.length > 1 ? 's' : ''} added before the
                recommended wait period
              </p>
            </div>
          </div>
        )}

        {isReadOnly && (
          <div className="mt-2 flex items-start gap-2 rounded-md border bg-muted/60 p-2 text-sm">
            <Pencil className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="font-medium">Published set locked</p>
              <p className="text-xs text-muted-foreground">
                Click <span className="font-medium text-foreground">Edit Published Set</span> to make changes.
              </p>
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-3 pt-0">
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-1.5 pb-1">
            {songs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Music2 className="mb-2 h-10 w-10 opacity-30" />
                <p className="text-sm">No songs added yet</p>
                <p className="text-xs">Click + on songs to add them to your set</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {songs.map((item, index) => (
                  <div
                    key={item.song.id}
                    draggable={!isReadOnly}
                    onDragStart={e => handleDragStart(e, index)}
                    onDragOver={handleDragOver}
                    onDrop={e => handleDrop(e, index)}
                    className={cn(
                      'grid items-center gap-1.5 rounded-lg border bg-card p-1.5',
                      // Grid layout: grip | number | title | controls
                      isMobile 
                        ? 'grid-cols-[16px_24px_1fr_auto]' 
                        : 'grid-cols-[16px_24px_1fr_auto]',
                      item.status === 'too-recent' && 'border-amber-500/30 bg-amber-500/5',
                      isReadOnly ? 'cursor-default opacity-90' : 'cursor-grab active:cursor-grabbing'
                    )}
                  >
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                    
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                      {index + 1}
                    </span>

                    {/* Song title - takes remaining space, truncates */}
                    <div className="min-w-0 space-y-1">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-sm font-medium leading-tight">{item.song.title}</p>
                          {/* NEW badge follows 12-month new-song classification for this campus/ministry */}
                          {(item.isNewSong || item.isGloballyNew) && (
                            <Badge className="h-4 shrink-0 bg-ecc-teal px-1.5 py-0 text-[10px] text-white">
                              NEW
                            </Badge>
                          )}
                        </div>
                        {/* Hide author on mobile to save space */}
                        {!isMobile && item.song.author && (
                          <p className="truncate text-xs leading-tight text-muted-foreground">{item.song.author}</p>
                        )}
                      </div>
                      <Input
                        value={item.youtubeUrl || ""}
                        onChange={(event) => onYoutubeLinkChange(item.song.id, event.target.value)}
                        onClick={(event) => event.stopPropagation()}
                        placeholder="Add YouTube link (optional)"
                        className="h-7 text-xs"
                        disabled={isReadOnly}
                      />
                    </div>

                    {/* Controls - auto width */}
                    <div className="flex items-center gap-1">
                      <KeySelector
                        value={item.selectedKey || null}
                        onChange={(key) => onKeyChange(item.song.id, key)}
                        suggestedKey={item.suggestedKey}
                        compact
                        disabled={isReadOnly}
                      />

                      <MultiVocalistSelector
                        value={item.selectedVocalistIds || (item.selectedVocalistId ? [item.selectedVocalistId] : [])}
                        onChange={(vocalistIds) => onVocalistChange(item.song.id, vocalistIds)}
                        vocalists={vocalists}
                        disabled={isReadOnly}
                      />

                      {item.status === 'too-recent' && (
                        <AvailabilityBadge
                          status={item.status}
                          weeksUntilAvailable={item.weeksUntilAvailable}
                          compact
                        />
                      )}

                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                          "shrink-0 text-muted-foreground hover:text-destructive",
                          isMobile ? "h-6 w-6" : "h-7 w-7"
                        )}
                        onClick={() => onRemoveSong(item.song.id)}
                        disabled={isReadOnly}
                      >
                        <X className={cn(isMobile ? "h-3.5 w-3.5" : "h-4 w-4")} />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-lg border bg-card p-1.5">
              <p className="mb-1 px-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Set notes
              </p>
              <Textarea
                ref={notesTextareaRef}
                placeholder="Add notes about this set (optional)..."
                value={notes}
                onChange={e => onNotesChange(e.target.value)}
                rows={1}
                className="min-h-[4.5rem] resize-none overflow-hidden border-0 bg-transparent p-1.5 text-sm shadow-none focus-visible:ring-0"
                disabled={isReadOnly}
              />
            </div>

            <VocalistRundownNotesPanel
              notes={vocalistRundownNotes}
              isLoading={vocalistRundownNotesLoading}
            />
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
