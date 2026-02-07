import { Plus, Trash2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface MarkerInput {
  id: string;
  songId: string; // References setlist song
  title: string; // Display title (from song)
  minutes: string;
  seconds: string;
}

export interface SetlistSong {
  id: string;
  title: string;
  sequenceOrder: number;
}

interface ReferenceTrackMarkerInputProps {
  markers: MarkerInput[];
  onChange: (markers: MarkerInput[]) => void;
  setlistSongs: SetlistSong[];
  disabled?: boolean;
}

export function ReferenceTrackMarkerInput({
  markers,
  onChange,
  setlistSongs,
  disabled = false,
}: ReferenceTrackMarkerInputProps) {
  const addMarker = () => {
    onChange([
      ...markers,
      { id: crypto.randomUUID(), songId: "", title: "", minutes: "0", seconds: "00" },
    ]);
  };

  const removeMarker = (id: string) => {
    onChange(markers.filter((m) => m.id !== id));
  };

  const updateMarker = (id: string, field: keyof MarkerInput, value: string) => {
    onChange(
      markers.map((m) => {
        if (m.id !== id) return m;
        
        // If selecting a song, also update the title
        if (field === "songId") {
          const song = setlistSongs.find((s) => s.id === value);
          return { ...m, songId: value, title: song?.title || "" };
        }
        
        return { ...m, [field]: value };
      })
    );
  };

  const formatSeconds = (value: string) => {
    const num = parseInt(value, 10);
    if (isNaN(num)) return "00";
    const clamped = Math.min(Math.max(num, 0), 59);
    return clamped.toString().padStart(2, "0");
  };

  // Get songs that haven't been used yet
  const getAvailableSongs = (currentMarkerId: string) => {
    const usedSongIds = markers
      .filter((m) => m.id !== currentMarkerId && m.songId)
      .map((m) => m.songId);
    return setlistSongs.filter((s) => !usedSongIds.includes(s.id));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          Song Markers
        </Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addMarker}
          disabled={disabled || markers.length >= setlistSongs.length}
          className="h-7 text-xs gap-1"
        >
          <Plus className="h-3 w-3" />
          Add Marker
        </Button>
      </div>

      {setlistSongs.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-3 border border-dashed rounded-lg">
          No songs in this setlist to create markers for.
        </p>
      ) : markers.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-3 border border-dashed rounded-lg">
          No markers added. Click "Add Marker" to create jump points for songs.
        </p>
      ) : (
        <div className="space-y-2">
          {markers.map((marker, index) => {
            const availableSongs = getAvailableSongs(marker.id);
            const currentSong = setlistSongs.find((s) => s.id === marker.songId);
            
            return (
              <div
                key={marker.id}
                className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg"
              >
                <span className="text-xs text-muted-foreground w-5 text-center">
                  {index + 1}
                </span>

                {/* Timestamp Input */}
                <div className="flex items-center gap-1 shrink-0">
                  <Input
                    type="number"
                    min="0"
                    max="999"
                    value={marker.minutes}
                    onChange={(e) => updateMarker(marker.id, "minutes", e.target.value)}
                    disabled={disabled}
                    className="w-12 h-8 text-center text-sm px-1"
                    placeholder="0"
                  />
                  <span className="text-muted-foreground">:</span>
                  <Input
                    type="number"
                    min="0"
                    max="59"
                    value={marker.seconds}
                    onChange={(e) => updateMarker(marker.id, "seconds", e.target.value)}
                    onBlur={(e) => updateMarker(marker.id, "seconds", formatSeconds(e.target.value))}
                    disabled={disabled}
                    className="w-12 h-8 text-center text-sm px-1"
                    placeholder="00"
                  />
                </div>

                {/* Song Dropdown */}
                <Select
                  value={marker.songId}
                  onValueChange={(value) => updateMarker(marker.id, "songId", value)}
                  disabled={disabled}
                >
                  <SelectTrigger className="h-8 flex-1 text-sm">
                    <SelectValue placeholder="Select song..." />
                  </SelectTrigger>
                  <SelectContent>
                    {/* Show current selection if it exists */}
                    {currentSong && (
                      <SelectItem key={currentSong.id} value={currentSong.id}>
                        {currentSong.sequenceOrder + 1}. {currentSong.title}
                      </SelectItem>
                    )}
                    {/* Show available songs */}
                    {availableSongs
                      .filter((s) => s.id !== marker.songId)
                      .map((song) => (
                        <SelectItem key={song.id} value={song.id}>
                          {song.sequenceOrder + 1}. {song.title}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>

                {/* Delete Button */}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeMarker(marker.id)}
                  disabled={disabled}
                  className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {markers.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Markers will be sorted by timestamp automatically
        </p>
      )}
    </div>
  );
}

// Helper to convert markers to database format
export function markersToDbFormat(markers: MarkerInput[]) {
  return markers
    .filter((m) => m.songId) // Only include markers with selected songs
    .map((m, index) => ({
      title: m.title,
      timestamp_seconds:
        parseInt(m.minutes || "0", 10) * 60 + parseInt(m.seconds || "0", 10),
      sequence_order: index,
    }))
    .sort((a, b) => a.timestamp_seconds - b.timestamp_seconds)
    .map((m, index) => ({ ...m, sequence_order: index }));
}

// Helper to convert database format to input format
export function dbToMarkerFormat(
  dbMarkers: Array<{ id: string; title: string; timestamp_seconds: number; sequence_order: number }>,
  setlistSongs: SetlistSong[]
): MarkerInput[] {
  return dbMarkers
    .sort((a, b) => a.sequence_order - b.sequence_order)
    .map((m) => {
      // Try to find matching song by title
      const matchedSong = setlistSongs.find(
        (s) => s.title.toLowerCase() === m.title.toLowerCase()
      );
      return {
        id: m.id,
        songId: matchedSong?.id || "",
        title: m.title,
        minutes: Math.floor(m.timestamp_seconds / 60).toString(),
        seconds: (m.timestamp_seconds % 60).toString().padStart(2, "0"),
      };
    });
}
