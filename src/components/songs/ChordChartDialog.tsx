import { useEffect, useMemo, useState } from "react";
import { FileText, Loader2, Music, Eye, Code2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Textarea } from "@/components/ui/textarea";
import { useSongVersions } from "@/hooks/useSongs";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ChordChartDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  song: {
    id: string;
    title: string;
    author: string | null;
    originalKey?: string | null;
    openInRawEdit?: boolean;
  } | null;
}

type DisplayMode = "rendered" | "raw";

type RenderedLine =
  | { kind: "empty" }
  | { kind: "section"; text: string }
  | { kind: "chords"; text: string }
  | { kind: "lyricWithChords"; lyric: string; chords: string }
  | { kind: "text"; text: string };

const RENDERED_CHART_FONT_FAMILY =
  '"Helvetica Neue", Helvetica, Arial, sans-serif';

const NOTE_SEQUENCE_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const NOTE_SEQUENCE_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const KEY_LABELS_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const KEY_LABELS_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const NOTE_INDEX: Record<string, number> = {
  C: 0,
  "B#": 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  Fb: 4,
  F: 5,
  "E#": 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
  Cb: 11,
};

function padToLength(input: string, targetLength: number): string {
  if (input.length >= targetLength) return input;
  return input + " ".repeat(targetLength - input.length);
}

function stripBracketedChords(line: string): string {
  return line.replace(/\[([^\]]+)\]/g, "$1");
}

function isSectionHeader(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (trimmed.includes("[") || trimmed.includes("]")) return false;
  return /^(intro|verse(?:\s+\d+)?|chorus|bridge|tag|turnaround|pre[-\s]?chorus|outro|interlude|repeat chorus)$/i.test(trimmed);
}

function isChordOnlyLine(line: string): boolean {
  if (!line.includes("[")) return false;
  const stripped = stripBracketedChords(line).trim();
  if (!stripped) return true;
  return /^[A-Ga-g0-9#b/().+|:\s-]+$/.test(stripped);
}

function buildLyricAndChordLine(line: string): { lyric: string; chords: string } {
  const regex = /\[([^\]]+)\]/g;
  let match: RegExpExecArray | null;
  let cursor = 0;
  let lyricLine = "";
  let chordLine = "";

  while ((match = regex.exec(line)) !== null) {
    const lyricChunk = line.slice(cursor, match.index);
    lyricLine += lyricChunk;
    chordLine = padToLength(chordLine, lyricLine.length);

    const chord = match[1].trim();
    if (chord) {
      chordLine += chord;
    }

    cursor = regex.lastIndex;
  }

  const trailingLyrics = line.slice(cursor);
  lyricLine += trailingLyrics;
  chordLine = padToLength(chordLine, lyricLine.length);

  return {
    lyric: lyricLine,
    chords: chordLine,
  };
}

function renderChordChartText(chordChartText: string): RenderedLine[] {
  return chordChartText.split("\n").map((rawLine) => {
    const line = rawLine.replace(/\t/g, "  ");
    const trimmed = line.trim();

    if (!trimmed) {
      return { kind: "empty" } as RenderedLine;
    }

    if (isSectionHeader(trimmed)) {
      return { kind: "section", text: trimmed };
    }

    if (isChordOnlyLine(line)) {
      return { kind: "chords", text: stripBracketedChords(line).trimEnd() };
    }

    if (line.includes("[")) {
      const { lyric, chords } = buildLyricAndChordLine(line);
      if (lyric || chords) {
        return { kind: "lyricWithChords", lyric, chords };
      }
    }

    return { kind: "text", text: line.trimEnd() };
  });
}

function transposeNote(note: string, semitones: number): string {
  const index = NOTE_INDEX[note];
  if (index === undefined) return note;

  const wrapped = (((index + semitones) % 12) + 12) % 12;
  const preferFlats = note.includes("b") && !note.includes("#");
  return preferFlats ? NOTE_SEQUENCE_FLAT[wrapped] : NOTE_SEQUENCE_SHARP[wrapped];
}

function transposeNoteWithPreference(
  note: string,
  semitones: number,
  accidentalPreference: "sharps" | "flats",
): string {
  const index = NOTE_INDEX[note];
  if (index === undefined) return note;
  const wrapped = (((index + semitones) % 12) + 12) % 12;
  return accidentalPreference === "flats" ? NOTE_SEQUENCE_FLAT[wrapped] : NOTE_SEQUENCE_SHARP[wrapped];
}

