import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useUpdateSongAuthor } from "@/hooks/useSongs";
import { cn } from "@/lib/utils";

interface EditableAuthorCellProps {
  songId: string;
  currentAuthor: string | null;
  canEdit: boolean;
  className?: string;
}

export function EditableAuthorCell({
  songId,
  currentAuthor,
  canEdit,
  className,
}: EditableAuthorCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(currentAuthor || "");
  const inputRef = useRef<HTMLInputElement>(null);
  const updateAuthor = useUpdateSongAuthor();

  useEffect(() => {
    if (!isEditing) {
      setValue(currentAuthor || "");
    }
  }, [currentAuthor, isEditing]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = async () => {
    const trimmedValue = value.trim();
    const nextAuthor = trimmedValue || null;

    if (nextAuthor !== currentAuthor) {
      await updateAuthor.mutateAsync({ songId, author: nextAuthor });
    }

    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      setValue(currentAuthor || "");
      setIsEditing(false);
    }
  };

  if (!canEdit) {
    return (
      <span className={cn("text-muted-foreground", className)}>
        {currentAuthor || "Unknown"}
      </span>
    );
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
          placeholder="Add author"
          className="h-8 min-w-[160px] text-sm"
          disabled={updateAuthor.isPending}
        />
        {updateAuthor.isPending ? (
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
        "block w-full truncate rounded px-2 py-1 text-left text-sm transition-colors hover:bg-muted",
        currentAuthor ? "text-muted-foreground" : "text-muted-foreground/80 italic",
        className,
      )}
      title="Click to edit author"
    >
      {currentAuthor || "Add author"}
    </button>
  );
}
