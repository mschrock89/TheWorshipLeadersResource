import { useEffect, useState } from "react";
import { FileText, Loader2, Music } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSongVersions } from "@/hooks/useSongs";

interface ChordChartDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  song: {
    id: string;
    title: string;
    author: string | null;
  } | null;
}

export function ChordChartDialog({ open, onOpenChange, song }: ChordChartDialogProps) {
  const { data: versions, isLoading } = useSongVersions(song?.id ?? null, open);
  const [selectedVersionId, setSelectedVersionId] = useState("");

  useEffect(() => {
    if (!open) {
      setSelectedVersionId("");
      return;
    }

    if (!versions?.length) return;

    if (!versions.some((version) => version.id === selectedVersionId)) {
      setSelectedVersionId(versions[0].id);
    }
  }, [open, selectedVersionId, versions]);

  const selectedVersion = versions?.find((version) => version.id === selectedVersionId) ?? versions?.[0] ?? null;
  const chordChartText = selectedVersion?.chord_chart_text?.trim() || "";
  const lyricsText = selectedVersion?.lyrics?.trim() || "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Music className="h-5 w-5" />
            {song?.title || "Chord Chart"}
          </DialogTitle>
          <DialogDescription>{song?.author || "Unknown author"}</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex min-h-[320px] items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading chord charts...</span>
          </div>
        ) : !versions?.length ? (
          <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 text-center text-muted-foreground">
            <FileText className="h-10 w-10 opacity-50" />
            <div className="space-y-1">
              <p className="font-medium text-foreground">No chord chart synced yet</p>
              <p className="text-sm">Run a Planning Center sync with chord charts enabled for this song.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  {versions.length} version{versions.length === 1 ? "" : "s"}
                </Badge>
                {selectedVersion?.is_primary ? <Badge variant="outline">Primary</Badge> : null}
                {chordChartText ? <Badge variant="outline">Chart</Badge> : null}
                {lyricsText ? <Badge variant="outline">Lyrics</Badge> : null}
              </div>

              <div className="w-full sm:w-[260px]">
                <Select value={selectedVersion?.id || ""} onValueChange={setSelectedVersionId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select version" />
                  </SelectTrigger>
                  <SelectContent>
                    {versions.map((version) => (
                      <SelectItem key={version.id} value={version.id}>
                        {version.version_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <ScrollArea className="h-[60vh] rounded-md border bg-muted/20">
              <div className="space-y-6 p-4">
                {chordChartText ? (
                  <section className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                        Chord Chart
                      </h3>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => navigator.clipboard.writeText(chordChartText)}
                      >
                        Copy
                      </Button>
                    </div>
                    <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-background p-4 font-mono text-sm leading-6">
                      {chordChartText}
                    </pre>
                  </section>
                ) : null}

                {lyricsText ? (
                  <section className="space-y-2">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      Lyrics
                    </h3>
                    <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-background p-4 font-mono text-sm leading-6">
                      {lyricsText}
                    </pre>
                  </section>
                ) : null}

                {!chordChartText && !lyricsText ? (
                  <div className="flex min-h-[240px] items-center justify-center text-center text-muted-foreground">
                    <p>This version exists, but it does not include chart or lyric text.</p>
                  </div>
                ) : null}
              </div>
            </ScrollArea>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
