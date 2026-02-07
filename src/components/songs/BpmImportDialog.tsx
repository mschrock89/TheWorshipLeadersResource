import { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Upload, FileSpreadsheet, Check, X, AlertCircle, Loader2 } from "lucide-react";
import { useSongs, useUpdateSongBpm } from "@/hooks/useSongs";
import { useToast } from "@/hooks/use-toast";
import Papa from "papaparse";

interface BpmImportDialogProps {
  trigger?: React.ReactNode;
}

interface ParsedRow {
  title: string;
  bpm: number | null;
  matchedSongId: string | null;
  matchedTitle: string | null;
  status: "matched" | "not-found" | "invalid-bpm";
}

export function BpmImportDialog({ trigger }: BpmImportDialogProps) {
  const [open, setOpen] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedRow[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { data: songs } = useSongs();
  const updateBpm = useUpdateSongBpm();
  const { toast } = useToast();

  // Normalize title for matching (lowercase, remove special chars, trim)
  const normalizeTitle = (title: string): string => {
    return title
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  };

  // Find best match for a title
  const findMatchingSong = (title: string) => {
    if (!songs) return null;
    
    const normalizedInput = normalizeTitle(title);
    
    // Exact match first
    const exactMatch = songs.find(
      (s) => normalizeTitle(s.title) === normalizedInput
    );
    if (exactMatch) return exactMatch;
    
    // Partial match (input contains song title or vice versa)
    const partialMatch = songs.find((s) => {
      const normalizedSong = normalizeTitle(s.title);
      return (
        normalizedInput.includes(normalizedSong) ||
        normalizedSong.includes(normalizedInput)
      );
    });
    
    return partialMatch || null;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows: ParsedRow[] = [];
        
        for (const row of results.data as Record<string, string>[]) {
          // Try to find title column (case-insensitive)
          const titleKey = Object.keys(row).find((k) => {
            const lower = k.toLowerCase();
            return lower === "title" || lower === "song" || lower.includes("song title");
          });
          
          // Try to find BPM column - prioritize "Arrangement 1 BPM" for Planning Center exports
          const bpmKey = Object.keys(row).find((k) => {
            const lower = k.toLowerCase();
            return lower === "arrangement 1 bpm" || lower === "bpm" || lower === "tempo";
          }) || Object.keys(row).find((k) => 
            k.toLowerCase().includes("bpm") || k.toLowerCase().includes("tempo")
          );

          if (!titleKey) continue;

          const title = row[titleKey]?.trim();
          if (!title) continue;

          const bpmValue = bpmKey ? parseFloat(row[bpmKey]) : null;
          const bpm = bpmValue && !isNaN(bpmValue) && bpmValue > 0 ? bpmValue : null;

          const matchedSong = findMatchingSong(title);

          rows.push({
            title,
            bpm,
            matchedSongId: matchedSong?.id || null,
            matchedTitle: matchedSong?.title || null,
            status: !bpm ? "invalid-bpm" : matchedSong ? "matched" : "not-found",
          });
        }

        setParsedData(rows);
      },
      error: (error) => {
        toast({
          title: "Error parsing CSV",
          description: error.message,
          variant: "destructive",
        });
      },
    });
  };

  const handleImport = async () => {
    const toImport = parsedData.filter(
      (r) => r.status === "matched" && r.matchedSongId && r.bpm
    );

    if (toImport.length === 0) {
      toast({
        title: "No songs to import",
        description: "No matched songs with valid BPM values found.",
        variant: "destructive",
      });
      return;
    }

    setIsImporting(true);

    let successCount = 0;
    let errorCount = 0;

    for (const row of toImport) {
      try {
        await updateBpm.mutateAsync({
          songId: row.matchedSongId!,
          bpm: row.bpm!,
        });
        successCount++;
      } catch {
        errorCount++;
      }
    }

    setIsImporting(false);

    toast({
      title: "BPM Import Complete",
      description: `Updated ${successCount} songs${errorCount > 0 ? `, ${errorCount} failed` : ""}.`,
    });

    if (successCount > 0) {
      setOpen(false);
      setParsedData([]);
      setFileName(null);
    }
  };

  const matchedCount = parsedData.filter((r) => r.status === "matched").length;
  const notFoundCount = parsedData.filter((r) => r.status === "not-found").length;
  const invalidBpmCount = parsedData.filter((r) => r.status === "invalid-bpm").length;

  return (
    <Dialog open={open} onOpenChange={(o) => {
      setOpen(o);
      if (!o) {
        setParsedData([]);
        setFileName(null);
      }
    }}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-2">
            <Upload className="h-4 w-4" />
            Import BPM
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Import BPM from CSV</DialogTitle>
          <DialogDescription>
            Upload a CSV file with song titles and BPM values. The system will match songs by title.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 min-h-0 flex flex-col">
          {/* File Upload */}
          <div className="flex flex-col gap-3">
            <Input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              className="hidden"
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="gap-2"
            >
              <FileSpreadsheet className="h-4 w-4" />
              {fileName || "Choose CSV File"}
            </Button>
            <p className="text-xs text-muted-foreground">
              CSV should have columns for song title and BPM (e.g., "Title", "BPM" or "Song", "Tempo")
            </p>
          </div>

          {/* Results Summary */}
          {parsedData.length > 0 && (
            <>
              <div className="flex gap-2 flex-wrap">
                <Badge variant="default" className="gap-1">
                  <Check className="h-3 w-3" />
                  {matchedCount} matched
                </Badge>
                {notFoundCount > 0 && (
                  <Badge variant="secondary" className="gap-1">
                    <X className="h-3 w-3" />
                    {notFoundCount} not found
                  </Badge>
                )}
                {invalidBpmCount > 0 && (
                  <Badge variant="outline" className="gap-1 text-yellow-600">
                    <AlertCircle className="h-3 w-3" />
                    {invalidBpmCount} invalid BPM
                  </Badge>
                )}
              </div>

              {/* Parsed Data List */}
              <ScrollArea className="flex-1 border rounded-md">
                <div className="p-2 space-y-1">
                  {parsedData.map((row, idx) => (
                    <div
                      key={idx}
                      className={`flex items-center justify-between p-2 rounded text-sm ${
                        row.status === "matched"
                          ? "bg-green-500/10"
                          : row.status === "not-found"
                          ? "bg-red-500/10"
                          : "bg-yellow-500/10"
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{row.title}</p>
                        {row.matchedTitle && row.matchedTitle !== row.title && (
                          <p className="text-xs text-muted-foreground truncate">
                            → {row.matchedTitle}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-muted-foreground">
                          {row.bpm ? `${row.bpm} BPM` : "No BPM"}
                        </span>
                        {row.status === "matched" && (
                          <Check className="h-4 w-4 text-green-600" />
                        )}
                        {row.status === "not-found" && (
                          <X className="h-4 w-4 text-red-500" />
                        )}
                        {row.status === "invalid-bpm" && (
                          <AlertCircle className="h-4 w-4 text-yellow-600" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleImport}
              disabled={matchedCount === 0 || isImporting}
            >
              {isImporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Importing...
                </>
              ) : (
                `Import ${matchedCount} Songs`
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
