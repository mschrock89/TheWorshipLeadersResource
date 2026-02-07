import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { DurationInput } from "./DurationInput";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSongs } from "@/hooks/useSongs";
import { useSongKeys } from "@/hooks/useSongKeys";

interface AddItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (item: {
    item_type: "header" | "item" | "song";
    title: string;
    duration_seconds: number | null;
    song_id?: string | null;
    song_key?: string | null;
  }) => void;
  isTemplate?: boolean;
}

export function AddItemDialog({
  open,
  onOpenChange,
  onAdd,
  isTemplate = false,
}: AddItemDialogProps) {
  const [itemType, setItemType] = useState<"header" | "item" | "song">(
    isTemplate ? "header" : "item"
  );
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState<number | null>(null);
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const { data: songs } = useSongs();
  const { data: songKeys } = useSongKeys();

  const handleAdd = () => {
    let finalTitle = title;
    let songId = null;
    let songKey = selectedKey;

    if (itemType === "song" && selectedSongId) {
      const song = songs?.find((s) => s.id === selectedSongId);
      finalTitle = song?.title || title;
      songId = selectedSongId;
    }

    onAdd({
      item_type: isTemplate && itemType === "song" ? "song" as const : itemType,
      title: finalTitle || (isTemplate && itemType === "song" ? "Song Placeholder" : ""),
      duration_seconds: duration,
      song_id: songId,
      song_key: songKey,
    });

    // Reset form
    setTitle("");
    setDuration(null);
    setSelectedSongId(null);
    setSelectedKey(null);
    setItemType(isTemplate ? "header" : "item");
    onOpenChange(false);
  };

  const isValid = () => {
    if (itemType === "header") return title.trim().length > 0;
    if (itemType === "item") return title.trim().length > 0;
    if (itemType === "song") {
      if (isTemplate) return true; // Song placeholder doesn't need selection
      return selectedSongId !== null;
    }
    return false;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add {isTemplate ? "Template " : ""}Item</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Item Type</Label>
            <RadioGroup
              value={itemType}
              onValueChange={(v) => setItemType(v as typeof itemType)}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="header" id="header" />
                <Label htmlFor="header" className="font-normal cursor-pointer">
                  Header
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="item" id="item" />
                <Label htmlFor="item" className="font-normal cursor-pointer">
                  Item
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="song" id="song" />
                <Label htmlFor="song" className="font-normal cursor-pointer">
                  {isTemplate ? "Song Placeholder" : "Song"}
                </Label>
              </div>
            </RadioGroup>
          </div>

          {itemType === "song" && !isTemplate && (
            <div className="space-y-2">
              <Label>Song</Label>
              <Select value={selectedSongId || ""} onValueChange={setSelectedSongId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a song" />
                </SelectTrigger>
                <SelectContent>
                  {songs?.map((song) => (
                    <SelectItem key={song.id} value={song.id}>
                      {song.title}
                      {song.author && (
                        <span className="text-muted-foreground ml-2">
                          - {song.author}
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {itemType === "song" && !isTemplate && (
            <div className="space-y-2">
              <Label>Key</Label>
              <Select value={selectedKey || ""} onValueChange={setSelectedKey}>
                <SelectTrigger>
                  <SelectValue placeholder="Select key" />
                </SelectTrigger>
                <SelectContent>
                  {songKeys?.map((key) => (
                    <SelectItem key={key.id} value={key.key_name}>
                      {key.key_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {(itemType === "header" || itemType === "item" || (itemType === "song" && isTemplate)) && (
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  itemType === "header"
                    ? "e.g., PRE-SERVICE"
                    : itemType === "item"
                    ? "e.g., Announcements"
                    : "e.g., Worship Song 1"
                }
              />
            </div>
          )}

          {itemType !== "header" && (
            <div className="space-y-2">
              <Label>Duration (optional)</Label>
              <DurationInput
                value={duration}
                onChange={setDuration}
                className="w-24"
              />
              <p className="text-xs text-muted-foreground">
                Format: minutes:seconds (e.g., 5:30)
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={!isValid()}>
            Add Item
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
