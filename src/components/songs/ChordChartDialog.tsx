import { useEffect, useMemo, useState } from "react";
import { FileText, Loader2, Music, Eye, Code2, X } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useSongChartVersions } from "@/hooks/useSongs";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { RenderedChordChart } from "@/components/songs/RenderedChordChart";
import {
  DisplayMode,
  KEY_LABELS_FLAT,
  KEY_LABELS_SHARP,
  detectKeyIndexFromChart,
  getSignedSemitoneDelta,
  parseKeyIndex,
  transposeChordChartText,
  upsertExplicitKeyLine,
} from "@/lib/chordChart";

interface ChordChartDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  song: {
    id: string;
    title: string;
    author: string | null;
    draftSetSongId?: string | null;
    originalKey?: string | null;
    openInRawEdit?: boolean;
  } | null;
}

export function ChordChartDialog({ open, onOpenChange, song }: ChordChartDialogProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: versions, isLoading } = useSongChartVersions(
    song?.id ?? null,
    song?.draftSetSongId ?? null,
    open,
  );
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [displayMode, setDisplayMode] = useState<DisplayMode>("rendered");
  const [accidentalPreference, setAccidentalPreference] = useState<"sharps" | "flats">("flats");
  const [originalKeyIndex, setOriginalKeyIndex] = useState(0);
  const [targetKeyIndex, setTargetKeyIndex] = useState(0);
  const [isEditingRaw, setIsEditingRaw] = useState(false);
  const [rawChartDraft, setRawChartDraft] = useState("");

  useEffect(() => {
    if (!open) {
      setSelectedVersionId("");
      setDisplayMode("rendered");
      setAccidentalPreference("flats");
      setOriginalKeyIndex(0);
      setTargetKeyIndex(0);
      setIsEditingRaw(false);
      setRawChartDraft("");
      return;
    }

    if (!versions?.length) return;

    if (song?.openInRawEdit) {
      setDisplayMode("raw");
      setIsEditingRaw(true);
    }

    if (!versions.some((version) => version.id === selectedVersionId)) {
      setSelectedVersionId(versions[0].id);
    }
  }, [open, selectedVersionId, versions, song?.openInRawEdit]);

  const selectedVersion = versions?.find((version) => version.id === selectedVersionId) ?? versions?.[0] ?? null;
  const rawChordChartText = selectedVersion?.chord_chart_text || "";
  const chordChartText = rawChordChartText.trim();

  useEffect(() => {
    if (!open) return;
    setIsEditingRaw(false);
    setRawChartDraft(rawChordChartText);
  }, [open, selectedVersion?.id, rawChordChartText]);

  useEffect(() => {
    if (!open) return;
    const detected = chordChartText ? detectKeyIndexFromChart(chordChartText) : 0;
    const setKeyIndex = parseKeyIndex(song?.originalKey);
    setOriginalKeyIndex(detected);
    setTargetKeyIndex(setKeyIndex ?? detected);
  }, [open, chordChartText, selectedVersion?.id, song?.originalKey]);

  const saveVersionChart = async (nextChartText: string) => {
    if (!selectedVersion?.id) throw new Error("No song version selected.");

    if (selectedVersion.chart_scope === "setlist") {
      const { error } = await supabase
        .from("draft_set_song_charts")
        .update({ chord_chart_text: nextChartText })
        .eq("id", selectedVersion.id);

      if (error) throw error;
      return;
    }

    if (song?.draftSetSongId) {
      const overrideVersionName =
        selectedVersion.version_name === "Setlist Override"
          ? selectedVersion.version_name
          : `${selectedVersion.version_name} (Setlist Override)`;

      const { error } = await supabase
        .from("draft_set_song_charts")
        .upsert({
          draft_set_song_id: song.draftSetSongId,
          source_song_version_id: selectedVersion.id,
          version_name: overrideVersionName,
          chord_chart_text: nextChartText,
        }, {
          onConflict: "draft_set_song_id",
        });

      if (error) throw error;
      return;
    }

    const { error } = await supabase
      .from("song_versions")
      .update({ chord_chart_text: nextChartText })
      .eq("id", selectedVersion.id);

    if (error) throw error;
  };

  const createInitialVersion = async () => {
    if (!song?.id) throw new Error("No song selected.");

    const { data, error } = await supabase
      .from("song_versions")
      .insert({
        song_id: song.id,
        version_name: "Default",
        is_primary: true,
        chord_chart_text: "",
      })
      .select("id")
      .single();

    if (error) throw error;
    return data.id as string;
  };

  const invalidateChartQueries = async () => {
    if (song?.id) {
      await queryClient.invalidateQueries({ queryKey: ["song-versions", song.id] });
    }
  };

  const saveRawChart = useMutation({
    mutationFn: async () => {
      await saveVersionChart(rawChartDraft);
    },
    onSuccess: async () => {
      await invalidateChartQueries();
      setIsEditingRaw(false);
      toast({
        title: "Chart updated",
        description: song?.draftSetSongId
          ? "Raw chord chart changes were saved for this setlist only."
          : "Raw chord chart changes were saved.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Unable to save chart",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const saveOriginalKey = useMutation({
    mutationFn: async (nextOriginalKeyIndex: number) => {
      const keySet = accidentalPreference === "flats" ? KEY_LABELS_FLAT : KEY_LABELS_SHARP;
      const nextKeyLabel = keySet[nextOriginalKeyIndex] || "C";
      const nextChartText = upsertExplicitKeyLine(rawChordChartText, nextKeyLabel);
      await saveVersionChart(nextChartText);
    },
    onSuccess: async () => {
      await invalidateChartQueries();
      toast({
        title: "Original key updated",
        description: song?.draftSetSongId
          ? "Saved to this setlist chart only."
          : "Saved to chart metadata.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Unable to save original key",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createManualChart = useMutation({
    mutationFn: createInitialVersion,
    onSuccess: async (versionId) => {
      await invalidateChartQueries();
      setSelectedVersionId(versionId);
      setDisplayMode("raw");
      setIsEditingRaw(true);
      setRawChartDraft("");
      toast({
        title: "Chart ready",
        description: "You can paste or type the chord chart now.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Unable to create chart",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const transposeSemitones = useMemo(
    () => getSignedSemitoneDelta(originalKeyIndex, targetKeyIndex),
    [originalKeyIndex, targetKeyIndex],
  );
  const transposedChordChartText = useMemo(
    () => transposeChordChartText(chordChartText, transposeSemitones, accidentalPreference),
    [chordChartText, transposeSemitones, accidentalPreference],
  );
  const lyricsText = selectedVersion?.lyrics?.trim() || "";
  const keyLabels = accidentalPreference === "flats" ? KEY_LABELS_FLAT : KEY_LABELS_SHARP;

  const closeChart = () => onOpenChange(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="z-[70]"
        className="z-[70] flex h-[100dvh] max-h-[100dvh] min-h-0 w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0 left-0 right-0 top-0 bottom-0 sm:left-[50%] sm:right-auto sm:bottom-auto sm:top-[50%] sm:h-[min(92dvh,56rem)] sm:max-h-[min(92dvh,56rem)] sm:w-full sm:max-w-6xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:border"
      >
        <div
          className="flex min-h-0 flex-1 flex-col"
          style={{
            paddingTop: "max(0.75rem, env(safe-area-inset-top, 0px))",
            paddingLeft: "max(0px, env(safe-area-inset-left, 0px))",
            paddingRight: "max(0px, env(safe-area-inset-right, 0px))",
          }}
        >
          <header className="flex shrink-0 items-start gap-3 border-b px-3 pb-3 sm:px-6">
            <DialogHeader className="min-w-0 flex-1 space-y-1 text-left">
              <DialogTitle className="flex items-start gap-2 text-lg leading-tight sm:items-center sm:text-lg sm:leading-none">
                <Music className="mt-0.5 h-5 w-5 shrink-0 sm:mt-0" />
                <span className="min-w-0 break-words">{song?.title || "Chord Chart"}</span>
              </DialogTitle>
              <DialogDescription className="text-sm">{song?.author || "Unknown author"}</DialogDescription>
            </DialogHeader>
            <DialogClose asChild>
              <Button
                type="button"
                variant="secondary"
                onClick={closeChart}
                className="h-11 shrink-0 gap-2 rounded-full px-4 text-base"
                aria-label="Close chart"
              >
                <X className="h-5 w-5" />
                Close
              </Button>
            </DialogClose>
          </header>

        {isLoading ? (
          <div className="flex min-h-0 flex-1 items-center justify-center gap-3 px-4 text-muted-foreground sm:px-6">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading chord charts...</span>
          </div>
        ) : !versions?.length ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-4 text-center text-muted-foreground sm:px-6">
            <FileText className="h-10 w-10 opacity-50" />
            <div className="space-y-1">
              <p className="font-medium text-foreground">No chord chart yet</p>
              <p className="text-sm">You can create one manually here, or sync chord charts from Planning Center.</p>
            </div>
            <Button
              type="button"
              onClick={() => createManualChart.mutate()}
              disabled={createManualChart.isPending}
            >
              {createManualChart.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Create Chart
            </Button>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="shrink-0 space-y-2 border-b px-3 py-2.5 sm:space-y-3 sm:px-6 sm:py-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="secondary">
                  {versions.length} version{versions.length === 1 ? "" : "s"}
                </Badge>
                {selectedVersion?.is_primary ? <Badge variant="outline">Primary</Badge> : null}
                {selectedVersion?.chart_scope === "setlist" ? <Badge variant="outline">Setlist Override</Badge> : null}
                {chordChartText ? <Badge variant="outline">Chart</Badge> : null}
                {lyricsText ? <Badge variant="outline">Lyrics</Badge> : null}
              </div>

              <div className="grid grid-cols-2 gap-2 lg:grid-cols-12">
                <div className="col-span-2 lg:col-span-3">
                  <Select value={selectedVersion?.id || ""} onValueChange={setSelectedVersionId}>
                    <SelectTrigger className="h-11 text-sm sm:h-12 sm:text-base">
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
                <div className="col-span-1 lg:col-span-2">
                  <Select
                    value={String(originalKeyIndex)}
                    onValueChange={(value) => {
                      const nextIndex = Number(value);
                      setOriginalKeyIndex(nextIndex);
                      setTargetKeyIndex(nextIndex);
                      saveOriginalKey.mutate(nextIndex);
                    }}
                    disabled={isEditingRaw || saveOriginalKey.isPending}
                  >
                    <SelectTrigger className="h-11 text-sm sm:h-12 sm:text-base">
                      <SelectValue placeholder="Original Key" />
                    </SelectTrigger>
                    <SelectContent>
                      {keyLabels.map((label, index) => (
                        <SelectItem key={`original-${label}-${index}`} value={String(index)}>
                          Original: {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-1 lg:col-span-2">
                  <Select
                    value={String(targetKeyIndex)}
                    onValueChange={(value) => setTargetKeyIndex(Number(value))}
                    disabled={isEditingRaw}
                  >
                    <SelectTrigger className="h-11 text-sm sm:h-12 sm:text-base">
                      <SelectValue placeholder="Target Key" />
                    </SelectTrigger>
                    <SelectContent>
                      {keyLabels.map((label, index) => (
                        <SelectItem key={`target-${label}-${index}`} value={String(index)}>
                          To: {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-1 lg:col-span-2">
                  <Select
                    value={accidentalPreference}
                    onValueChange={(value: "sharps" | "flats") => setAccidentalPreference(value)}
                    disabled={isEditingRaw}
                  >
                    <SelectTrigger className="h-11 text-sm sm:h-12 sm:text-base">
                      <SelectValue placeholder="Accidentals" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="flats">Flats</SelectItem>
                      <SelectItem value="sharps">Sharps</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 grid grid-cols-2 gap-2 lg:col-span-3">
                  <Button
                    type="button"
                    variant={displayMode === "rendered" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setDisplayMode("rendered")}
                    disabled={isEditingRaw}
                    className="h-11 w-full gap-1.5 text-sm sm:h-12 sm:text-base"
                  >
                    <Eye className="h-4 w-4" />
                    Chart
                  </Button>
                  <Button
                    type="button"
                    variant={displayMode === "raw" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setDisplayMode("raw")}
                    className="h-11 w-full gap-1.5 text-sm sm:h-12 sm:text-base"
                  >
                    <Code2 className="h-4 w-4" />
                    Raw
                  </Button>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-6 sm:py-4">
              <div className="space-y-5 sm:space-y-6">
                <section className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      Chord Chart
                    </h3>
                    <div className="flex flex-wrap items-center gap-2">
                      {displayMode === "raw" && !isEditingRaw ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-10"
                          onClick={() => {
                            setIsEditingRaw(true);
                            setRawChartDraft(rawChordChartText);
                          }}
                        >
                          Edit Raw
                        </Button>
                      ) : null}
                      {displayMode === "raw" && isEditingRaw ? (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-10"
                            disabled={saveRawChart.isPending}
                            onClick={() => {
                              setIsEditingRaw(false);
                              setRawChartDraft(rawChordChartText);
                            }}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            className="h-10"
                            disabled={saveRawChart.isPending}
                            onClick={() => saveRawChart.mutate()}
                          >
                            {saveRawChart.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Save
                          </Button>
                        </>
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-10"
                        onClick={() =>
                          navigator.clipboard.writeText(
                            displayMode === "raw" ? (isEditingRaw ? rawChartDraft : rawChordChartText) : transposedChordChartText,
                          )
                        }
                      >
                        Copy
                      </Button>
                    </div>
                  </div>
                  {displayMode === "rendered" ? (
                    chordChartText ? (
                      <RenderedChordChart
                        title={song?.title || "Chord Chart"}
                        author={song?.author || null}
                        chordChartText={transposedChordChartText}
                        showHeader={false}
                        fitToWidth
                        scaleClassName="text-[15px] leading-[1.25] sm:text-[18px] sm:leading-[1.35] lg:text-[20px]"
                      />
                    ) : (
                      <div className="flex min-h-[180px] items-center justify-center rounded-md border bg-background p-4 text-center text-muted-foreground">
                        <p>No chart text yet. Switch to Raw and add one.</p>
                      </div>
                    )
                  ) : isEditingRaw ? (
                    <Textarea
                      value={rawChartDraft}
                      onChange={(event) => setRawChartDraft(event.target.value)}
                      className="min-h-[240px] resize-y bg-background font-mono text-sm leading-6 sm:min-h-[360px]"
                    />
                  ) : (
                    <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-background p-3 font-mono text-[13px] leading-5 sm:p-4 sm:text-sm sm:leading-6">
                      {rawChordChartText || "No raw chart text yet. Click Edit Raw to add one."}
                    </pre>
                  )}
                </section>

                {lyricsText ? (
                  <section className="space-y-2">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      Lyrics
                    </h3>
                    <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-background p-3 font-mono text-[13px] leading-5 sm:p-4 sm:text-sm sm:leading-6">
                      {lyricsText}
                    </pre>
                  </section>
                ) : null}
              </div>
            </div>
          </div>
        )}

          <div
            className="shrink-0 border-t px-3 pt-3 sm:hidden [@media(max-height:500px)]:hidden"
            style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))" }}
          >
            <DialogClose asChild>
              <Button
                type="button"
                variant="secondary"
                onClick={closeChart}
                className="h-12 w-full text-base"
              >
                Close Chart
              </Button>
            </DialogClose>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
