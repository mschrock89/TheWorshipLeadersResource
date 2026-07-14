import { useState, useCallback, useRef } from "react";
import JSZip from "jszip";
import {
  Upload,
  FileAudio,
  Loader2,
  CheckCircle2,
  XCircle,
  Music2,
  AlertCircle,
  FileArchive,
  Sparkles,
  RotateCcw,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  StemType,
  STEM_TYPES,
  STEM_LABELS,
  STEM_COLORS,
  StemSession,
  useCreateStemSession,
  useUpsertStem,
} from "@/hooks/useSetlistStems";
import { matchFilesToStems } from "@/lib/stemMatcher";

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_FILE_BYTES = 200 * 1024 * 1024; // 200 MB per stem

function fileSizeWarning(file: File): string | null {
  if (file.size > MAX_FILE_BYTES) {
    return `${(file.size / 1024 / 1024).toFixed(0)} MB — too large. Use 256–320 kbps MP3.`;
  }
  return null;
}

function extractDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const audio = new Audio();
    const url = URL.createObjectURL(file);
    audio.addEventListener("loadedmetadata", () => { URL.revokeObjectURL(url); resolve(Math.round(audio.duration)); });
    audio.addEventListener("error", () => { URL.revokeObjectURL(url); resolve(null); });
    audio.src = url;
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface StemFileSlot {
  file: File | null;
  duration: number | null;
  status: "idle" | "uploading" | "done" | "error";
  progress: number;
  error?: string;
  autoMatched?: boolean;
}

type SlotsState = Partial<Record<StemType, StemFileSlot>>;

