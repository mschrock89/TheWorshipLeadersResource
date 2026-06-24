import { useState, useEffect, useRef } from "react";
import { Loader2, Clock, Save, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  ReferenceTrackMarkerInput,
  MarkerInput,
  markersToDbFormat,
  dbToMarkerFormat,
  introTimestampsToMarkers,
  SetlistSong,
} from "./ReferenceTrackMarkerInput";
import { detectReferenceTrackMarkersFromUrl } from "@/lib/detectReferenceTrackMarkers";

interface ReferenceTrackMarker {
  id: string;
  title: string;
  timestampSeconds: number;
  sequenceOrder: number;
}

interface EditReferenceTrackMarkersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  referenceTrackId: string;
  referenceTrackTitle: string;
  audioUrl: string;
  existingMarkers: ReferenceTrackMarker[];
  setlistSongs: SetlistSong[];
}

export function EditReferenceTrackMarkersDialog({
  open,
  onOpenChange,
  referenceTrackId,
  referenceTrackTitle,
  audioUrl,
  existingMarkers,
  setlistSongs,
}: EditReferenceTrackMarkersDialogProps) {
  const [markers, setMarkers] = useState<MarkerInput[]>([]);
  const [saving, setSaving] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Initialize markers only when the dialog opens or the selected track changes.
  // We intentionally avoid depending on existingMarkers/setlistSongs because the
  // parent rebuilds those arrays on every render, which would otherwise wipe out
  // freshly auto-detected or edited markers on the next re-render.
  const initializedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      initializedKeyRef.current = null;
      return;
    }
    if (initializedKeyRef.current === referenceTrackId) return;
    initializedKeyRef.current = referenceTrackId;

    const converted = dbToMarkerFormat(
      existingMarkers.map((m) => ({
        id: m.id,
        title: m.title,
        timestamp_seconds: m.timestampSeconds,
        sequence_order: m.sequenceOrder,
      })),
      setlistSongs
    );
    setMarkers(converted);
  }, [open, referenceTrackId, existingMarkers, setlistSongs]);

  const handleAutoDetect = async () => {
    if (setlistSongs.length === 0) {
      toast({
        title: "No setlist songs",
        description: "Add songs to the setlist first so auto-detected markers can be mapped.",
        variant: "destructive",
      });
      return;
    }

    setDetecting(true);
    try {
      const result = await detectReferenceTrackMarkersFromUrl(audioUrl, setlistSongs.length);
      const detectedMarkers = introTimestampsToMarkers(result.intro_timestamps, setlistSongs);
      setMarkers(detectedMarkers);

      toast({
        title: detectedMarkers.length > 0 ? "Song markers detected" : "No intro cues found",
        description: detectedMarkers.length > 0
          ? `Found ${detectedMarkers.length} "Intro" cue${detectedMarkers.length !== 1 ? "s" : ""}. Save to apply them.`
          : 'Could not hear the word "Intro" in this track.',
        variant: detectedMarkers.length > 0 ? "default" : "destructive",
      });
    } catch (error) {
      toast({
        title: "Auto-detection failed",
        description: error instanceof Error ? error.message : "Could not analyze the audio.",
        variant: "destructive",
      });
    } finally {
      setDetecting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);

    try {
      // Delete all existing markers for this track
      const { error: deleteError } = await supabase
        .from("reference_track_markers")
        .delete()
        .eq("reference_track_id", referenceTrackId);

      if (deleteError) throw deleteError;

      // Insert new markers
      const dbMarkers = markersToDbFormat(markers);
      if (dbMarkers.length > 0) {
        const { error: insertError } = await supabase
          .from("reference_track_markers")
          .insert(
            dbMarkers.map((m) => ({
              reference_track_id: referenceTrackId,
              title: m.title,
              timestamp_seconds: m.timestamp_seconds,
              sequence_order: m.sequence_order,
            }))
          );

        if (insertError) throw insertError;
      }

      toast({
        title: "Markers saved",
        description: `Updated markers for "${referenceTrackTitle}"`,
      });

      queryClient.invalidateQueries({ queryKey: ["setlist-playlists"] });
      onOpenChange(false);
    } catch (error: any) {
      console.error("Save error:", error);
      toast({
        title: "Save failed",
        description: error.message || "Failed to save markers",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Edit Markers
          </DialogTitle>
          <DialogDescription>
            Add or edit song markers for "{referenceTrackTitle}"
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Auto-detect markers from spoken "Intro" cues, then review and save.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 shrink-0"
              onClick={handleAutoDetect}
              disabled={saving || detecting}
            >
              {detecting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              Auto-detect
            </Button>
          </div>

          <ReferenceTrackMarkerInput
            markers={markers}
            onChange={setMarkers}
            setlistSongs={setlistSongs}
            disabled={saving || detecting}
          />

          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving || detecting}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || detecting}
              className="flex-1"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Markers
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