function transposeChordToken(
  token: string,
  semitones: number,
  accidentalPreference: "sharps" | "flats",
): string {
  if (!token || semitones === 0) return token;

  const [mainPart, bassPart] = token.split("/");
  const mainMatch = mainPart.match(/^([A-G](?:#|b)?)(.*)$/);
  if (!mainMatch) return token;

  const transposedMainRoot = transposeNoteWithPreference(mainMatch[1], semitones, accidentalPreference);
  const transposedMain = `${transposedMainRoot}${mainMatch[2] || ""}`;

  if (!bassPart) return transposedMain;

  const bassMatch = bassPart.match(/^([A-G](?:#|b)?)(.*)$/);
  if (!bassMatch) return transposedMain;
  const transposedBassRoot = transposeNoteWithPreference(bassMatch[1], semitones, accidentalPreference);
  return `${transposedMain}/${transposedBassRoot}${bassMatch[2] || ""}`;
}

function transposeChordChartText(
  chordChartText: string,
  semitones: number,
  accidentalPreference: "sharps" | "flats",
): string {
  if (semitones === 0) return chordChartText;

  const transposeFreeChordTokens = (input: string): string =>
    input.replace(
      /\b([A-G](?:#|b)?(?:maj|min|m|sus|add|dim|aug|[0-9()+-]*)?(?:\/[A-G](?:#|b)?)?)\b/g,
      (match) => transposeChordToken(match, semitones, accidentalPreference),
    );

  return chordChartText
    .split("\n")
    .map((line) => {
      if (line.includes("[")) {
        return line.replace(/\[([^\]]+)\]/g, (_, token: string) => {
          const transposed = transposeChordToken(token.trim(), semitones, accidentalPreference);
          return `[${transposed}]`;
        });
      }
      return transposeFreeChordTokens(line);
    })
    .join("\n");
}

function detectKeyIndexFromChart(chordChartText: string): number {
  // Prefer explicit chart metadata if present.
  const explicitKeyPatterns = [
    /\bkey\s*[:=-]\s*([A-G](?:#|b)?)/i,
    /\bcapo\s+\d+.*\bkey\s*[:=-]?\s*([A-G](?:#|b)?)/i,
  ];
  for (const pattern of explicitKeyPatterns) {
    const match = chordChartText.match(pattern);
    if (match?.[1]) {
      const idx = NOTE_INDEX[match[1]];
      if (typeof idx === "number") return idx;
    }
  }

  // Gather chord tokens from bracketed charts and plain chord-only lines.
  const tokenRegex = /\b([A-G](?:#|b)?(?:maj|min|m|sus|add|dim|aug|[0-9()+-]*)?(?:\/[A-G](?:#|b)?)?)\b/g;
  const rootVotes = new Map<number, number>();
  const functionVotes = new Map<number, number>();

  const addVote = (index: number, amount: number, target: Map<number, number>) => {
    target.set(index, (target.get(index) || 0) + amount);
  };

  const registerChordToken = (token: string, positionWeight = 1) => {
    const main = token.split("/")[0];
    const rootMatch = main.match(/^([A-G](?:#|b)?)(.*)$/);
    if (!rootMatch) return;
    const rootIndex = NOTE_INDEX[rootMatch[1]];
    if (rootIndex === undefined) return;

    const suffix = (rootMatch[2] || "").toLowerCase();
    const isMinor =
      /^m(?!aj)/.test(suffix) ||
      /\bmin\b/.test(suffix) ||
      /-/.test(suffix);

    addVote(rootIndex, 2 * positionWeight, rootVotes);

    // Score likely tonal centers by diatonic-function fit.
    // Major: I, IV, V strongest, then ii/iii/vi.
    // Minor: i, iv, v strongest, then III/VI/VII.
    const majorCandidates = [
      { tonicOffset: 0, weight: 5 },  // I
      { tonicOffset: 5, weight: 4 },  // IV
      { tonicOffset: 7, weight: 4 },  // V
      { tonicOffset: 2, weight: 2 },  // ii
      { tonicOffset: 4, weight: 2 },  // iii
      { tonicOffset: 9, weight: 2 },  // vi
    ];
    const minorCandidates = [
      { tonicOffset: 0, weight: 5 },  // i
      { tonicOffset: 5, weight: 4 },  // iv
      { tonicOffset: 7, weight: 3 },  // v
      { tonicOffset: 3, weight: 2 },  // III
      { tonicOffset: 8, weight: 2 },  // VI
      { tonicOffset: 10, weight: 2 }, // VII
    ];

    if (isMinor) {
      for (const candidate of minorCandidates) {
        const tonic = (rootIndex - candidate.tonicOffset + 12) % 12;
        addVote(tonic, candidate.weight * positionWeight, functionVotes);
      }
    } else {
      for (const candidate of majorCandidates) {
        const tonic = (rootIndex - candidate.tonicOffset + 12) % 12;
        addVote(tonic, candidate.weight * positionWeight, functionVotes);
      }
    }
  };

  const lines = chordChartText.split("\n");
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const weight = lineIndex < 6 ? 1.5 : 1;

    if (line.includes("[")) {
      const bracketRegex = /\[([^\]]+)\]/g;
      let bracketMatch: RegExpExecArray | null;
      while ((bracketMatch = bracketRegex.exec(line)) !== null) {
        registerChordToken(bracketMatch[1].trim(), weight);
      }
      continue;
    }

    if (isChordOnlyLine(line)) {
      let tokenMatch: RegExpExecArray | null;
      while ((tokenMatch = tokenRegex.exec(line)) !== null) {
        registerChordToken(tokenMatch[1], weight);
      }
      tokenRegex.lastIndex = 0;
    }
  }

  if (functionVotes.size === 0 && rootVotes.size === 0) return 0;

  // Combine functional harmony and raw frequency, preferring functional score.
  let bestIndex = 0;
  let bestScore = -Infinity;
  for (let tonic = 0; tonic < 12; tonic += 1) {
    const score = (functionVotes.get(tonic) || 0) * 3 + (rootVotes.get(tonic) || 0);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = tonic;
    }
  }

  return bestIndex;
}

function getSignedSemitoneDelta(fromIndex: number, toIndex: number): number {
  let delta = (toIndex - fromIndex + 12) % 12;
  if (delta > 6) delta -= 12;
  return delta;
}

function RenderedChordChart({
  title,
  author,
  chordChartText,
}: {
  title: string;
  author: string | null;
  chordChartText: string;
}) {
  const renderedLines = useMemo(() => renderChordChartText(chordChartText), [chordChartText]);

  return (
    <div
      className="rounded-md border bg-background p-4 text-[20px] leading-[1.45] sm:text-[22px]"
      style={{ fontFamily: RENDERED_CHART_FONT_FAMILY }}
    >
      <div className="mb-5 border-b pb-3">
        <h3 className="text-xl font-bold">{title}</h3>
        {author ? <p className="text-sm text-muted-foreground">{author}</p> : null}
      </div>

      <div className="space-y-0.5">
        {renderedLines.map((line, index) => {
          if (line.kind === "empty") {
            return <div key={index} className="h-4" />;
          }

          if (line.kind === "section") {
            return (
              <pre key={index} className="mt-2 whitespace-pre font-bold">
                {line.text}
              </pre>
            );
          }

          if (line.kind === "chords") {
            return (
              <pre key={index} className="whitespace-pre font-bold">
                {line.text}
              </pre>
            );
          }

          if (line.kind === "lyricWithChords") {
            return (
              <div key={index} className="space-y-0">
                {line.chords.trim().length > 0 ? (
                  <pre className="whitespace-pre font-bold">{line.chords}</pre>
                ) : (
                  <div className="h-[1.45em]" />
                )}
                <pre className="whitespace-pre">{line.lyric}</pre>
              </div>
            );
          }

          return (
            <pre key={index} className="whitespace-pre">
              {line.text}
            </pre>
          );
        })}
      </div>
    </div>
  );
}

export function ChordChartDialog({ open, onOpenChange, song }: ChordChartDialogProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: versions, isLoading } = useSongVersions(song?.id ?? null, open);
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
    setOriginalKeyIndex(detected);
    setTargetKeyIndex(detected);
  }, [open, chordChartText, selectedVersion?.id]);

  const saveRawChart = useMutation({
    mutationFn: async () => {
      if (!selectedVersion?.id) throw new Error("No song version selected.");
      const { error } = await supabase
        .from("song_versions")
        .update({ chord_chart_text: rawChartDraft })
        .eq("id", selectedVersion.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      if (song?.id) {
        await queryClient.invalidateQueries({ queryKey: ["song-versions", song.id] });
      }
      setIsEditingRaw(false);
      toast({
        title: "Chart updated",
        description: "Raw chord chart changes were saved.",
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-hidden p-0">
        <div className="flex max-h-[92vh] flex-col">
          <div className="px-6 pt-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Music className="h-5 w-5" />
            {song?.title || "Chord Chart"}
          </DialogTitle>
          <DialogDescription>{song?.author || "Unknown author"}</DialogDescription>
        </DialogHeader>
          </div>

        {isLoading ? (
          <div className="flex min-h-[320px] items-center justify-center gap-3 px-6 pb-6 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading chord charts...</span>
          </div>
        ) : !versions?.length ? (
          <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 px-6 pb-6 text-center text-muted-foreground">
            <FileText className="h-10 w-10 opacity-50" />
            <div className="space-y-1">
              <p className="font-medium text-foreground">No chord chart synced yet</p>
              <p className="text-sm">Run a Planning Center sync with chord charts enabled for this song.</p>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col space-y-4 px-6 pb-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  {versions.length} version{versions.length === 1 ? "" : "s"}
                </Badge>
                {selectedVersion?.is_primary ? <Badge variant="outline">Primary</Badge> : null}
                {chordChartText ? <Badge variant="outline">Chart</Badge> : null}
                {lyricsText ? <Badge variant="outline">Lyrics</Badge> : null}
              </div>

              <div className="w-full">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-6">
                  <Select value={selectedVersion?.id || ""} onValueChange={setSelectedVersionId}>
                    <SelectTrigger className="h-12 text-base">
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
                  <div className="flex h-12 items-center rounded-md border bg-muted/40 px-4 text-base">
                    <span className="text-muted-foreground">Original: </span>
                    <span className="font-semibold">{keyLabels[originalKeyIndex] || "C"}</span>
                  </div>
                  <Select
                    value={String(targetKeyIndex)}
                    onValueChange={(value) => setTargetKeyIndex(Number(value))}
                    disabled={isEditingRaw}
                  >
                    <SelectTrigger className="h-12 text-base">
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
                  <Select
                    value={accidentalPreference}
                    onValueChange={(value: "sharps" | "flats") => setAccidentalPreference(value)}
                    disabled={isEditingRaw}
                  >
                    <SelectTrigger className="h-12 text-base">
                      <SelectValue placeholder="Accidentals" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="flats">Flats</SelectItem>
                      <SelectItem value="sharps">Sharps</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant={displayMode === "rendered" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setDisplayMode("rendered")}
                    disabled={isEditingRaw}
                    className="h-12 w-full gap-1.5 text-base"
                  >
                    <Eye className="h-4 w-4" />
                    Rendered
                  </Button>
                  <Button
                    type="button"
                    variant={displayMode === "raw" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setDisplayMode("raw")}
                    className="h-12 w-full gap-1.5 text-base"
                  >
                    <Code2 className="h-4 w-4" />
                    Raw
                  </Button>
                </div>
              </div>
            </div>

            <ScrollArea className="min-h-0 flex-1 rounded-md border bg-muted/20">
              <div className="space-y-6 p-4">
                <section className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      Chord Chart
                    </h3>
                    <div className="flex items-center gap-2">
                      {displayMode === "raw" && !isEditingRaw ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
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
                      />
                    ) : (
                      <div className="flex min-h-[220px] items-center justify-center rounded-md border bg-background p-4 text-center text-muted-foreground">
                        <p>No chart text yet. Switch to Raw and add one.</p>
                      </div>
                    )
                  ) : isEditingRaw ? (
                    <Textarea
                      value={rawChartDraft}
                      onChange={(event) => setRawChartDraft(event.target.value)}
                      className="min-h-[420px] resize-y bg-background font-mono text-sm leading-6"
                    />
                  ) : (
                    <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-background p-4 font-mono text-sm leading-6">
                      {rawChordChartText || "No raw chart text yet. Click Edit Raw to add one."}
                    </pre>
                  )}
                </section>

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

              </div>
            </ScrollArea>
          </div>
        )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
