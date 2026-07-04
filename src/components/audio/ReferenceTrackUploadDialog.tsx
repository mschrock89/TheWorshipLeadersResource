import { useState, useCallback, useRef } from "react";
import { Upload, FileAudio, Loader2, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
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
import { ReferenceTrackMarkerInput, MarkerInput, markersToDbFormat, introTimestampsToMarkers, SetlistSong } from "./ReferenceTrackMarkerInput";
import { detectReferenceTrackMarkers, detectReferenceTrackMarkersFromUrl, isMp3File } from "@/lib/detectReferenceTrackMarkers";

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
  const [uploadPhase, setUploadPhase] = useState<"idle" | "uploading" | "detecting" | "complete">("idle");
  const [progress, setProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [audioDuration, setAudioDuration] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [markers, setMarkers] = useState<MarkerInput[]>([]);
  const [markersOpen, setMarkersOpen] = useState(false);
  const [detectingMarkers, setDetectingMarkers] = useState(false);
  const detectionRequestId = useRef(0);
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
    setDetectingMarkers(false);
    setUploadPhase("idle");
    detectionRequestId.current += 1;
  };

  const analyzeMarkersFromAudio = useCallback(async (
    file: File,
    requestId: number,
    durationSeconds?: number | null,
  ) => {
    if (setlistSongs.length === 0) {
      toast({
        title: "No setlist songs",
        description: "Add songs to the setlist first so auto-detected markers can be mapped.",
      });
      return;
    }

    setDetectingMarkers(true);
    try {
      const result = await detectReferenceTrackMarkers(file, setlistSongs.length, durationSeconds);
      if (requestId !== detectionRequestId.current) return;

      const detectedMarkers = introTimestampsToMarkers(result.intro_timestamps, setlistSongs);
      setMarkers(detectedMarkers);
      setMarkersOpen(true);

      if (detectedMarkers.length > 0) {
        toast({
          title: "Song markers detected",
          description: `Found ${detectedMarkers.length} "Intro" cue${detectedMarkers.length !== 1 ? "s" : ""} and mapped them to your setlist.`,
        });
      } else {
        toast({
          title: "No intro cues found",
          description: 'Could not hear the word "Intro" in this track. You can add markers manually.',
        });
      }
    } catch (error) {
      if (requestId !== detectionRequestId.current) return;
      console.warn("Marker detection failed:", error);
      toast({
        title: "Auto-detection unavailable",
        description: error instanceof Error
          ? error.message
          : "Could not analyze the audio. You can still add markers manually.",
        variant: "destructive",
      });
    } finally {
      if (requestId === detectionRequestId.current) {
        setDetectingMarkers(false);
      }
    }
  }, [setlistSongs, toast]);

  const processSelectedFile = useCallback(async (file: File) => {
    const requestId = ++detectionRequestId.current;
    setSelectedFile(file);
    setMarkers([]);
    setMarkersOpen(true);
    let durationSeconds: number | null = null;

    try {
      const duration = await extractAudioDuration(file);
      if (requestId !== detectionRequestId.current) return;
      setAudioDuration(duration);
      durationSeconds = duration;
    } catch (err) {
      console.warn("Could not extract audio duration:", err);
      if (requestId === detectionRequestId.current) {
        setAudioDuration(null);
      }
    }

    if (!title) {
      const nameWithoutExt = file.name.replace(/\.mp3$/i, "");
      setTitle(nameWithoutExt);
    }

    void analyzeMarkersFromAudio(file, requestId, durationSeconds);
  }, [analyzeMarkersFromAudio, extractAudioDuration, title]);

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
    if (file && isMp3File(file)) {
      void processSelectedFile(file);
    } else {
      toast({
        title: "Invalid file type",
        description: "Please upload an MP3 file.",
        variant: "destructive",
      });
    }
  }, [toast, processSelectedFile]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && isMp3File(file)) {
      void processSelectedFile(file);
    } else if (file) {
      toast({
        title: "Invalid file type",
        description: "Please upload an MP3 file.",
        variant: "destructive",
      });
    }
  }, [toast, processSelectedFile]);

  const handleUpload = async () => {
    if (!selectedFile || !title.trim() || !user) return;

    setUploading(true);
    setUploadPhase("uploading");
    setProgress(0);

    let progressInterval: ReturnType<typeof setInterval> | null = null;

    try {
      // Generate unique filename
      const fileExt = selectedFile.name.split(".").pop();
      const fileName = `${playlistId}-${Date.now()}.${fileExt}`;
      const filePath = `reference-tracks/${fileName}`;

      // Simulate progress for better UX
      progressInterval = setInterval(() => {
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
      progressInterval = null;

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

      // Save markers — use pre-detected markers, or auto-detect from uploaded audio
      let dbMarkers = markersToDbFormat(markers);

      if (dbMarkers.length === 0 && setlistSongs.length > 0) {
        setUploadPhase("detecting");
        setProgress(92);
        try {
          const result = await detectReferenceTrackMarkersFromUrl(
            urlData.publicUrl,
            setlistSongs.length,
            audioDuration,
          );
          dbMarkers = markersToDbFormat(
            introTimestampsToMarkers(result.intro_timestamps, setlistSongs),
          );
        } catch (detectError) {
          console.warn("Post-upload marker detection failed:", detectError);
        }
      }

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
          toast({
            title: "Markers not saved",
            description: markersError.message || "The track uploaded, but song markers could not be saved.",
            variant: "destructive",
          });
        }
      }

      try {
        const { error: notifyError } = await supabase.functions.invoke("notify-weekend-track-uploaded", {
          body: {
            playlistId,
            referenceTrackId: insertedTrack.id,
            trackTitle: title.trim(),
          },
        });

        if (notifyError) {
          console.error("Failed to notify scheduled users about weekend track upload:", notifyError);
        }
      } catch (notifyInvocationError) {
        console.error("Failed to invoke weekend track upload notification:", notifyInvocationError);
      }

      setProgress(100);
      setUploadPhase("complete");

      toast({
        title: "Weekend track uploaded",
        description: dbMarkers.length > 0
          ? `"${title.trim()}" added with ${dbMarkers.length} auto-detected marker${dbMarkers.length !== 1 ? "s" : ""}`
          : `"${title.trim()}" uploaded, but no "Intro" cues were detected. You can add markers manually.`,
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
        description: error.message || "Failed to upload weekend track.",
        variant: "destructive",
      });
    } finally {
      if (progressInterval) clearInterval(progressInterval);
      setUploading(false);
      setUploadPhase("idle");
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
            Add Weekend Track
          </DialogTitle>
          <DialogDescription>
            Upload an MP3 file (click track, band mix, etc.) for the {serviceDate} Our Versions playlist
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
              accept="audio/mpeg,audio/mp3,.mp3"
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
                  disabled={uploading || detectingMarkers}
                >
                  <span className="flex items-center gap-2">
                    {detectingMarkers ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Detecting song markers...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3.5 w-3.5 text-primary" />
                        Song Markers
                        {markers.length > 0 && (
                          <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                            {markers.length}
                          </span>
                        )}
                      </>
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
                {detectingMarkers ? (
                  <p className="text-xs text-muted-foreground text-center py-3 border border-dashed rounded-lg">
                    Listening for spoken "Intro" cues to place song markers...
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground mb-2">
                      Markers are auto-detected from spoken "Intro" cues. Review and adjust before uploading.
                    </p>
                    <ReferenceTrackMarkerInput
                      markers={markers}
                      onChange={setMarkers}
                      setlistSongs={setlistSongs}
                      disabled={uploading}
                    />
                  </>
                )}
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Upload Progress */}
          {uploading && (
            <div className="space-y-2">
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">
                {uploadPhase === "detecting"
                  ? "Analyzing audio for Intro cues..."
                  : progress < 100
                    ? "Uploading..."
                    : "Complete!"}
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
              disabled={!selectedFile || !title.trim() || uploading || detectingMarkers}
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
