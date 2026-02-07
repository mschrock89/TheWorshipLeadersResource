import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { AvailabilityBadge } from "./AvailabilityBadge";
import { SongAvailability } from "@/hooks/useSetPlanner";
import { KeySelector } from "./KeySelector";
import { MultiVocalistSelector } from "./MultiVocalistSelector";
import { ScheduledVocalist } from "@/hooks/useScheduledVocalists";
import { GripVertical, X, Save, Music2, AlertTriangle, Check, Pencil, Clock, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";

export interface BuildingSetSong extends SongAvailability {
  selectedKey?: string | null;
  /** @deprecated Use selectedVocalistIds instead */
  selectedVocalistId?: string | null;
  selectedVocalistIds?: string[];
}

export type ApprovalStatus = "draft" | "pending_approval" | "published" | "rejected";

interface BuildingSetProps {
  songs: BuildingSetSong[];
  onRemoveSong: (songId: string) => void;
  onReorderSongs: (songs: BuildingSetSong[]) => void;
  onKeyChange: (songId: string, key: string | null) => void;
  onVocalistChange: (songId: string, vocalistIds: string[]) => void;
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
}

export function BuildingSet({
  songs,
  onRemoveSong,
  onReorderSongs,
  onKeyChange,
  onVocalistChange,
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
}: BuildingSetProps) {
  const isMobile = useIsMobile();
  const [isEditing, setIsEditing] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedStateRef = useRef<string>('');
  const prevIsSavingRef = useRef(isSaving);

  // Show "Saved!" confirmation when save completes
  useEffect(() => {
    if (prevIsSavingRef.current && !isSaving) {
      setShowSaved(true);
      const timer = setTimeout(() => setShowSaved(false), 2000);
      return () => clearTimeout(timer);
    }
    prevIsSavingRef.current = isSaving;
  }, [isSaving]);

  // Auto-save for published sets being edited
  useEffect(() => {
    if (!isPublished || !isEditing || songs.length === 0) return;

    // Create a state snapshot for comparison
    const currentState = JSON.stringify({
      songs: songs.map(s => ({ id: s.song.id, key: s.selectedKey, vocalists: s.selectedVocalistIds || [] })),
      notes
    });

    // Skip if nothing changed
    if (currentState === lastSavedStateRef.current) return;

    // Clear any existing timer
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    // Auto-save after 1.5 seconds of no changes
    autoSaveTimerRef.current = setTimeout(() => {
      lastSavedStateRef.current = currentState;
      onSave();
    }, 1500);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [songs, notes, isPublished, isEditing, onSave]);

  // Reset editing state when isPublished changes (e.g., switching dates)
  useEffect(() => {
    setIsEditing(false);
  }, [isPublished]);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.setData('text/plain', index.toString());
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
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
    <Card className="flex flex-col h-full">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3">
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
                  <span className="hidden sm:inline">Editing •</span> Auto-saves
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
          <div className="flex items-start gap-2 p-2 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm mt-2">
            <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Revision requested</p>
              <p className="text-xs opacity-80">{rejectionNotes}</p>
            </div>
          </div>
        )}

        {hasConflicts && conflictingSongs.length > 0 && (
          <div className="flex items-start gap-2 p-2 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-600 text-sm mt-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Rule violations detected</p>
              <p className="text-xs opacity-80">
                {conflictingSongs.length} song{conflictingSongs.length > 1 ? 's' : ''} added before the
                recommended wait period
              </p>
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent className="flex-1 flex flex-col gap-3 overflow-hidden">
        <ScrollArea className="flex-1">
          {songs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Music2 className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm">No songs added yet</p>
              <p className="text-xs">Click + on songs to add them to your set</p>
            </div>
          ) : (
            <div className="space-y-2 p-1 pb-2">
              {songs.map((item, index) => (
                <div
                  key={item.song.id}
                  draggable
                  onDragStart={e => handleDragStart(e, index)}
                  onDragOver={handleDragOver}
                  onDrop={e => handleDrop(e, index)}
                  className={cn(
                    'grid items-center gap-1.5 p-2 rounded-lg border bg-card cursor-grab active:cursor-grabbing',
                    // Grid layout: grip | number | title | controls
                    isMobile 
                      ? 'grid-cols-[16px_24px_1fr_auto]' 
                      : 'grid-cols-[16px_24px_1fr_auto]',
                    item.status === 'too-recent' && 'border-amber-500/30 bg-amber-500/5'
                  )}
                >
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                  
                  <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-medium flex items-center justify-center">
                    {index + 1}
                  </span>

                  {/* Song title - takes remaining space, truncates */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-medium text-sm truncate">{item.song.title}</p>
                      {/* NEW badge for songs never scheduled at this campus/ministry */}
                      {item.totalUses === 0 && (
                        <Badge className="bg-ecc-teal text-white text-[10px] px-1.5 py-0 h-4 shrink-0">
                          NEW
                        </Badge>
                      )}
                    </div>
                    {/* Hide author on mobile to save space */}
                    {!isMobile && item.song.author && (
                      <p className="text-xs text-muted-foreground truncate">{item.song.author}</p>
                    )}
                  </div>

                  {/* Controls - auto width */}
                  <div className="flex items-center gap-1">
                    <KeySelector
                      value={item.selectedKey || null}
                      onChange={(key) => onKeyChange(item.song.id, key)}
                      suggestedKey={item.suggestedKey}
                      compact
                    />

                    <MultiVocalistSelector
                      value={item.selectedVocalistIds || (item.selectedVocalistId ? [item.selectedVocalistId] : [])}
                      onChange={(vocalistIds) => onVocalistChange(item.song.id, vocalistIds)}
                      vocalists={vocalists}
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
                    >
                      <X className={cn(isMobile ? "h-3.5 w-3.5" : "h-4 w-4")} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Notes */}
        <div>
          <Textarea
            placeholder="Add notes about this set (optional)..."
            value={notes}
            onChange={e => onNotesChange(e.target.value)}
            className="resize-none h-20 text-sm"
          />
        </div>
      </CardContent>
    </Card>
  );
}
