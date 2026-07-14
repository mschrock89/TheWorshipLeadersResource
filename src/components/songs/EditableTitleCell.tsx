import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useUpdateSongTitle } from "@/hooks/useSongs";
import { cn } from "@/lib/cn";

interface EditableTitleCellProps {
  songId: string;
  currentTitle: string;
  canEdit: boolean;
  className?: string;
}

export function EditableTitleCell({
  songId,
  currentTitle,
  canEdit,
  className,
}: EditableTitleCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(currentTitle);
  const inputRef = useRef<HTMLInputElement>(null);
  const updateTitle = useUpdateSongTitle();

  useEffect(() => {
    if (!isEditing) {
      setValue(currentTitle);
    }
  }, [currentTitle, isEditing]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = async () => {
    const trimmedValue = value.trim();

    if (!trimmedValue) {
      setValue(currentTitle);
      setIsEditing(false);
      return;
    }

    if (trimmedValue !== currentTitle) {
      await updateTitle.mutateAsync({ songId, title: trimmedValue });
    }

    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      setValue(currentTitle);
      setIsEditing(false);
    }
  };

  if (!canEdit) {
    return <span className={cn("font-medium", className)}>{currentTitle}</span>;
  }

  if (isEditing) {
    return (
      <div className={cn("relative", className)}>
        <Input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          placeholder="Song title"
          className="h-8 min-w-[160px] text-sm font-medium"
          disabled={updateTitle.isPending}
        />
        {updateTitle.isPending ? (
          <Loader2 className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : null}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setIsEditing(true)}
      className={cn(
        "block w-full truncate rounded px-2 py-1 text-left text-sm font-medium transition-colors hover:bg-muted",
        className,
      )}
      title="Click to edit title"
    >
      {currentTitle}
    </button>
  );
}
