import { useEffect, useMemo, useRef, useState } from "react";
import { useBottomScreenInset } from "@/hooks/useBottomScreenInset";
import { cn } from "@/lib/cn";
import type { ServiceFlowItem } from "@/hooks/useServiceFlow";
import { formatDuration } from "@/components/service-flow/DurationInput";
import { notesWithoutServiceStart } from "@/components/service-flow/serviceFlowClock";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { LiveLineNote } from "@/components/live/LiveLineNote";
import { readableSongNotes } from "@/lib/liveSongNotes";
import { activeSongMapCue, formatSongMapTime, type SongMapCue } from "@/lib/songMap";
import {
  effectiveMidiCue,
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
  serviceStartItemId?: string | null;
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
  showMidi?: boolean;
  personalNotes?: Map<string, string>;
  personalNoteStation?: string;
  onSavePersonalNote?: (itemId: string, body: string) => Promise<boolean>;
  songMapCues?: SongMapCue[];
  songMapRun?: { itemId: string; startedAt: number } | null;
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

function visibleItemNotes(notes: string | null | undefined) {
  return notesWithoutServiceStart(notesWithoutMidiCue(notes));
}

type SongNoteEntry = {
  item: ServiceFlowItem;
  title: string;
  flowNotes: string;
  notes: SongMapCue[];
};

function SongNotesStage({
  entries,
  currentItemId,
  run,
  onSelect,
}: {
  entries: SongNoteEntry[];
  currentItemId: string | null;
  run: { itemId: string; startedAt: number } | null;
  onSelect: (itemId: string) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!run) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [run]);

  const elapsed = run ? Math.max(0, (now - run.startedAt) / 1000) : null;
  const shown = entries.flatMap((entry) => {
    if (elapsed == null || run?.itemId !== entry.item.id) return [];
    const active = activeSongMapCue(entry.notes, elapsed);
    return active ? [{ entry, active }] : [];
  });
  if (shown.length === 0) return null;

  return (
    <section
      aria-label="Song notes"
      className="flex max-h-full min-h-0 flex-col overflow-hidden rounded-xl border border-primary/40 bg-card shadow-[0_18px_48px_rgba(0,0,0,0.55)]"
    >
      <div className="flex min-h-0 flex-col gap-2 overflow-y-auto p-3">
        {shown.map(({ entry, active }) => {
          const singers = vocalistNames(entry.item);
          return (
            <article
              key={entry.item.id}
              className="shrink-0 rounded-lg border border-primary bg-primary/15 px-3 py-2.5"
            >
              <button
                type="button"
                onClick={() => {
                  if (entry.item.id !== currentItemId) onSelect(entry.item.id);
                }}
                className="flex flex-wrap items-center gap-2 text-left"
              >
                <span className="min-w-0 flex-1 truncate text-base font-bold">{entry.title}</span>
                {entry.item.song?.bpm ? (
                  <span className="rounded-md bg-primary px-2 py-0.5 text-sm font-bold tabular-nums text-primary-foreground">
                    {entry.item.song.bpm} BPM
                  </span>
                ) : null}
                {entry.item.song_key ? (
                  <span className="rounded-md border border-foreground/30 bg-background px-2 py-0.5 text-sm font-semibold">
                    {entry.item.song_key}
                  </span>
                ) : null}
                {singers ? <span className="min-w-0 text-sm font-medium">{singers}</span> : null}
              </button>
              <p className="mt-2 flex items-baseline gap-3 text-2xl font-semibold leading-snug text-primary">
                <span className="w-14 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
                  {formatSongMapTime(active.offsetSeconds)}
                </span>
                <span className="min-w-0 flex-1">{active.body}</span>
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function cuesEqual(left: FlowMidiCue | null, right: FlowMidiCue | null) {
  if (!left || !right) return left === right;
  return left.note === right.note && left.velocity === right.velocity;
}

function MidiAssignmentRow({
  title,
  cue,
  onChange,
}: {
  title: string;
  cue: FlowMidiCue | null;
  onChange: (cue: FlowMidiCue | null) => void;
}) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_5.5rem_4.75rem] items-center gap-2 px-3 py-1">
      <span className="truncate text-sm font-medium">{title}</span>
      <select
        aria-label={`${title} MIDI note`}
        value={cue ? String(cue.note) : ""}
        onChange={(event) => {
          const nextNote = event.target.value;
          if (!nextNote) {
            onChange(null);
            return;
          }
          const velocity = cue ? (cue.velocity == null ? "" : String(cue.velocity)) : "127";
          onChange(cueFromMenu(nextNote, velocity));
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
          onChange(cueFromMenu(String(cue.note), event.target.value));
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
  serviceStartItemId = null,
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
  showMidi = true,
  personalNotes,
  personalNoteStation = "",
  onSavePersonalNote,
  songMapCues = [],
  songMapRun = null,
}: LiveServiceFlowPanelProps) {
  const currentRef = useRef<HTMLLIElement | null>(null);
  const notesPopupRef = useRef<HTMLDivElement | null>(null);
  const [notesPopupHeight, setNotesPopupHeight] = useState(0);
  const { inset: bottomInset, viewportHeight } = useBottomScreenInset();
  const [pendingCues, setPendingCues] = useState<Map<string, FlowMidiCue | null>>(new Map());
  const playable = useMemo(() => items.filter((item) => item.item_type !== "header"), [items]);
  const midiArmed = useMemo(
    () =>
      midiSettings.preServiceCue != null ||
      midiSettings.endServiceCue != null ||
      playable.some((item, playableIndex) => {
        const pending = pendingCues.get(item.id);
        const cue = pending === undefined ? effectiveMidiCue(item.notes, playableIndex) : pending;
        return cue != null;
      }),
    [midiSettings.endServiceCue, midiSettings.preServiceCue, pendingCues, playable],
  );

  const songNoteEntries = useMemo(() => {
    if (!currentItemId) return null;
    const item = items.find((entry) => entry.id === currentItemId);
    if (!item || item.item_type !== "song") return null;
    const timed = readableSongNotes([item.id], songMapCues).sort(
      (left, right) => left.offsetSeconds - right.offsetSeconds || left.id.localeCompare(right.id),
    );
    const flowNotes = visibleItemNotes(item.notes);
    if (timed.length === 0 && !flowNotes) return null;
    return [{ item, title: itemTitle(item, titles), flowNotes, notes: timed }];
  }, [currentItemId, items, songMapCues, titles]);

  useEffect(() => {
    const node = notesPopupRef.current;
    if (!node) {
      setNotesPopupHeight(0);
      return;
    }
    const measure = () => setNotesPopupHeight(node.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [songNoteEntries]);

  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: songNoteEntries ? "start" : "nearest" });
  }, [currentItemId, notesPopupHeight, songNoteEntries]);

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

  const notesCover = notesPopupHeight > 0 ? notesPopupHeight + 12 : 0;
  const notesFadeEnd = notesCover > 0 ? notesCover + 88 : 0;
  const notesFade =
    notesFadeEnd > 0
      ? `linear-gradient(to bottom, transparent 0, transparent ${Math.max(0, notesCover - 8)}px, #000 ${notesFadeEnd}px)`
      : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
          Service flow
        </p>
        {showMidi ? (
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
          <PopoverContent
            align="end"
            collisionPadding={{ top: 12, right: 12, bottom: bottomInset + 12, left: 12 }}
            className="flex w-[min(26rem,calc(100vw-1.5rem))] flex-col overflow-hidden p-0"
            style={
              viewportHeight > 0
                ? { maxHeight: Math.max(240, viewportHeight - bottomInset - 24) }
                : undefined
            }
          >
            <div className="shrink-0 border-b border-border px-3 py-2">
              <p className="text-sm font-semibold">MIDI follow</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Playback sends G1. Value 1 is the first line, then 2, 3, and on through 12. A saved note replaces that.
                Pre-Service and End of Service Prayer start on the notes chosen below. The Pre-Service note fades the prayer track out over 1.5 seconds.
              </p>
            </div>
            <div className="grid shrink-0 grid-cols-2 gap-2 px-3 py-2">
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
                "shrink-0 px-3 pb-2 text-xs",
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
                    : "Waiting for this browser to hear a note"}
            </p>
            <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_5.5rem_4.75rem] gap-2 px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <span>Line</span>
              <span>Note</span>
              <span>Value</span>
            </div>
            <ul className="max-h-80 min-h-0 shrink overflow-y-auto overscroll-contain pb-3">
              <MidiAssignmentRow
                title="Pre-Service Playlist"
                cue={midiSettings.preServiceCue}
                onChange={(cue) => onMidiSettings({ ...midiSettings, preServiceCue: cue })}
              />
              <MidiAssignmentRow
                title="End of Service Prayer"
                cue={midiSettings.endServiceCue}
                onChange={(cue) => onMidiSettings({ ...midiSettings, endServiceCue: cue })}
              />
              {playable.map((item, playableIndex) => {
                const pending = pendingCues.get(item.id);
                const cue = pending === undefined ? effectiveMidiCue(item.notes, playableIndex) : pending;
                const title = itemTitle(item, titles);
                return (
                  <MidiAssignmentRow
                    key={item.id}
                    title={title}
                    cue={cue}
                    onChange={(next) => assignCue(item.id, next)}
                  />
                );
              })}
            </ul>
          </PopoverContent>
        </Popover>
        ) : null}
      </div>
      <div className="relative min-h-0 flex-1">
      <ol
        className="h-full min-h-0 space-y-1.5 overflow-y-auto px-3 pb-3 pt-3"
        style={
          notesFade
            ? {
                scrollPaddingTop: notesFadeEnd,
                maskImage: notesFade,
                WebkitMaskImage: notesFade,
              }
            : undefined
        }
      >
        {items.map((item) => {
          if (item.item_type === "header") {
            const headerNotes = visibleItemNotes(item.notes);
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
          const notes = visibleItemNotes(item.notes);
          const endsAtServiceStart = item.id === serviceStartItemId;
          return (
            <li key={item.id} ref={isCurrent ? currentRef : undefined}>
              <div
                className={cn(
                  "grid grid-cols-[minmax(0,1fr)_max-content] items-center gap-x-3 gap-y-1.5 rounded-xl border px-3 py-2.5 text-left",
                  isCurrent ? "border-primary bg-primary/10" : "border-transparent bg-muted/40",
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelect(isCurrent ? null : item.id)}
                  className="col-start-1 row-start-1 flex min-w-0 items-center gap-2 text-left outline-none"
                >
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
                  {endsAtServiceStart ? (
                    <span className="shrink-0 rounded-md bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                      Ends at start
                    </span>
                  ) : null}
                  <span className="min-w-0 flex-1 truncate text-base font-semibold">{title}</span>
                </button>
                {onSavePersonalNote ? (
                  <div className="col-start-2 row-start-1 flex justify-end">
                    <LiveLineNote
                      key={`${personalNoteStation}:${item.id}`}
                      note={personalNotes?.get(item.id) || ""}
                      onSave={(body) => onSavePersonalNote(item.id, body)}
                    />
                  </div>
                ) : null}
                {isSong && (item.song?.bpm || item.song_key || singers) ? (
                  <button
                    type="button"
                    onClick={() => onSelect(isCurrent ? null : item.id)}
                    className="col-start-1 flex flex-wrap items-center gap-1.5 text-left"
                  >
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
                  </button>
                ) : null}
                {notes ? (
                  <button
                    type="button"
                    onClick={() => onSelect(isCurrent ? null : item.id)}
                    className="col-start-1 whitespace-pre-wrap text-left text-xs text-muted-foreground"
                  >
                    {notes}
                  </button>
                ) : null}
                {isCurrent && progress != null ? (
                  <span className="col-start-1 mt-0.5 block h-1 overflow-hidden rounded-full bg-primary/20">
                    <span
                      className="block h-full rounded-full bg-primary"
                      style={{ width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` }}
                    />
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      {songNoteEntries ? (
        <div
          ref={notesPopupRef}
          className="absolute inset-x-3 top-3 z-20 flex max-h-[min(22rem,46%)] min-h-0 flex-col"
        >
          <SongNotesStage
            entries={songNoteEntries}
            currentItemId={currentItemId}
            run={songMapRun}
            onSelect={onSelect}
          />
        </div>
      ) : null}
      </div>
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
