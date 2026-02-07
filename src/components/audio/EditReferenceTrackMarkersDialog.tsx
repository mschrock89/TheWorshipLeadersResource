import { useState, useEffect } from "react";
import { Loader2, Clock, Save } from "lucide-react";
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
  SetlistSong,
} from "./ReferenceTrackMarkerInput";

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
  existingMarkers: ReferenceTrackMarker[];
  setlistSongs: SetlistSong[];
}

export function EditReferenceTrackMarkersDialog({
  open,
  onOpenChange,
  referenceTrackId,
  referenceTrackTitle,
  existingMarkers,
  setlistSongs,
}: EditReferenceTrackMarkersDialogProps) {
  const [markers, setMarkers] = useState<MarkerInput[]>([]);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Initialize markers when dialog opens
  useEffect(() => {
    if (open) {
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
    }
  }, [open, existingMarkers, setlistSongs]);

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
          <ReferenceTrackMarkerInput
            markers={markers}
            onChange={setMarkers}
            setlistSongs={setlistSongs}
            disabled={saving}
          />

          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
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
