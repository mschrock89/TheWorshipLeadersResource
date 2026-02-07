import { useState, useEffect } from "react";
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

interface EditItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: {
    id: string;
    item_type: "header" | "item" | "song_placeholder";
    title: string;
    default_duration_seconds: number | null;
  } | null;
  onSave: (item: {
    id: string;
    item_type: "header" | "item" | "song_placeholder";
    title: string;
    default_duration_seconds: number | null;
  }) => void;
}

export function EditItemDialog({
  open,
  onOpenChange,
  item,
  onSave,
}: EditItemDialogProps) {
  const [itemType, setItemType] = useState<"header" | "item" | "song_placeholder">("item");
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState<number | null>(null);

  // Sync state when item changes
  useEffect(() => {
    if (item) {
      setItemType(item.item_type);
      setTitle(item.title);
      setDuration(item.default_duration_seconds);
    }
  }, [item]);

  const handleSave = () => {
    if (!item) return;
    
    onSave({
      id: item.id,
      item_type: itemType,
      title: title || (itemType === "song_placeholder" ? "Song Placeholder" : ""),
      default_duration_seconds: duration,
    });

    onOpenChange(false);
  };

  const isValid = () => {
    if (itemType === "header") return title.trim().length > 0;
    if (itemType === "item") return title.trim().length > 0;
    if (itemType === "song_placeholder") return true;
    return false;
  };

  const getItemTypeLabel = (type: string) => {
    switch (type) {
      case "song_placeholder":
        return "Song Placeholder";
      default:
        return type.charAt(0).toUpperCase() + type.slice(1);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Template Item</DialogTitle>
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
                <RadioGroupItem value="header" id="edit-header" />
                <Label htmlFor="edit-header" className="font-normal cursor-pointer">
                  Header
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="item" id="edit-item" />
                <Label htmlFor="edit-item" className="font-normal cursor-pointer">
                  Item
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="song_placeholder" id="edit-song" />
                <Label htmlFor="edit-song" className="font-normal cursor-pointer">
                  Song Placeholder
                </Label>
              </div>
            </RadioGroup>
          </div>

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
          <Button onClick={handleSave} disabled={!isValid()}>
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
