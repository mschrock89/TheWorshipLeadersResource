import { useEffect, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import type { LiveSessionNotes } from "@/hooks/useLiveSession";

type LiveNotesPanelProps = {
  notes: LiveSessionNotes | null;
  onSave: (body: string) => Promise<boolean>;
};

export function LiveNotesPanel({ notes, onSave }: LiveNotesPanelProps) {
  const [draft, setDraft] = useState(notes?.body || "");
  const [status, setStatus] = useState<"saved" | "saving" | "idle">("idle");
  const focused = useRef(false);
  const savedBody = useRef(notes?.body || "");
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  useEffect(() => {
    const incoming = notes?.body || "";
    if (focused.current || draft !== savedBody.current) return;
    if (incoming === draft) return;
    savedBody.current = incoming;
    setDraft(incoming);
  }, [draft, notes?.body, notes?.updated_at]);

  useEffect(() => {
    if (draft === savedBody.current) {
      setStatus((current) => (current === "saving" ? "idle" : current));
      return;
    }
    setStatus("saving");
    const timer = window.setTimeout(() => {
      const saving = draft;
      void onSaveRef.current(saving).then((saved) => {
        if (savedBody.current === saving) return;
        if (!saved) {
          setStatus("idle");
          return;
        }
        savedBody.current = saving;
        setStatus("saved");
      });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [draft]);

  return (
    <div className="flex min-h-0 flex-1 flex-col px-3 py-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Shared notes
        </p>
        <p className="text-xs text-muted-foreground">
          {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : "FOH and MON"}
        </p>
      </div>
      <Textarea
        value={draft}
        onChange={(event) => {
          focused.current = true;
          setDraft(event.target.value);
        }}
        onFocus={() => {
          focused.current = true;
        }}
        onBlur={() => {
          focused.current = false;
        }}
        placeholder="Cues, patch changes, things to remember for this service"
        aria-label="Production notes"
        className="min-h-0 flex-1 resize-none text-base leading-relaxed"
      />
    </div>
  );
}
