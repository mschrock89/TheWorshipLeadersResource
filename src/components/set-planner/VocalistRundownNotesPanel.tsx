import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { VocalistRundownNote } from "@/hooks/useWeekendRundown";
import { GOOD_FIT_LABEL } from "@/lib/weekendRundown";

interface VocalistRundownNotesPanelProps {
  notes: VocalistRundownNote[];
  isLoading?: boolean;
}

export function VocalistRundownNotesPanel({
  notes,
  isLoading = false,
}: VocalistRundownNotesPanelProps) {
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

  if (isLoading && notes.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-3">
        <p className="text-xs text-muted-foreground">Loading singer notes…</p>
      </div>
    );
  }

  if (notes.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="mb-3 flex items-start gap-2">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight">Notes from past rundowns</p>
          <p className="text-xs text-muted-foreground">
            These singers are scheduled again. Notes left for them on previous weekends.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {notesByVocalist.map((group) => (
          <div key={group.vocalistName} className="space-y-2">
            <h3 className="text-sm font-semibold">{group.vocalistName}</h3>
            {group.notes.map((note) => (
              <div key={note.id} className="rounded-md border border-border/60 bg-muted/20 p-3">
                <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className="text-[10px]">
                    {note.song_title}
                  </Badge>
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
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  From {note.author_name || "a leader"}
                </p>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
