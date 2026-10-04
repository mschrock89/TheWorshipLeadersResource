import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import type { ServiceFlowItem } from "@/hooks/useServiceFlow";
import { formatDuration } from "@/components/service-flow/DurationInput";
import { notesWithoutTimecodeCue } from "@/lib/serviceFlowTimecode";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  formatMidiCueLabel,
  MIDI_NOTE_OPTIONS,
  notesWithoutMidiCue,
  parseNoteMidi,
  type FlowMidiCue,
  type MidiFollowSettings,
  type MidiNoteEvent,
} from "@/lib/serviceFlowMidi";

type MidiInputChoice = {
  id: string;
  name: string;
};

type LiveServiceFlowPanelProps = {
  items: ServiceFlowItem[];
  titles?: Map<string, string>;
  clockTimes: Map<string, string>;
  currentItemId: string | null;
  progress?: number | null;
  isLoading: boolean;
  midiSettings: MidiFollowSettings;
  midiInputs: MidiInputChoice[];
  midiStatus: "idle" | "listening" | "error";
  midiMessage?: string | null;
  lastMidi?: MidiNoteEvent | null;
  onOpenMidi?: () => void;
  onMidiSettings: (settings: MidiFollowSettings) => void;
  onAssignMidi: (itemId: string, cue: FlowMidiCue | null) => void | Promise<void>;
  onSelect: (itemId: string | null) => void;
};

function itemTitle(item: ServiceFlowItem, titles?: Map<string, string>) {
  return titles?.get(item.id) || item.song?.title || item.title;
}

function vocalistNames(item: ServiceFlowItem) {
  if (item.vocalists && item.vocalists.length > 0) {
    return item.vocalists
      .map((vocalist) => vocalist.full_name || "")
      .filter(Boolean)
      .join(", ");
  }
  return item.vocalist?.full_name || "";
}

function itemDuration(item: ServiceFlowItem) {
  if (!item.duration_seconds || item.duration_seconds <= 0) return "";
  return formatDuration(item.duration_seconds);
}

function cuesEqual(left: FlowMidiCue | null, right: FlowMidiCue | null) {
  if (!left || !right) return left === right;
  return left.note === right.note && left.velocity === right.velocity;
}

function cueFromMenu(note: string, velocity: string): FlowMidiCue | null {
  if (!note) return null;
  const parsedNote = Number(note);
  if (!Number.isInteger(parsedNote) || parsedNote < 0 || parsedNote > 127) return null;
  if (!velocity) return { note: parsedNote, velocity: null };
  const parsedVelocity = Number(velocity);
  if (!Number.isInteger(parsedVelocity) || parsedVelocity < 1 || parsedVelocity > 127) {
    return { note: parsedNote, velocity: null };
  }
  return { note: parsedNote, velocity: parsedVelocity };
}