interface StemUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playlistId: string;
  serviceDate: string;
  existingSession: StemSession | null;
  onComplete?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function StemUploadDialog({
  open,
  onOpenChange,
  playlistId,
  serviceDate,
  existingSession,
  onComplete,
}: StemUploadDialogProps) {
  const [slots, setSlots] = useState<SlotsState>({});
  const [activeStemType, setActiveStemType] = useState<StemType | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState<StemType | "zip" | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isExtractingZip, setIsExtractingZip] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [unmatchedFiles, setUnmatchedFiles] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const createSession = useCreateStemSession();
  const upsertStem = useUpsertStem();

  // ── Slot helpers ────────────────────────────────────────────────────────────

  const setSlot = useCallback((stemType: StemType, patch: Partial<StemFileSlot>) => {
    setSlots((prev) => ({
      ...prev,
      [stemType]: { file: null, duration: null, status: "idle", progress: 0, ...prev[stemType], ...patch },
    }));
  }, []);

  // ── Individual file selection ────────────────────────────────────────────────

  const handleFileForStem = useCallback(
    async (stemType: StemType, file: File) => {
      if (!file.type.startsWith("audio/")) {
        toast({ title: "Invalid file", description: "Please upload an audio file (MP3, WAV, etc.).", variant: "destructive" });
        return;
      }
      const sizeErr = fileSizeWarning(file);
      if (sizeErr) {
        setSlot(stemType, { file: null, duration: null, status: "error", progress: 0, error: sizeErr });
        return;
      }
      setSlot(stemType, { status: "idle", progress: 0, error: undefined, file: null, duration: null, autoMatched: false });
      const duration = await extractDuration(file);
      setSlot(stemType, { file, duration });
    },
    [toast, setSlot]
  );

  const handleDropZoneDrop = useCallback(async (stemType: StemType, e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(null);
    const file = e.dataTransfer.files[0];
    if (file) await handleFileForStem(stemType, file);
  }, [handleFileForStem]);

  const openFilePicker = (stemType: StemType) => {
    setActiveStemType(stemType);
    fileInputRef.current?.click();
  };

  const handleFilePickerChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && activeStemType) await handleFileForStem(activeStemType, file);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setActiveStemType(null);
  };

  // ── ZIP extraction ───────────────────────────────────────────────────────────

  const processZip = useCallback(async (zipFile: File) => {
    setIsExtractingZip(true);
    setUnmatchedFiles([]);

    try {
      const zip = await JSZip.loadAsync(zipFile);
      const extractedFiles: File[] = [];

      // Extract all audio files from the ZIP in parallel
      const audioEntries = Object.entries(zip.files).filter(([name, entry]) =>
        !entry.dir &&
        !name.startsWith("__MACOSX") &&
        !name.split("/").pop()?.startsWith(".") &&
        /\.(mp3|wav|aif|aiff|ogg|m4a|flac|aac)$/i.test(name)
      );

      await Promise.all(
        audioEntries.map(async ([name, entry]) => {
          const blob = await entry.async("blob");
          const basename = name.split("/").pop() ?? name;
          const ext = basename.split(".").pop()?.toLowerCase() ?? "mp3";
          const mimeMap: Record<string, string> = {
            mp3: "audio/mpeg", wav: "audio/wav",
            aif: "audio/aiff", aiff: "audio/aiff",
            ogg: "audio/ogg", m4a: "audio/mp4",
            flac: "audio/flac", aac: "audio/aac",
          };
          const file = new File([blob], basename, { type: mimeMap[ext] ?? "audio/mpeg" });
          extractedFiles.push(file);
        })
      );

      if (extractedFiles.length === 0) {
        toast({ title: "No audio files found", description: "The ZIP didn't contain any audio files.", variant: "destructive" });
        return;
      }

      // Match to stem slots
      const { matched, unmatched } = matchFilesToStems(extractedFiles);

      if (matched.length === 0) {
        toast({
          title: "No stems matched",
          description: "Couldn't auto-match any files. Try renaming them to match stem names (e.g. Drums.mp3, Bass.mp3).",
          variant: "destructive",
        });
        return;
      }

      // Populate matched slots
      await Promise.all(
        matched.map(async (match) => {
          const sizeErr = fileSizeWarning(match.file);
          if (sizeErr) {
            setSlot(match.stemType, { file: null, duration: null, status: "error", error: sizeErr, autoMatched: true });
            return;
          }
          const duration = await extractDuration(match.file);
          setSlot(match.stemType, {
            file: match.file,
            duration,
            status: "idle",
            progress: 0,
            error: undefined,
            autoMatched: true,
          });
        })
      );

      if (unmatched.length > 0) {
        setUnmatchedFiles(unmatched.map((f) => f.name));
      }

      toast({
        title: `Auto-matched ${matched.length} stem${matched.length !== 1 ? "s" : ""}`,
        description: unmatched.length > 0
          ? `${unmatched.length} file${unmatched.length !== 1 ? "s" : ""} couldn't be matched — assign them manually below.`
          : "All files matched successfully!",
      });
    } catch (err) {
      console.error("ZIP extraction failed:", err);
      toast({ title: "ZIP extraction failed", description: "The file may be corrupted or not a valid ZIP.", variant: "destructive" });
    } finally {
      setIsExtractingZip(false);
    }
  }, [toast, setSlot]);

  const handleZipDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(null);
    const file = e.dataTransfer.files[0];
    if (file?.name.toLowerCase().endsWith(".zip")) {
      await processZip(file);
    } else if (file) {
      toast({ title: "Drop a ZIP file here", description: "Individual audio files go in the slots below.", variant: "destructive" });
    }
  }, [processZip, toast]);

  const handleZipInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await processZip(file);
    if (zipInputRef.current) zipInputRef.current.value = "";
  };

  // ── Upload ───────────────────────────────────────────────────────────────────

  const selectedCount = STEM_TYPES.filter((t) => slots[t]?.file).length;
  const failedCount = STEM_TYPES.filter((t) => slots[t]?.status === "error" && !slots[t]?.file).length;
  const doneCount = STEM_TYPES.filter((t) => slots[t]?.status === "done").length;

  const handleUploadAll = async () => {
    if (!user || selectedCount === 0) return;
    setIsUploading(true);
    setSessionError(null);

    // Reset previous errors so user can retry
    setSlots((prev) => {
      const next = { ...prev };
      for (const t of STEM_TYPES) {
        if (next[t]?.status === "error" && next[t]?.file) {
          next[t] = { ...next[t]!, status: "idle", progress: 0, error: undefined };
        }
      }
      return next;
    });

    let sessionId: string | undefined;
    try {
      sessionId = existingSession?.id;
      if (!sessionId) {
        const newSession = await createSession.mutateAsync({ playlistId });
        sessionId = newSession.id;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create stem session";
      setSessionError(message);
      setIsUploading(false);
      return;
    }

    const stemTypesToUpload = STEM_TYPES.filter((t) => slots[t]?.file);
    let successCount = 0;
    let firstError: string | null = null;

    for (const stemType of stemTypesToUpload) {
      const slot = slots[stemType]!;
      if (!slot.file) continue;

      setSlot(stemType, { status: "uploading", progress: 10 });

      const interval = setInterval(() => {
        setSlots((prev) => {
          const current = prev[stemType];
          if (!current || current.status !== "uploading") return prev;
          return { ...prev, [stemType]: { ...current, progress: Math.min((current.progress ?? 10) + 12, 88) } };
        });
      }, 250);

      try {
        const ext = slot.file.name.split(".").pop() ?? "mp3";
        const fileName = `${sessionId}-${stemType}-${Date.now()}.${ext}`;
        const filePath = `stems/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("song-audio")
          .upload(filePath, slot.file, { cacheControl: "3600", upsert: false });

        clearInterval(interval);
        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from("song-audio").getPublicUrl(filePath);

        await upsertStem.mutateAsync({
          sessionId,
          playlistId,
          stemType,
          audioUrl: urlData.publicUrl,
          fileName: slot.file.name,
          durationSeconds: slot.duration,
        });

        setSlot(stemType, { status: "done", progress: 100 });
        successCount++;
      } catch (err: unknown) {
        clearInterval(interval);
        const message = err instanceof Error ? err.message : "Upload failed";
        setSlot(stemType, { status: "error", progress: 0, error: message });
        if (!firstError) firstError = message;
        console.error(`Failed to upload ${stemType}:`, err);
      }
    }

    setIsUploading(false);

    const newFailCount = stemTypesToUpload.length - successCount;

    if (successCount > 0 && newFailCount === 0) {
      toast({ title: `${successCount} stem${successCount !== 1 ? "s" : ""} uploaded` });
      onComplete?.();
      setTimeout(() => { onOpenChange(false); setSlots({}); setUnmatchedFiles([]); }, 600);
    } else if (successCount > 0) {
      toast({ title: `${successCount} uploaded, ${newFailCount} failed`, description: "Check the highlighted stems.", variant: "destructive" });
      onComplete?.();
    } else {
      toast({ title: "Upload failed", description: firstError ?? "All stems failed. Check your connection and try again.", variant: "destructive" });
    }
  };

  const reset = () => { setSlots({}); setSessionError(null); setUnmatchedFiles([]); };
  const autoMatchedCount = STEM_TYPES.filter((t) => slots[t]?.autoMatched && slots[t]?.file).length;

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Music2 className="h-5 w-5 text-primary" />
            Upload Stems
          </DialogTitle>
          <DialogDescription>
            Drop a ZIP containing your stems and we'll auto-match them — or upload MP3s individually below. Max 200 MB per stem.
          </DialogDescription>
        </DialogHeader>

        {/* Hidden inputs */}
        <input ref={fileInputRef} type="file" accept="audio/mpeg,audio/mp3,audio/wav,audio/aiff,audio/x-aiff,audio/ogg,audio/*" className="hidden" onChange={handleFilePickerChange} />
        <input ref={zipInputRef} type="file" accept=".zip,application/zip" className="hidden" onChange={handleZipInputChange} />

        {/* ZIP drop zone */}
        <div
          className={cn(
            "relative flex flex-col items-center justify-center gap-2 p-5 rounded-xl border-2 border-dashed transition-all cursor-pointer",
            isDraggingOver === "zip"
              ? "border-primary bg-primary/10"
              : "border-border/50 hover:border-primary/40 hover:bg-muted/20"
          )}
          onClick={() => zipInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDraggingOver("zip"); }}
          onDragLeave={() => setIsDraggingOver(null)}
          onDrop={handleZipDrop}
        >
          {isExtractingZip ? (
            <>
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
              <p className="text-sm font-medium">Extracting ZIP…</p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <FileArchive className="h-8 w-8 text-primary/70" />
                <div className="text-left">
                  <p className="text-sm font-semibold">Drop your ZIP file here</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Stems are auto-matched by filename — e.g. <span className="font-mono">Drums.mp3</span>, <span className="font-mono">Bass.mp3</span>, <span className="font-mono">Keys.mp3</span>
                  </p>
                </div>
              </div>
              {autoMatchedCount > 0 && (
                <div className="flex items-center gap-1.5 mt-1">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs text-primary font-medium">{autoMatchedCount} stems auto-matched</span>
                  <button
                    className="ml-2 text-xs text-muted-foreground hover:text-foreground underline"
                    onClick={(e) => { e.stopPropagation(); reset(); }}
                  >
                    Clear
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Unmatched files warning */}
        {unmatchedFiles.length > 0 && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs">
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium mb-0.5">Couldn't auto-match {unmatchedFiles.length} file{unmatchedFiles.length !== 1 ? "s" : ""}:</p>
              <p className="font-mono opacity-80">{unmatchedFiles.join(", ")}</p>
              <p className="mt-1 opacity-70">Rename them to match a stem name, or manually assign below.</p>
            </div>
          </div>
        )}

        <div className="relative flex items-center gap-3">
          <div className="flex-1 border-t border-border/30" />
          <span className="text-xs text-muted-foreground">or upload individually</span>
          <div className="flex-1 border-t border-border/30" />
        </div>

        {/* Session-level error */}
        {sessionError && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm">
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Failed to create session</p>
              <p className="text-xs mt-0.5 opacity-80">{sessionError}</p>
            </div>
          </div>
        )}

        {/* Stem grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {STEM_TYPES.map((stemType) => {
            const color = STEM_COLORS[stemType];
            const label = STEM_LABELS[stemType];
            const slot = slots[stemType];
            const file = slot?.file;
            const status = slot?.status ?? "idle";
            const isDragging = isDraggingOver === stemType;
            const isErrored = status === "error" && !file;
            const isDone = status === "done";
            const hasExisting = existingSession?.stems.some((s) => s.stem_type === stemType);
            const isAutoMatched = slot?.autoMatched && file;

            return (
              <div
                key={stemType}
                className={cn(
                  "relative flex flex-col gap-1.5 p-3 rounded-lg border-2 transition-all cursor-pointer group",
                  isDragging      ? "border-primary bg-primary/10" :
                  isErrored       ? "border-destructive/60 bg-destructive/5" :
                  isDone          ? "border-green-500/40 bg-green-500/5" :
                  isAutoMatched   ? "border-primary/40 bg-primary/5" :
                  file            ? "border-border bg-muted/30" :
                                    "border-dashed border-border/50 hover:border-primary/40 hover:bg-muted/20"
                )}
                onClick={() => !isUploading && openFilePicker(stemType)}
                onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(stemType); }}
                onDragLeave={() => setIsDraggingOver(null)}
                onDrop={(e) => !isUploading && handleDropZoneDrop(stemType, e)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold">{label}</span>
                      {isAutoMatched && (
                        <Badge className="text-[9px] px-1 py-0 h-4 bg-primary/20 text-primary border-0 gap-0.5">
                          <Sparkles className="h-2.5 w-2.5" />
                          Auto
                        </Badge>
                      )}
                      {hasExisting && !file && status !== "done" && (
                        <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">Uploaded</Badge>
                      )}
                    </div>
                    {file ? (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{file.name}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {isDragging ? "Drop MP3 here" : "Click or drag MP3 here"}
                      </p>
                    )}
                  </div>

                  <div className="flex-shrink-0">
                    {status === "uploading" ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> :
                     isDone           ? <CheckCircle2 className="h-4 w-4 text-green-500" /> :
                     isErrored        ? <XCircle className="h-4 w-4 text-destructive" /> :
                     file             ? <FileAudio className="h-4 w-4 text-primary" /> :
                                        <Upload className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />}
                  </div>
                </div>

                {status === "uploading" && <Progress value={slot?.progress} className="h-1" />}

                {slot?.error && (
                  <p className={cn("text-[11px] leading-tight px-0.5", isErrored ? "text-destructive" : "text-amber-400")}>
                    {slot.error}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Failure summary */}
        {failedCount > 0 && !isUploading && (
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>
              {failedCount} stem{failedCount !== 1 ? "s" : ""} failed.
              {doneCount > 0 && ` ${doneCount} uploaded successfully.`}
              {" "}Click failed slots to re-select files.
            </span>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isUploading} className="flex-1">
            {doneCount > 0 && failedCount === 0 ? "Close" : "Cancel"}
          </Button>
          <Button onClick={handleUploadAll} disabled={selectedCount === 0 || isUploading} className="flex-1 gap-2">
            {isUploading ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Uploading…</>
            ) : failedCount > 0 ? (
              <><RotateCcw className="h-4 w-4" />Retry {failedCount} Failed</>
            ) : (
              <><Upload className="h-4 w-4" />Upload {selectedCount > 0 ? `${selectedCount} Stem${selectedCount !== 1 ? "s" : ""}` : "Stems"}</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
