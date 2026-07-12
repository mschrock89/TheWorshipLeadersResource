import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { MessageSquareText, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { VocalistRundownNote } from "@/hooks/useWeekendRundown";
import { GOOD_FIT_LABEL } from "@/lib/weekendRundown";

interface VocalistRundownNotesDialogProps {
  notes: VocalistRundownNote[];
  openKey: string;
  isLoading?: boolean;
}

export function VocalistRundownNotesDialog({
  notes,
  openKey,
  isLoading = false,
}: VocalistRundownNotesDialogProps) {
  const [open, setOpen] = useState(false);
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);

  const notesByVocalist = useMemo(() => {
    const groups = new Map<string, { vocalistName: string; notes: VocalistRundownNote[] }>();
    for (const note of notes) {
      const existing = groups.get(note.vocalist_id);
      if (!existing) {
        groups.set(note.vocalist_id, {
          vocalistName: note.vocalist_name,
          notes: [note],
        });
        continue;
      }
      existing.notes.push(note);
    }
    return Array.from(groups.values()).sort((a, b) => a.vocalistName.localeCompare(b.vocalistName));
  }, [notes]);

  const vocalistCount = notesByVocalist.length;

  useEffect(() => {
    if (isLoading || notes.length === 0) return;
    if (dismissedKey === openKey) return;
    setOpen(true);
  }, [dismissedKey, isLoading, notes.length, openKey]);

  if (notes.length === 0 && !isLoading) {
    return null;
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => setOpen(true)}
        disabled={isLoading || notes.length === 0}
      >
        <MessageSquareText className="h-4 w-4" />
        Singer notes
        {vocalistCount > 0 && (
          <Badge variant="secondary" className="ml-1">
            {vocalistCount}
          </Badge>
        )}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) {
            setDismissedKey(openKey);
          }
        }}
      >
        <DialogContent className="flex max-h-[85vh] flex-col gap-4 sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Notes from past rundowns
            </DialogTitle>
            <DialogDescription>
              These singers are scheduled again. Here are the notes left for them on previous weekends.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh] pr-4">
            <div className="space-y-5">
              {notesByVocalist.map((group) => (
                <div key={group.vocalistName} className="space-y-3">
                  <h3 className="font-semibold">{group.vocalistName}</h3>
                  {group.notes.map((note) => (
                    <div key={note.id} className="rounded-lg border border-border/60 bg-muted/20 p-4">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{note.song_title}</Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {format(parseISO(note.weekend_date), "MMM d, yyyy")}
                        </Badge>
                        {note.fit_label === GOOD_FIT_LABEL && (
                          <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300">
                            Good Fit
                          </Badge>
                        )}
                      </div>
                      <p className="whitespace-pre-wrap text-sm text-muted-foreground">{note.notes}</p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        From {note.author_name || "a leader"}
                      </p>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
