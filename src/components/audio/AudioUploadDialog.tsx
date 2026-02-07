import { useState, useCallback } from "react";
import { Upload, Music, Loader2, X, CheckCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

interface AudioUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  songId: string;
  songTitle: string;
  existingAudioUrl?: string | null;
}

export function AudioUploadDialog({
  open,
  onOpenChange,
  songId,
  songTitle,
  existingAudioUrl,
}: AudioUploadDialogProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file && file.type === "audio/mpeg") {
      setSelectedFile(file);
    } else {
      toast({
        title: "Invalid file type",
        description: "Please upload an MP3 file.",
        variant: "destructive",
      });
    }
  }, [toast]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === "audio/mpeg") {
      setSelectedFile(file);
    } else if (file) {
      toast({
        title: "Invalid file type",
        description: "Please upload an MP3 file.",
        variant: "destructive",
      });
    }
  }, [toast]);

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    setProgress(0);

    try {
      // Generate unique filename
      const fileExt = selectedFile.name.split(".").pop();
      const fileName = `${songId}-${Date.now()}.${fileExt}`;
      const filePath = `songs/${fileName}`;

      // Simulate progress for better UX
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 10, 90));
      }, 200);

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("song-audio")
        .upload(filePath, selectedFile, {
          cacheControl: "3600",
          upsert: true,
        });

      clearInterval(progressInterval);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("song-audio")
        .getPublicUrl(filePath);

      // Update song record with audio URL
      const { error: updateError } = await supabase
        .from("songs")
        .update({ audio_url: urlData.publicUrl })
        .eq("id", songId);

      if (updateError) throw updateError;

      setProgress(100);

      toast({
        title: "Upload successful",
        description: `Audio uploaded for "${songTitle}"`,
      });

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["songs"] });
      queryClient.invalidateQueries({ queryKey: ["setlist-playlist"] });
      queryClient.invalidateQueries({ queryKey: ["setlist-songs-audio-status"] });

      setTimeout(() => {
        onOpenChange(false);
        setSelectedFile(null);
        setProgress(0);
      }, 500);
    } catch (error: any) {
      console.error("Upload error:", error);
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload audio file.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveAudio = async () => {
    if (!existingAudioUrl) return;

    setUploading(true);

    try {
      // Extract file path from URL
      const url = new URL(existingAudioUrl);
      const pathParts = url.pathname.split("/");
      const filePath = pathParts.slice(pathParts.indexOf("song-audio") + 1).join("/");

      // Delete from storage
      if (filePath) {
        await supabase.storage.from("song-audio").remove([filePath]);
      }

      // Update song record
      const { error } = await supabase
        .from("songs")
        .update({ audio_url: null })
        .eq("id", songId);

      if (error) throw error;

      toast({
        title: "Audio removed",
        description: `Audio removed from "${songTitle}"`,
      });

      queryClient.invalidateQueries({ queryKey: ["songs"] });
      queryClient.invalidateQueries({ queryKey: ["setlist-playlist"] });
      queryClient.invalidateQueries({ queryKey: ["setlist-songs-audio-status"] });

      onOpenChange(false);
    } catch (error: any) {
      console.error("Remove error:", error);
      toast({
        title: "Remove failed",
        description: error.message || "Failed to remove audio file.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Music className="h-5 w-5 text-primary" />
            Upload Audio
          </DialogTitle>
          <DialogDescription>
            Upload an MP3 file for "{songTitle}"
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {existingAudioUrl && (
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-sm">Audio file uploaded</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRemoveAudio}
                disabled={uploading}
                className="text-destructive hover:text-destructive"
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <X className="h-4 w-4" />
                )}
              </Button>
            </div>
          )}

          {/* Drop Zone */}
          <div
            className={`
              relative border-2 border-dashed rounded-lg p-8 text-center transition-colors
              ${isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}
              ${uploading ? "pointer-events-none opacity-50" : "cursor-pointer"}
            `}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => document.getElementById("audio-file-input")?.click()}
          >
            <input
              id="audio-file-input"
              type="file"
              accept="audio/mpeg"
              className="hidden"
              onChange={handleFileSelect}
              disabled={uploading}
            />

            <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm font-medium">
              {selectedFile ? selectedFile.name : "Drop MP3 file here or click to browse"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Maximum file size: 50MB
            </p>
          </div>

          {/* Upload Progress */}
          {uploading && (
            <div className="space-y-2">
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">
                {progress < 100 ? "Uploading..." : "Complete!"}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={uploading}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!selectedFile || uploading}
              className="flex-1"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
