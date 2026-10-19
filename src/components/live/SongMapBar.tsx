import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import {
  activeSongMapCue,
  formatSongMapTime,
  songMapKindLabel,
  songMapOffsetFromRatio,
  type SongMapCue,
  type SongMapKind,
} from "@/lib/songMap";

type SongMapDraft = {
  id?: string;
  offsetSeconds: number;
  body: string;
  kind: SongMapKind;
};

type SongMapBarProps = {
  durationSeconds: number;
  startedAt: number | null;
  cues: SongMapCue[];
  schemaMissing?: boolean;
  onSave: (draft: SongMapDraft) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

export function SongMapBar({
  durationSeconds,
  startedAt,
  cues,
  schemaMissing = false,
  onSave,
  onDelete,
}: SongMapBarProps) {
  const [now, setNow] = useState(() => Date.now());
  const [draft, setDraft] = useState<SongMapDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (startedAt == null) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  const elapsed =
    startedAt == null || durationSeconds <= 0
      ? 0
      : Math.min(durationSeconds, Math.max(0, (now - startedAt) / 1000));
  const progress = durationSeconds > 0 ? elapsed / durationSeconds : 0;
  const playingCue = startedAt == null ? null : activeSongMapCue(cues, elapsed);
  const selectedCue = cues.find((cue) => cue.id === selectedId) || null;
  const prompt = draft ? null : playingCue || selectedCue;

  const openDraft = (offsetSeconds: number, cue?: SongMapCue) => {
    setSelectedId(cue?.id || null);
    setDraft({
      id: cue?.id,
      offsetSeconds,
      body: cue?.body || "",
      kind: cue?.kind || "mix",
    });
  };

  const placeAt = (ratio: number) => {
    openDraft(songMapOffsetFromRatio(ratio, durationSeconds));
  };

  const save = async () => {
    if (!draft || saving) return;
    setSaving(true);
    try {
      await onSave(draft);
      setDraft(null);
      setSelectedId(null);
    } catch {
      // The hook already explains the failure.
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!draft?.id || saving) return;
    setSaving(true);
    try {
      await onDelete(draft.id);
      setDraft(null);
      setSelectedId(null);
    } catch {
      // The hook already explains the failure.
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-2">
      <div className={cn("relative", prompt && "pt-7")}>
        {prompt ? (
          <p
            className={cn(
              "absolute left-0 top-0 max-w-full truncate rounded-md px-2 py-1 text-xs font-semibold",
              prompt.kind === "mix" ? "bg-amber-500/15 text-amber-600 dark:text-amber-300" : "bg-primary/15 text-primary",
            )}
          >
            {songMapKindLabel(prompt.kind)} · {prompt.body}
          </p>
        ) : null}
        <div
          className="relative h-3 cursor-pointer rounded-full bg-muted"
          onClick={(event) => {
            if (durationSeconds <= 0) return;
            const rect = event.currentTarget.getBoundingClientRect();
            if (rect.width <= 0) return;
            placeAt((event.clientX - rect.left) / rect.width);
          }}
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-primary/70"
            style={{ width: `${Math.round(progress * 1000) / 10}%` }}
          />
          {durationSeconds > 0
            ? cues.map((cue) => (
                <button
                  key={cue.id}
                  type="button"
                  aria-label={`${songMapKindLabel(cue.kind)} at ${formatSongMapTime(cue.offsetSeconds)}: ${cue.body}`}
                  className={cn(
                    "absolute top-1/2 z-10 h-4 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full",
                    cue.kind === "mix" ? "bg-amber-400" : "bg-primary",
                    (playingCue?.id === cue.id || selectedId === cue.id) && "h-5 w-2",
                  )}
                  style={{ left: `${(cue.offsetSeconds / durationSeconds) * 100}%` }}
                  onClick={(event) => {
                    event.stopPropagation();
                    openDraft(cue.offsetSeconds, cue);
                  }}
                />
              ))
            : null}
          {startedAt != null && durationSeconds > 0 ? (
            <span
              className="absolute top-1/2 z-20 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground"
              style={{ left: `${progress * 100}%` }}
            />
          ) : null}
        </div>
      </div>
      <div className="mt-1 flex items-center gap-2 text-[11px] font-semibold tabular-nums text-muted-foreground">
        <span>{startedAt == null ? "MIDI" : formatSongMapTime(elapsed)}</span>
        <span className="ml-auto">{durationSeconds > 0 ? formatSongMapTime(durationSeconds) : "No duration"}</span>
        <button
          type="button"
          className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-foreground"
          onClick={() => openDraft(durationSeconds > 0 ? Math.round(elapsed) : 0)}
        >
          Add note
        </button>
      </div>
      {schemaMissing ? (
        <p className="mt-1 text-xs text-destructive">Song map needs a database update before notes can be saved.</p>
      ) : !draft && !prompt && startedAt == null ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Click the bar to leave a mix note. Playback starts when the MIDI note arrives.
        </p>
      ) : null}
      {draft ? (
        <form
          className="mt-2 flex flex-col gap-2 rounded-xl border border-border bg-background p-2"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div className="flex items-center gap-2">
            <div className="flex rounded-md bg-muted p-0.5">
              {(["mix", "note"] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  className={cn(
                    "rounded px-2 py-1 text-xs font-bold",
                    draft.kind === kind ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
                  )}
                  onClick={() => setDraft({ ...draft, kind })}
                >
                  {songMapKindLabel(kind)}
                </button>
              ))}
            </div>
            <span className="text-xs font-semibold tabular-nums text-muted-foreground">
              {formatSongMapTime(draft.offsetSeconds)}
            </span>
          </div>
          {durationSeconds > 0 ? (
            <input
              aria-label="Note time"
              type="range"
              min={0}
              max={durationSeconds}
              value={Math.min(durationSeconds, draft.offsetSeconds)}
              onChange={(event) => setDraft({ ...draft, offsetSeconds: Number(event.target.value) })}
            />
          ) : null}
          <input
            aria-label="Song map note"
            autoFocus
            value={draft.body}
            maxLength={280}
            placeholder={draft.kind === "mix" ? "Vocal up, pull the guitars…" : "Watch the bridge"}
            onChange={(event) => setDraft({ ...draft, body: event.target.value })}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          />
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={saving || !draft.body.trim()}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-50"
            >
              Save
            </button>
            {draft.id ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => void remove()}
                className="rounded-md px-3 py-1.5 text-xs font-bold text-destructive"
              >
                Delete
              </button>
            ) : null}
            <button
              type="button"
              className="ml-auto rounded-md px-3 py-1.5 text-xs font-semibold text-muted-foreground"
              onClick={() => setDraft(null)}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
