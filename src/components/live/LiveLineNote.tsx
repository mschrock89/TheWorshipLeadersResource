import { useEffect, useRef, useState } from "react";
import { LIVE_LINE_NOTE_MAX } from "@/hooks/useLiveLineNotes";

type LiveLineNoteProps = {
  note: string;
  onSave: (body: string) => Promise<boolean>;
};

function lineLabel(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function LiveLineNote({ note, onSave }: LiveLineNoteProps) {
  const [draft, setDraft] = useState(note);
  const [editing, setEditing] = useState(false);
  const focused = useRef(false);
  const savedBody = useRef(note);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  useEffect(() => {
    if (focused.current || draft !== savedBody.current) return;
    if (note === draft) return;
    savedBody.current = note;
    setDraft(note);
  }, [draft, note]);

  useEffect(() => {
    if (draft === savedBody.current) return;
    const timer = window.setTimeout(() => {
      const saving = draft;
      void onSaveRef.current(saving).then((saved) => {
        if (!saved || savedBody.current === saving) return;
        savedBody.current = saving;
      });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [draft]);

  const shown = lineLabel(draft || note);

  if (!editing) {
    if (!shown) {
      return (
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label="Add note"
          className="shrink-0 px-1 text-lg font-semibold leading-none text-muted-foreground hover:text-foreground"
        >
          +
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        title={shown}
        className="shrink-0 whitespace-nowrap text-right text-base font-bold text-primary"
      >
        {shown}
      </button>
    );
  }

  return (
    <input
      value={draft}
      maxLength={LIVE_LINE_NOTE_MAX}
      autoFocus
      aria-label="Private note for this line"
      placeholder="Note"
      onChange={(event) => {
        focused.current = true;
        setDraft(event.target.value.slice(0, LIVE_LINE_NOTE_MAX));
      }}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
        setEditing(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }
      }}
      className="h-8 w-36 shrink-0 rounded-md border border-input bg-background px-2 text-right text-base font-bold text-primary outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
    />
  );
}
