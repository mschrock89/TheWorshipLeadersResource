import { useState, useCallback } from "react";
import { Upload, FileAudio, Check, X, Loader2, Archive } from "lucide-react";
import JSZip from "jszip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface FileToUpload {
  file: File;
  filename: string;
  title: string;
  status: "pending" | "uploading" | "success" | "error";
  errorMessage?: string;
}

interface BulkAudioUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  albumId: string;
  currentTrackCount: number;
}

function extractTitleFromFilename(filename: string): string {
  return filename
    // Remove file extension
    .replace(/\.(mp3|m4a|wav|flac|aac|ogg)$/i, "")
    // Remove track number prefixes like "01 - ", "1. ", "01_", "(1)", "[01]"
    .replace(/^[\[\(]?\d{1,3}[\]\)]?[\s.\-_]+/, "")
    // Remove common suffixes like "(Official Audio)", "[Radio Edit]", etc.
    .replace(/[\[\(](official|radio|edit|remix|live|acoustic|version|audio|video|lyrics?)[\]\)]/gi, "")
    // Clean up extra whitespace
    .trim();
}

export function BulkAudioUploadDialog({
  open,
  onOpenChange,
  albumId,
  currentTrackCount,
}: BulkAudioUploadDialogProps) {
  const [files, setFiles] = useState<FileToUpload[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const queryClient = useQueryClient();

  const processFiles = useCallback(async (inputFiles: FileList | File[]) => {
    setIsProcessing(true);
    const newFiles: FileToUpload[] = [];
    
    // Dedupe by filename+size
    const makeKey = (name: string, size?: number) => `${name.toLowerCase()}::${size ?? 0}`;
    const existingKeys = new Set(files.map(f => makeKey(f.filename, f.file.size)));
    
    for (const file of Array.from(inputFiles)) {
      if (file.name.toLowerCase().endsWith(".zip")) {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const zip = await JSZip.loadAsync(arrayBuffer);
          
          for (const [path, zipEntry] of Object.entries(zip.files)) {
            const lowerPath = path.toLowerCase();
            // Skip macOS hidden files
            if (path.startsWith("__MACOSX") || path.includes("/._") || path.startsWith("._")) {
              continue;
            }
            if (!zipEntry.dir && (lowerPath.endsWith(".mp3") || lowerPath.endsWith(".m4a") || lowerPath.endsWith(".wav"))) {
              const blob = await zipEntry.async("blob");
              const filename = path.split("/").pop() || path;
              const mimeType = lowerPath.endsWith(".mp3") ? "audio/mpeg" : 
                               lowerPath.endsWith(".m4a") ? "audio/mp4" : "audio/wav";
              const audioFile = new File([blob], filename, { type: mimeType });
              
              const key = makeKey(filename, audioFile.size);
              if (!existingKeys.has(key)) {
                existingKeys.add(key);
                newFiles.push({
                  file: audioFile,
                  filename,
                  title: extractTitleFromFilename(filename),
                  status: "pending",
                });
              }
            }
          }
          
          if (newFiles.length === 0) {
            toast.error(`No audio files found in ZIP: ${file.name}`);
          }
        } catch (error) {
          console.error("ZIP extraction error:", error);
          toast.error(`Failed to extract ZIP file: ${file.name}`);
        }
      } else if (/\.(mp3|m4a|wav)$/i.test(file.name)) {
        const key = makeKey(file.name, file.size);
        if (existingKeys.has(key)) continue;
        existingKeys.add(key);
        
        newFiles.push({
          file,
          filename: file.name,
          title: extractTitleFromFilename(file.name),
          status: "pending",
        });
      }
    }
    
    setFiles(prev => [...prev, ...newFiles]);
    setIsProcessing(false);
  }, [files]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  }, [processFiles]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
  }, [processFiles]);

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const pendingFiles = files.filter(f => f.status === "pending");
  
  const handleUpload = async () => {
    if (pendingFiles.length === 0) return;
    
    setIsUploading(true);
    setUploadProgress(0);
    
    let completed = 0;
    const total = pendingFiles.length;
    let trackNumber = currentTrackCount;
    
    for (let i = 0; i < files.length; i++) {
      const fileToUpload = files[i];
      if (fileToUpload.status !== "pending") continue;
      
      setFiles(prev => prev.map((f, idx) => 
        idx === i ? { ...f, status: "uploading" } : f
      ));
      
      try {
        // Generate unique filename for storage
        const fileExt = fileToUpload.file.name.split(".").pop();
        const uniqueId = crypto.randomUUID();
        const storagePath = `${albumId}/${uniqueId}.${fileExt}`;
        
        // Upload to storage
        const { error: uploadError } = await supabase.storage
          .from("song-audio")
          .upload(storagePath, fileToUpload.file, { upsert: true });
        
        if (uploadError) throw uploadError;
        
        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from("song-audio")
          .getPublicUrl(storagePath);
        
        // Create album track (standalone, no song_id)
        trackNumber++;
        const { error: insertError } = await supabase
          .from("album_tracks")
          .insert({
            album_id: albumId,
            title: fileToUpload.title,
            author: "Experience Music",
            audio_url: publicUrl,
            track_number: trackNumber,
          });
        
        if (insertError) throw insertError;
        
        setFiles(prev => prev.map((f, idx) => 
          idx === i ? { ...f, status: "success" } : f
        ));
        
        completed++;
        setUploadProgress((completed / total) * 100);
      } catch (error) {
        console.error("Upload error:", error);
        setFiles(prev => prev.map((f, idx) => 
          idx === i ? { ...f, status: "error", errorMessage: String(error) } : f
        ));
      }
    }
    
    await queryClient.invalidateQueries({ queryKey: ["albums"] });
    await queryClient.invalidateQueries({ queryKey: ["album", albumId] });
    
    setIsUploading(false);
    
    const successCount = files.filter(f => f.status === "success").length;
    if (successCount > 0) {
      toast.success(`Uploaded ${successCount} track${successCount > 1 ? "s" : ""}`);
    }
    
    setTimeout(() => {
      onOpenChange(false);
      setFiles([]);
      setUploadProgress(0);
    }, 1500);
  };

  const handleClose = () => {
    if (!isUploading) {
      onOpenChange(false);
      setFiles([]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Bulk Upload Audio</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          {/* Drop Zone */}
          <div
            className={`
              border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer flex-shrink-0
              ${isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"}
              ${isProcessing ? "opacity-50 pointer-events-none" : ""}
            `}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => document.getElementById("bulk-audio-input")?.click()}
          >
            <input
              id="bulk-audio-input"
              type="file"
              accept=".mp3,.m4a,.wav,.zip"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
            {isProcessing ? (
              <>
                <Loader2 className="h-10 w-10 mx-auto text-muted-foreground mb-3 animate-spin" />
                <p className="text-sm text-muted-foreground">Processing files...</p>
              </>
            ) : (
              <>
                <div className="flex justify-center gap-2 mb-3">
                  <FileAudio className="h-8 w-8 text-muted-foreground" />
                  <Archive className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="font-medium text-foreground">Drop MP3 or ZIP files here</p>
                <p className="text-sm text-muted-foreground mt-1">or click to browse</p>
              </>
            )}
          </div>

          {/* Upload Progress */}
          {isUploading && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Uploading...</span>
                <span className="font-medium">{Math.round(uploadProgress)}%</span>
              </div>
              <Progress value={uploadProgress} />
            </div>
          )}

          {/* File List */}
          {files.length > 0 && (
            <div className="space-y-2 flex-1 overflow-hidden flex flex-col min-h-0">
              <p className="text-sm font-medium flex-shrink-0">
                Tracks to Upload ({pendingFiles.length})
              </p>
              <ScrollArea className="flex-1 border rounded-lg min-h-0">
                <div className="p-2 space-y-1">
                  {files.map((fileItem, index) => (
                    <div
                      key={index}
                      className={`
                        flex items-center gap-2 p-2 rounded-md text-sm
                        ${fileItem.status === "success" ? "bg-green-500/10" : ""}
                        ${fileItem.status === "error" ? "bg-destructive/10" : ""}
                      `}
                    >
                      {/* Status Icon */}
                      <div className="flex-shrink-0">
                        {fileItem.status === "uploading" && (
                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        )}
                        {fileItem.status === "success" && (
                          <Check className="h-4 w-4 text-green-500" />
                        )}
                        {fileItem.status === "error" && (
                          <X className="h-4 w-4 text-destructive" />
                        )}
                        {fileItem.status === "pending" && (
                          <FileAudio className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      
                      {/* File Info */}
                      <div className="flex-1 min-w-0">
                        <p className="truncate font-medium text-sm">{fileItem.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{fileItem.filename}</p>
                      </div>
                      
                      {/* Remove Button */}
                      {fileItem.status === "pending" && !isUploading && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 flex-shrink-0"
                          onClick={() => removeFile(index)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose} disabled={isUploading}>
            Cancel
          </Button>
          <Button 
            onClick={handleUpload} 
            disabled={pendingFiles.length === 0 || isUploading}
            className="gap-2"
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Upload {pendingFiles.length} Track{pendingFiles.length !== 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
