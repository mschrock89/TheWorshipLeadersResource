import { useState, useCallback } from "react";
import { Upload, FileAudio, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { ReferenceTrackMarkerInput, MarkerInput, markersToDbFormat, SetlistSong } from "./ReferenceTrackMarkerInput";

interface ReferenceTrackUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playlistId: string;
  serviceDate: string;
  setlistSongs: SetlistSong[];
}

export function ReferenceTrackUploadDialog({
  open,
  onOpenChange,
  playlistId,
  serviceDate,
  setlistSongs,
}: ReferenceTrackUploadDialogProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [audioDuration, setAudioDuration] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [markers, setMarkers] = useState<MarkerInput[]>([]);
  const [markersOpen, setMarkersOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Extract audio duration from file
  const extractAudioDuration = useCallback((file: File): Promise<number> => {
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      const objectUrl = URL.createObjectURL(file);
      
      audio.addEventListener('loadedmetadata', () => {
        const duration = Math.round(audio.duration);
        URL.revokeObjectURL(objectUrl);
        resolve(duration);
      });
      
      audio.addEventListener('error', () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Failed to load audio metadata'));
      });
      
      audio.src = objectUrl;
    });
  }, []);

  const resetForm = () => {
    setSelectedFile(null);
    setAudioDuration(null);
    setTitle("");
    setProgress(0);
    setMarkers([]);
    setMarkersOpen(false);
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file && file.type === "audio/mpeg") {
      setSelectedFile(file);
      // Extract audio duration
      try {
        const duration = await extractAudioDuration(file);
        setAudioDuration(duration);
      } catch (err) {
        console.warn("Could not extract audio duration:", err);
        setAudioDuration(null);
      }
      // Auto-fill title from filename if empty
      if (!title) {
        const nameWithoutExt = file.name.replace(/\.mp3$/i, "");
        setTitle(nameWithoutExt);
      }
    } else {
      toast({
        title: "Invalid file type",
        description: "Please upload an MP3 file.",
        variant: "destructive",
      });
    }
  }, [toast, title, extractAudioDuration]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === "audio/mpeg") {
      setSelectedFile(file);
      // Extract audio duration
      try {
        const duration = await extractAudioDuration(file);
        setAudioDuration(duration);
      } catch (err) {
        console.warn("Could not extract audio duration:", err);
        setAudioDuration(null);
      }
      // Auto-fill title from filename if empty
      if (!title) {
        const nameWithoutExt = file.name.replace(/\.mp3$/i, "");
        setTitle(nameWithoutExt);
      }
    } else if (file) {
      toast({
        title: "Invalid file type",
        description: "Please upload an MP3 file.",
        variant: "destructive",
      });
    }
  }, [toast, title, extractAudioDuration]);

  const handleUpload = async () => {
    if (!selectedFile || !title.trim() || !user) return;

    setUploading(true);
    setProgress(0);

    try {
      // Generate unique filename
      const fileExt = selectedFile.name.split(".").pop();
      const fileName = `${playlistId}-${Date.now()}.${fileExt}`;
      const filePath = `reference-tracks/${fileName}`;

      // Simulate progress for better UX
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 10, 90));
      }, 200);

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("song-audio")
        .upload(filePath, selectedFile, {
          cacheControl: "3600",
          upsert: false,
        });

      clearInterval(progressInterval);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("song-audio")
        .getPublicUrl(filePath);

      // Get current max sequence order for this playlist
      const { data: existingTracks } = await supabase
        .from("setlist_playlist_reference_tracks")
        .select("sequence_order")
        .eq("playlist_id", playlistId)
        .order("sequence_order", { ascending: false })
        .limit(1);

      const nextOrder = (existingTracks?.[0]?.sequence_order ?? -1) + 1;

      // Create database record with duration
      const { data: insertedTrack, error: insertError } = await supabase
        .from("setlist_playlist_reference_tracks")
        .insert({
          playlist_id: playlistId,
          title: title.trim(),
          audio_url: urlData.publicUrl,
          sequence_order: nextOrder,
          created_by: user.id,
          duration_seconds: audioDuration,
        })
        .select("id")
        .single();

      if (insertError) throw insertError;

      // Save markers if any
      const dbMarkers = markersToDbFormat(markers);
      if (dbMarkers.length > 0 && insertedTrack) {
        const { error: markersError } = await supabase
          .from("reference_track_markers")
          .insert(
            dbMarkers.map((m) => ({
              reference_track_id: insertedTrack.id,
              title: m.title,
              timestamp_seconds: m.timestamp_seconds,
              sequence_order: m.sequence_order,
            }))
          );

        if (markersError) {
          console.warn("Failed to save markers:", markersError);
        }
      }

      setProgress(100);

      toast({
        title: "Reference track uploaded",
        description: `"${title.trim()}" added with ${dbMarkers.length} marker${dbMarkers.length !== 1 ? 's' : ''}`,
      });

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["setlist-playlists"] });

      setTimeout(() => {
        onOpenChange(false);
        resetForm();
      }, 500);
    } catch (error: any) {
      console.error("Upload error:", error);
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload reference track.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      onOpenChange(isOpen);
      if (!isOpen) resetForm();
    }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileAudio className="h-5 w-5 text-primary" />
            Add Reference Track
          </DialogTitle>
          <DialogDescription>
            Upload an MP3 file (click track, band mix, etc.) for the {serviceDate} practice playlist
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Track Title Input */}
          <div className="space-y-2">
            <Label htmlFor="track-title">Track Title</Label>
            <Input
              id="track-title"
              placeholder="e.g., Click Track, Band Mix, Acoustic Demo"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={uploading}
            />
          </div>

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
            onClick={() => document.getElementById("reference-audio-input")?.click()}
          >
            <input
              id="reference-audio-input"
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

          {/* Song Markers Section */}
          {selectedFile && (
            <Collapsible open={markersOpen} onOpenChange={setMarkersOpen}>
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  type="button"
                  className="w-full justify-between px-3 py-2 h-auto font-normal text-sm"
                  disabled={uploading}
                >
                  <span className="flex items-center gap-2">
                    Add Song Markers
                    {markers.length > 0 && (
                      <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                        {markers.length}
                      </span>
                    )}
                  </span>
                  {markersOpen ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <ReferenceTrackMarkerInput
                  markers={markers}
                  onChange={setMarkers}
                  setlistSongs={setlistSongs}
                  disabled={uploading}
                />
              </CollapsibleContent>
            </Collapsible>
          )}

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
              disabled={!selectedFile || !title.trim() || uploading}
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