export function LiveServiceFlowPanel({
  items,
  titles,
  clockTimes,
  currentItemId,
  progress = null,
  isLoading,
  midiSettings,
  midiInputs,
  midiStatus,
  midiMessage = null,
  lastMidi = null,
  onOpenMidi,
  onMidiSettings,
  onAssignMidi,
  onSelect,
}: LiveServiceFlowPanelProps) {
  const currentRef = useRef<HTMLButtonElement | null>(null);
  const [pendingCues, setPendingCues] = useState<Map<string, FlowMidiCue | null>>(new Map());
  const playable = useMemo(() => items.filter((item) => item.item_type !== "header"), [items]);
  const midiLabels = useMemo(() => {
    const labels = new Map<string, string>();
    for (const item of items) {
      const pending = pendingCues.get(item.id);
      const cue = pending === undefined ? parseNoteMidi(item.notes) : pending;
      if (cue) labels.set(item.id, formatMidiCueLabel(cue));
    }
    return labels;
  }, [items, pendingCues]);
  const midiArmed = midiLabels.size > 0;

  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: "nearest" });
  }, [currentItemId]);

  useEffect(() => {
    setPendingCues((current) => {
      if (current.size === 0) return current;
      const next = new Map(current);
      for (const [itemId, cue] of current) {
        const item = items.find((entry) => entry.id === itemId);
        if (!item || cuesEqual(parseNoteMidi(item.notes), cue)) next.delete(itemId);
      }
      return next.size === current.size ? current : next;
    });
  }, [items]);

  const assignCue = (itemId: string, cue: FlowMidiCue | null) => {
    setPendingCues((current) => {
      const next = new Map(current);
      next.set(itemId, cue);
      return next;
    });
    void Promise.resolve(onAssignMidi(itemId, cue)).catch(() => {
      setPendingCues((current) => {
        if (!current.has(itemId)) return current;
        const next = new Map(current);
        next.delete(itemId);
        return next;
      });
    });
  };

  if (isLoading) {
    return <p className="px-4 py-6 text-sm text-muted-foreground">Loading the service flow…</p>;
  }
  if (items.length === 0) {
    return (
      <p className="px-4 py-6 text-sm text-muted-foreground">
        No service flow for this service yet.
      </p>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
          Service flow
        </p>
        <Popover
          onOpenChange={(open) => {
            if (open) onOpenMidi?.();
          }}
        >
          <PopoverTrigger
            aria-label="MIDI notes"
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-bold uppercase tracking-wider",
              midiArmed
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground data-[state=open]:bg-primary data-[state=open]:text-primary-foreground",
            )}
          >
            MIDI
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[min(26rem,calc(100vw-1.5rem))] p-0">
            <div className="border-b border-border px-3 py-2">
              <p className="text-sm font-semibold">MIDI follow</p>
              <p className="mt-1 text-xs text-muted-foreground">
                ProPresenter sends a note for each line. Choose the note and value. Playback SMPTE still moves the songs.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 px-3 py-2">
              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Channel
                <select
                  aria-label="MIDI channel"
                  value={String(midiSettings.channel)}
                  onChange={(event) =>
                    onMidiSettings({ ...midiSettings, channel: Number(event.target.value) })
                  }
                  className="h-8 rounded-md border border-input bg-background px-2 text-sm font-medium normal-case tracking-normal text-foreground"
                >
                  {Array.from({ length: 16 }, (_, index) => index + 1).map((channel) => (
                    <option key={channel} value={channel}>
                      {channel}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Input
                <select
                  aria-label="MIDI input"
                  value={midiSettings.inputId || ""}
                  onChange={(event) =>
                    onMidiSettings({ ...midiSettings, inputId: event.target.value || null })
                  }
                  className="h-8 rounded-md border border-input bg-background px-2 text-sm font-medium normal-case tracking-normal text-foreground"
                >
                  <option value="">All inputs</option>
                  {midiInputs.map((input) => (
                    <option key={input.id} value={input.id}>
                      {input.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p
              className={cn(
                "px-3 pb-2 text-xs",
                midiStatus === "error" ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {midiStatus === "error"
                ? midiMessage || "MIDI needs a check"
                : lastMidi
                  ? `Heard ${formatMidiCueLabel({ note: lastMidi.note, velocity: lastMidi.velocity })}${
                      lastMidi.channel === midiSettings.channel ? "" : ` on channel ${lastMidi.channel}`
                    }`
                  : midiStatus === "listening"
                    ? "Waiting for a note"
                    : "Open this menu on the FOH screen to listen"}
            </p>
            <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_4.75rem] gap-2 px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <span>Line</span>
              <span>Note</span>
              <span>Value</span>
            </div>
            <ul className="max-h-80 overflow-y-auto pb-2">
              {playable.map((item) => {
                const pending = pendingCues.get(item.id);
                const cue = pending === undefined ? parseNoteMidi(item.notes) : pending;
                const title = itemTitle(item, titles);
                return (
                  <li
                    key={item.id}
                    className="grid grid-cols-[minmax(0,1fr)_5.5rem_4.75rem] items-center gap-2 px-3 py-1"
                  >
                    <span className="truncate text-sm font-medium">{title}</span>
                    <select
                      aria-label={`${title} MIDI note`}
                      value={cue ? String(cue.note) : ""}
                      onChange={(event) => {
                        const nextNote = event.target.value;
                        if (!nextNote) {
                          assignCue(item.id, null);
                          return;
                        }
                        const velocity = cue ? (cue.velocity == null ? "" : String(cue.velocity)) : "127";
                        assignCue(item.id, cueFromMenu(nextNote, velocity));
                      }}
                      className="h-8 rounded-md border border-input bg-background px-1.5 text-sm"
                    >
                      <option value="">None</option>
                      {MIDI_NOTE_OPTIONS.map((option) => (
                        <option key={option.note} value={option.note}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label={`${title} MIDI value`}
                      value={cue?.velocity == null ? "" : String(cue.velocity)}
                      disabled={!cue}
                      onChange={(event) => {
                        if (!cue) return;
                        assignCue(item.id, cueFromMenu(String(cue.note), event.target.value));
                      }}
                      className="h-8 rounded-md border border-input bg-background px-1.5 text-sm disabled:opacity-50"
                    >
                      <option value="">Any</option>
                      {Array.from({ length: 127 }, (_, index) => index + 1).map((velocity) => (
                        <option key={velocity} value={velocity}>
                          {velocity}
                        </option>
                      ))}
                    </select>
                  </li>
                );
              })}
            </ul>
          </PopoverContent>
        </Popover>
      </div>
      <ol className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-3">
        {items.map((item) => {
          if (item.item_type === "header") {
            const headerNotes = notesWithoutMidiCue(item.notes);
            return (
              <li key={item.id} className="px-2 pt-3">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
                  {item.title}
                </p>
                {headerNotes ? (
                  <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{headerNotes}</p>
                ) : null}
              </li>
            );
          }
          const isCurrent = item.id === currentItemId;
          const isSong = item.item_type === "song";
          const duration = itemDuration(item);
          const clockTime = clockTimes.get(item.id) || "";
          const singers = isSong ? vocalistNames(item) : "";
          const title = itemTitle(item, titles);
          const midiLabel = midiLabels.get(item.id) || "";
          const notes = notesWithoutMidiCue(notesWithoutTimecodeCue(item.notes));
          return (
            <li key={item.id}>
              <button
                ref={isCurrent ? currentRef : undefined}
                type="button"
                onClick={() => onSelect(isCurrent ? null : item.id)}
                className={cn(
                  "flex w-full flex-col gap-1.5 rounded-xl border px-3 py-2.5 text-left",
                  isCurrent ? "border-primary bg-primary/10" : "border-transparent bg-muted/40",
                )}
              >
                <span className="flex items-center gap-2">
                  {duration ? (
                    <span className="shrink-0 rounded-md bg-background px-1.5 py-0.5 text-xs font-semibold tabular-nums text-foreground">
                      {duration}
                    </span>
                  ) : null}
                  {clockTime ? (
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-muted-foreground">
                      {clockTime}
                    </span>
                  ) : null}
                  <span className="min-w-0 flex-1 truncate text-base font-semibold">{title}</span>
                  {isCurrent ? (
                    <span className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-primary">Now</span>
                  ) : null}
                </span>
                {isSong && (item.song?.bpm || item.song_key || singers) ? (
                  <span className="flex flex-wrap items-center gap-1.5">
                    {item.song?.bpm ? (
                      <span className="rounded-md bg-primary px-2 py-0.5 text-sm font-bold tabular-nums text-primary-foreground">
                        {item.song.bpm} BPM
                      </span>
                    ) : null}
                    {item.song_key ? (
                      <span className="rounded-md border border-foreground/30 bg-background px-2 py-0.5 text-sm font-semibold">
                        {item.song_key}
                      </span>
                    ) : null}
                    {singers ? <span className="min-w-0 text-sm font-medium">{singers}</span> : null}
                  </span>
                ) : null}
                {midiLabel ? (
                  <span className="text-sm font-semibold tabular-nums text-primary">MIDI {midiLabel}</span>
                ) : null}
                {notes ? (
                  <span className="whitespace-pre-wrap text-xs text-muted-foreground">{notes}</span>
                ) : null}
                {isCurrent && progress != null ? (
                  <span className="mt-0.5 block h-1 overflow-hidden rounded-full bg-primary/20">
                    <span
                      className="block h-full rounded-full bg-primary"
                      style={{ width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` }}
                    />
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function findFlowCue(
  items: ServiceFlowItem[],
  currentItemId: string | null,
  titles?: Map<string, string>,
) {
  const playable = items.filter((item) => item.item_type !== "header");
  const currentIndex = playable.findIndex((item) => item.id === currentItemId);
  const current = currentIndex >= 0 ? playable[currentIndex] : null;
  const next = currentIndex >= 0 ? playable[currentIndex + 1] : null;
  return {
    currentTitle: current ? itemTitle(current, titles) : null,
    nextTitle: next ? itemTitle(next, titles) : null,
  };
}
