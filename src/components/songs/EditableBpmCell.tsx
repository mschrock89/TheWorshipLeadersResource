import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { useUpdateSongBpm } from "@/hooks/useSongs";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface EditableBpmCellProps {
  songId: string;
  currentBpm: number | null;
  canEdit: boolean;
}

export function EditableBpmCell({ songId, currentBpm, canEdit }: EditableBpmCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(currentBpm?.toString() || "");
  const inputRef = useRef<HTMLInputElement>(null);
  const updateBpm = useUpdateSongBpm();

  // Sync local value when prop changes
  useEffect(() => {
    if (!isEditing) {
      setValue(currentBpm?.toString() || "");
    }
  }, [currentBpm, isEditing]);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = async () => {
    const numValue = value.trim() ? parseFloat(value.trim()) : null;
    
    // Validate BPM range
    if (numValue !== null && (numValue < 20 || numValue > 300)) {
      setValue(currentBpm?.toString() || "");
      setIsEditing(false);
      return;
    }

    // Only save if value changed
    if (numValue !== currentBpm) {
      await updateBpm.mutateAsync({ songId, bpm: numValue });
    }
    
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      setValue(currentBpm?.toString() || "");
      setIsEditing(false);
    }
  };

  if (!canEdit) {
    return (
      <span className="text-muted-foreground">
        {currentBpm ? Math.round(currentBpm) : "—"}
      </span>
    );
  }

  if (isEditing) {
    return (
      <div className="relative">
        <Input
          ref={inputRef}
          type="number"
          min="20"
          max="300"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          className="h-7 w-16 text-center text-sm px-1"
          disabled={updateBpm.isPending}
        />
        {updateBpm.isPending && (
          <Loader2 className="h-3 w-3 animate-spin absolute right-1 top-1/2 -translate-y-1/2" />
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => setIsEditing(true)}
      className={cn(
        "px-2 py-1 rounded text-sm transition-colors",
        "hover:bg-muted cursor-pointer min-w-[40px]",
        currentBpm ? "text-foreground" : "text-muted-foreground"
      )}
      title="Click to edit BPM"
    >
      {currentBpm ? Math.round(currentBpm) : "—"}
    </button>
  );
}
